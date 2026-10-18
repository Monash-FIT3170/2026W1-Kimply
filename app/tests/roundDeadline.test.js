import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods.js';
import { RoundsCollection } from '../imports/api/rounds.js';
import { PlayersCollection } from '../imports/api/players.js';
import { RoomsCollection } from '../imports/api/rooms.js';
import { expireRound, startRoundClock, sweepRoundDeadlines } from '../imports/api/gameEngine.js';
import { resolveRoundDraft } from '../imports/api/abilityEngine.js';
import { ROUND_EXPIRE_GRACE_MS, ROUND_START_FALLBACK_MS, ROUND_TIMER_SECONDS } from '../imports/constants.js';

if (Meteor.isServer) {
  describe('the round clock', function () {
    const gameId = 'CLOCK';
    const colours = ['red', 'blue', 'green', 'yellow'];
    const past = (ms) => new Date(Date.now() - ms);

    // A round whose deadline passed far enough ago for the server to enforce it.
    const overdue = () => past(ROUND_EXPIRE_GRACE_MS + 5000);

    const insertRoom = (lobbyIds, extra = {}) =>
      RoomsCollection.insertAsync({
        pin: gameId,
        status: 'in_progress',
        hostName: 'host',
        players: lobbyIds.map((id) => ({ id, name: id })),
        ...extra,
      });

    const insertRound = (extra = {}) =>
      RoundsCollection.insertAsync({
        gameId,
        lengthOfSequence: 4,
        level: 4,
        sequence: colours,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
        roundNumber: 1,
        ...extra,
      });

    const insertPlayer = (roundId, lobbyPlayerId, extra = {}) =>
      PlayersCollection.insertAsync({
        gameId,
        roundId,
        lobbyPlayerId,
        name: lobbyPlayerId,
        lives: 3,
        eliminated: false,
        completeRound: false,
        winner: false,
        gameFinished: false,
        currentStreak: 0,
        longestStreak: 0,
        ...extra,
      });

    beforeEach(async function () {
      await RoundsCollection.removeAsync({});
      await PlayersCollection.removeAsync({});
      await RoomsCollection.removeAsync({});
    });

    describe('starting it', function () {
      it('starts a round created with deadlineAt null, once', async function () {
        const roundId = await insertRound({ deadlineAt: null });
        const now = Date.now();

        const first = await startRoundClock(roundId, now);
        const second = await startRoundClock(roundId, now + 10000);

        assert.strictEqual(first.getTime(), now + ROUND_TIMER_SECONDS * 1000);
        assert.strictEqual(second, null);
        const round = await RoundsCollection.findOneAsync(roundId);
        assert.strictEqual(round.deadlineAt.getTime(), first.getTime());
      });

      it('leaves a round with no deadlineAt field without a clock', async function () {
        const roundId = await insertRound();
        assert.strictEqual(await startRoundClock(roundId), null);
        assert.strictEqual((await RoundsCollection.findOneAsync(roundId)).deadlineAt, undefined);
      });

      it('gives a standard round 1 a pending clock, and Battle Royale none', async function () {
        await insertRoom(['a'], { gameMode: 'default' });
        const standardId = await Meteor.callAsync('rounds.generate', gameId);
        const standard = await RoundsCollection.findOneAsync(standardId);
        assert.strictEqual(standard.deadlineAt, null);

        await RoomsCollection.updateAsync({ pin: gameId }, { $set: { gameMode: 'battle_royale' } });
        const royaleId = await Meteor.callAsync('rounds.generate', gameId);
        const royale = await RoundsCollection.findOneAsync(royaleId);
        assert.strictEqual(royale.deadlineAt, undefined);
      });

      it('starts round 1 when the last lobby member joins, not before', async function () {
        await insertRoom(['a', 'b']);
        const roundId = await insertRound({ deadlineAt: null });

        await Meteor.callAsync('players.join', roundId, 'a', gameId, 'a');
        assert.strictEqual((await RoundsCollection.findOneAsync(roundId)).deadlineAt, null);

        await Meteor.callAsync('players.join', roundId, 'b', gameId, 'b');
        const round = await RoundsCollection.findOneAsync(roundId);
        assert.ok(round.deadlineAt instanceof Date);
      });

      it('starts round 1 from the sweep when the fallback timer was lost', async function () {
        await insertRoom(['a', 'b']);
        const fresh = await insertRound({ deadlineAt: null });
        await sweepRoundDeadlines();
        assert.strictEqual((await RoundsCollection.findOneAsync(fresh)).deadlineAt, null);

        await RoundsCollection.updateAsync(fresh, { $set: { createdAt: past(ROUND_START_FALLBACK_MS + 1000) } });
        await sweepRoundDeadlines();
        assert.ok((await RoundsCollection.findOneAsync(fresh)).deadlineAt instanceof Date);
      });

      it('gives the next round a deadline, or waits for the draft when it has one', async function () {
        await insertRoom(['a']);
        const plain = await insertRound({ deadlineAt: new Date(Date.now() + 60000) });
        const plainNext = await RoundsCollection.findOneAsync(await Meteor.callAsync('rounds.advance', plain));
        assert.ok(plainNext.deadlineAt instanceof Date);

        await RoomsCollection.updateAsync({ pin: gameId }, { $set: { abilitiesEnabled: true } });
        const withDraft = await insertRound({ deadlineAt: new Date(Date.now() + 60000) });
        const draftNext = await RoundsCollection.findOneAsync(await Meteor.callAsync('rounds.advance', withDraft));
        assert.ok(draftNext.draft);
        assert.strictEqual(draftNext.deadlineAt, null);
      });

      it('starts the clock in the write that closes the draft', async function () {
        await insertRoom(['a']);
        const roundId = await insertRound({
          roundNumber: 2,
          deadlineAt: null,
          draft: { endsAt: new Date(), resolved: false },
        });

        await resolveRoundDraft(roundId);

        const round = await RoundsCollection.findOneAsync(roundId);
        assert.strictEqual(round.draft.resolved, true);
        assert.ok(round.deadlineAt instanceof Date);
      });
    });

    describe('expireRound', function () {
      it('does nothing before the deadline, or within the grace for answers in flight', async function () {
        await insertRoom(['a', 'b']);
        const roundId = await insertRound({ deadlineAt: new Date(Date.now() + 5000) });
        const slow = await insertPlayer(roundId, 'a');

        assert.strictEqual(await expireRound(roundId), false);
        await RoundsCollection.updateAsync(roundId, { $set: { deadlineAt: past(ROUND_EXPIRE_GRACE_MS - 500) } });
        assert.strictEqual(await expireRound(roundId), false);
        assert.strictEqual((await PlayersCollection.findOneAsync(slow)).eliminated, false);
      });

      it('eliminates only the players who have not cleared the round, then advances', async function () {
        await insertRoom(['a', 'b', 'c']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        const cleared = await insertPlayer(roundId, 'a', { completeRound: true });
        const frozen = await insertPlayer(roundId, 'b', { currentStreak: 2 });
        const alsoCleared = await insertPlayer(roundId, 'c', { completeRound: true });

        assert.strictEqual(await expireRound(roundId), true);

        const out = await PlayersCollection.findOneAsync(frozen);
        assert.strictEqual(out.eliminated, true);
        assert.strictEqual(out.lives, 0);
        assert.strictEqual(out.roundStatus, 'Eliminated');
        assert.strictEqual(out.eliminatedRound, 1);
        assert.strictEqual(out.longestStreak, 2);
        for (const id of [cleared, alsoCleared]) {
          const kept = await PlayersCollection.findOneAsync(id);
          assert.strictEqual(kept.eliminated, false);
          assert.notStrictEqual(kept.roundId, roundId, 'a player who cleared it moves to the next round');
        }
        const round = await RoundsCollection.findOneAsync(roundId);
        assert.strictEqual(round.advanced, true);
        assert.ok(round.expiredAt);
        assert.strictEqual(round.expiringUntil, undefined);
      });

      it('is idempotent', async function () {
        await insertRoom(['a', 'b', 'c']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        await insertPlayer(roundId, 'a', { completeRound: true });
        await insertPlayer(roundId, 'b', { completeRound: true });
        await insertPlayer(roundId, 'c');

        assert.strictEqual(await expireRound(roundId), true);
        assert.strictEqual(await expireRound(roundId), false);
        assert.strictEqual(await RoundsCollection.find({ gameId }).countAsync(), 2, 'one next round, not two');
      });

      it('lets only one of several simultaneous callers finish the round', async function () {
        await insertRoom(['a', 'b', 'c']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        await insertPlayer(roundId, 'a', { completeRound: true });
        await insertPlayer(roundId, 'b', { completeRound: true });
        await insertPlayer(roundId, 'c');

        const ran = await Promise.all([expireRound(roundId), expireRound(roundId), expireRound(roundId)]);

        assert.strictEqual(ran.filter(Boolean).length, 1);
        assert.strictEqual(await RoundsCollection.find({ gameId }).countAsync(), 2);
      });

      it('drops a lobby member who never joined, which would otherwise hold the round forever', async function () {
        await insertRoom(['a', 'b', 'never-joined']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        await insertPlayer(roundId, 'a', { completeRound: true });
        await insertPlayer(roundId, 'b', { completeRound: true });

        await expireRound(roundId);

        const room = await RoomsCollection.findOneAsync({ pin: gameId });
        assert.deepStrictEqual(room.players.map((p) => p.id).sort(), ['a', 'b']);
        assert.strictEqual((await RoundsCollection.findOneAsync(roundId)).advanced, true);
      });

      it('declares the last player standing the winner', async function () {
        await insertRoom(['a', 'b']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        const cleared = await insertPlayer(roundId, 'a', { completeRound: true });
        await insertPlayer(roundId, 'b');

        await expireRound(roundId);

        const winner = await PlayersCollection.findOneAsync(cleared);
        assert.strictEqual(winner.winner, true);
        assert.strictEqual(winner.gameFinished, true);
      });

      it('leaves a finished game alone but still marks the round handled', async function () {
        await insertRoom(['a', 'b']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        await insertPlayer(roundId, 'a', { completeRound: true, winner: true, gameFinished: true });
        const other = await insertPlayer(roundId, 'b', { gameFinished: true });

        await expireRound(roundId);

        assert.strictEqual((await PlayersCollection.findOneAsync(other)).eliminated, false);
        assert.ok((await RoundsCollection.findOneAsync(roundId)).expiredAt);
      });

      it('retries a round whose earlier call died holding the lease', async function () {
        await insertRoom(['a', 'b']);
        const roundId = await insertRound({ deadlineAt: overdue(), expiringUntil: new Date(Date.now() + 60000) });
        await insertPlayer(roundId, 'a', { completeRound: true });
        await insertPlayer(roundId, 'b');

        assert.strictEqual(await expireRound(roundId), false, 'a live lease is respected');
        await RoundsCollection.updateAsync(roundId, { $set: { expiringUntil: past(1000) } });
        assert.strictEqual(await expireRound(roundId), true, 'an expired lease is taken over');
      });

      it('is asked for by a client through rounds.expire, which checks the deadline itself', async function () {
        await insertRoom(['a', 'b']);
        const roundId = await insertRound({ deadlineAt: new Date(Date.now() + 30000) });
        const slow = await insertPlayer(roundId, 'a');

        assert.strictEqual(await Meteor.callAsync('rounds.expire', roundId), false);
        assert.strictEqual((await PlayersCollection.findOneAsync(slow)).eliminated, false);

        await RoundsCollection.updateAsync(roundId, { $set: { deadlineAt: overdue() } });
        assert.strictEqual(await Meteor.callAsync('rounds.expire', roundId), true);
        assert.strictEqual((await PlayersCollection.findOneAsync(slow)).eliminated, true);
        await assert.rejects(Meteor.callAsync('rounds.expire', ''), (error) => error.error === 'invalid');
      });
    });

    describe('after the deadline', function () {
      it('rejects an answer that arrives late and eliminates the player instead', async function () {
        await insertRoom(['a', 'b']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        const late = await insertPlayer(roundId, 'a', { secret: { sequence: { roundId, colours, version: 1 } } });
        await insertPlayer(roundId, 'b', { completeRound: true });

        await assert.rejects(
          Meteor.callAsync('players.submitSequence', late, colours),
          (error) => error.error === 'round-expired'
        );

        const player = await PlayersCollection.findOneAsync(late);
        assert.strictEqual(player.eliminated, true);
        assert.strictEqual(player.completeRound, false, 'a correct answer must not bring them back');
      });

      it('rejects an answer from a player the clock already eliminated', async function () {
        await insertRoom(['a']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        const out = await insertPlayer(roundId, 'a', { eliminated: true, lives: 0 });

        await assert.rejects(
          Meteor.callAsync('players.submitSequence', out, colours),
          (error) => error.error === 'not-playing'
        );
        assert.strictEqual((await PlayersCollection.findOneAsync(out)).completeRound, false);
      });

      it('accepts an answer that lands inside the grace window', async function () {
        await insertRoom(['a', 'b']);
        const roundId = await insertRound({ deadlineAt: past(500) });
        const inFlight = await insertPlayer(roundId, 'a', { secret: { sequence: { roundId, colours, version: 1 } } });
        await insertPlayer(roundId, 'b');

        const result = await Meteor.callAsync('players.submitSequence', inFlight, colours);

        assert.strictEqual(result.success, true);
      });

      it('refuses to open an attempt', async function () {
        await insertRoom(['a']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        const late = await insertPlayer(roundId, 'a', { secret: { sequence: { roundId, colours, version: 1 } } });

        await assert.rejects(
          Meteor.callAsync('players.startAttempt', late, roundId),
          (error) => error.error === 'round-expired'
        );
      });

      it('has the sweep expire a round whose timer was lost to a restart', async function () {
        await insertRoom(['a', 'b', 'c']);
        const roundId = await insertRound({ deadlineAt: overdue() });
        await insertPlayer(roundId, 'a', { completeRound: true });
        await insertPlayer(roundId, 'b', { completeRound: true });
        const frozen = await insertPlayer(roundId, 'c');

        await sweepRoundDeadlines();

        assert.strictEqual((await PlayersCollection.findOneAsync(frozen)).eliminated, true);
        assert.strictEqual((await RoundsCollection.findOneAsync(roundId)).advanced, true);
      });

      it('has the sweep ignore rounds with no deadline, or one still ahead', async function () {
        await insertRoom(['a']);
        const noClock = await insertRound();
        const ahead = await insertRound({ roundNumber: 2, deadlineAt: new Date(Date.now() + 30000) });
        const waiting = await insertRound({ roundNumber: 3, deadlineAt: null });
        const player = await insertPlayer(noClock, 'a');

        await sweepRoundDeadlines();

        assert.strictEqual((await PlayersCollection.findOneAsync(player)).eliminated, false);
        for (const id of [noClock, ahead, waiting]) {
          assert.strictEqual((await RoundsCollection.findOneAsync(id)).expiredAt, undefined);
        }
      });
    });
  });
}
