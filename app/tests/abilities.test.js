import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods.js';
import { RoundsCollection } from '../imports/api/rounds';
import { PlayersCollection } from '../imports/api/players';
import { RoomsCollection } from '../imports/api/rooms';
import { GameEventsCollection } from '../imports/api/gameEvents';
import { LeaderboardCollection } from '../imports/api/leaderboard';
import { playbackFor } from '../imports/api/abilityRules';

const GAME = 'ABL01';
const SEQUENCE = ['red', 'blue', 'green', 'yellow'];

if (Meteor.isServer) {
  describe('abilities', function () {
    beforeEach(async function () {
      await RoomsCollection.removeAsync({});
      await RoundsCollection.removeAsync({});
      await PlayersCollection.removeAsync({});
      await GameEventsCollection.removeAsync({});
      await LeaderboardCollection.removeAsync({});
    });

    // A game in progress with one player per entry in `lives`, named A, B, C...
    async function setupGame({
      lives = [3, 3, 3],
      abilitiesEnabled = true,
      gameMode = 'default',
      roundNumber = 2,
      startingLives = 3,
    } = {}) {
      const names = lives.map((_, i) => String.fromCharCode(65 + i));
      await RoomsCollection.insertAsync({
        pin: GAME,
        status: 'in_progress',
        gameMode,
        abilitiesEnabled,
        customSettings: { startingLives },
        players: names.map((name) => ({ id: `lobby-${name}`, name })),
      });
      const roundId = await RoundsCollection.insertAsync({
        gameId: GAME,
        gameMode,
        level: 4,
        lengthOfSequence: 4,
        sequence: SEQUENCE,
        roundNumber,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });
      const ids = {};
      for (const [i, name] of names.entries()) {
        ids[name] = await PlayersCollection.insertAsync({
          gameId: GAME,
          roundId,
          lobbyPlayerId: `lobby-${name}`,
          name,
          lives: lives[i],
          currentStreak: 0,
          longestStreak: 0,
          totalGuesses: 0,
          correctGuesses: 0,
          currentLevel: 4,
          eliminated: false,
          eliminatedRound: null,
          winner: false,
          completeRound: false,
          roundStatus: 'Playing',
          gameFinished: false,
          isBattleRoyale: gameMode === 'battle_royale',
          secret: { sequence: { roundId, colours: SEQUENCE, version: 1 }, hand: [] },
        });
      }
      return { roundId, ids };
    }

    // Open a draft on the round and deal each named player the given cards.
    async function openDraft(roundId, offers, endsInMs = 10000) {
      const endsAt = new Date(Date.now() + endsInMs);
      await RoundsCollection.updateAsync(roundId, { $set: { draft: { endsAt, resolved: false } } });
      for (const [playerId, offered] of Object.entries(offers)) {
        await PlayersCollection.updateAsync(playerId, {
          $set: { 'secret.draft': { roundId, offered, endsAt, status: 'open', pick: null } },
        });
      }
    }

    async function giveCard(playerId, type, roundId) {
      await PlayersCollection.updateAsync(playerId, {
        $push: { 'secret.hand': { id: `${type}-card`, type, roundId } },
      });
      return `${type}-card`;
    }

    const lives = async (id) => (await PlayersCollection.findOneAsync(id)).lives;
    const abilityEvents = () => GameEventsCollection.find({ type: 'ability' }).fetchAsync();

    describe('draft dealing', function () {
      it('opens a draft from round 2 with three distinct cards per player and their own sequence', async function () {
        const { roundId, ids } = await setupGame({ roundNumber: 1 });

        const nextRoundId = await Meteor.callAsync('rounds.advance', roundId);

        const round = await RoundsCollection.findOneAsync(nextRoundId);
        assert.strictEqual(round.draft.resolved, false);
        assert.ok(round.draft.endsAt > new Date());
        for (const id of Object.values(ids)) {
          const player = await PlayersCollection.findOneAsync(id);
          assert.strictEqual(player.secret.draft.roundId, nextRoundId);
          assert.strictEqual(player.secret.draft.status, 'open');
          assert.strictEqual(new Set(player.secret.draft.offered).size, 3);
          assert.ok(!player.secret.draft.offered.includes('jump'));
          assert.deepStrictEqual(player.secret.sequence.colours, round.sequence);
          assert.strictEqual(player.secret.sequence.roundId, nextRoundId);
        }
      });

      it('opens no draft when the host turned abilities off', async function () {
        const { roundId, ids } = await setupGame({ roundNumber: 1, abilitiesEnabled: false });

        const nextRoundId = await Meteor.callAsync('rounds.advance', roundId);

        const round = await RoundsCollection.findOneAsync(nextRoundId);
        assert.strictEqual(round.draft, undefined);
        const player = await PlayersCollection.findOneAsync(ids.A);
        assert.strictEqual(player.secret.draft, undefined);
      });

      it('keeps Free Pass and Jump in the hand across rounds and drops Reroll and Scramble', async function () {
        const { roundId, ids } = await setupGame({ roundNumber: 1, abilitiesEnabled: false });
        await giveCard(ids.A, 'freePass', roundId);
        await giveCard(ids.A, 'reroll', roundId);
        await giveCard(ids.A, 'scramble', roundId);

        await Meteor.callAsync('rounds.advance', roundId);

        const player = await PlayersCollection.findOneAsync(ids.A);
        assert.deepStrictEqual(
          player.secret.hand.map((card) => card.type),
          ['freePass']
        );
      });
    });

    describe('draft resolution', function () {
      it('resolves a Strike as soon as everyone has chosen', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, {
          [ids.A]: ['strike', 'shield', 'reroll'],
          [ids.B]: ['strike', 'shield', 'reroll'],
          [ids.C]: ['strike', 'shield', 'reroll'],
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'strike', ids.B);
        assert.strictEqual((await RoundsCollection.findOneAsync(roundId)).draft.resolved, false);
        await Meteor.callAsync('abilities.skip', ids.B);
        await Meteor.callAsync('abilities.skip', ids.C);

        assert.strictEqual((await RoundsCollection.findOneAsync(roundId)).draft.resolved, true);
        assert.strictEqual(await lives(ids.B), 2);
        const [event] = await abilityEvents();
        assert.strictEqual(event.ability, 'strike');
        assert.strictEqual(event.outcome, 'hit');
        assert.strictEqual(event.playerId, ids.A);
        assert.strictEqual(event.targetId, ids.B);
      });

      it('lets a Shield block both a Strike and a Steal', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, {
          [ids.A]: ['strike', 'shield', 'reroll'],
          [ids.B]: ['strike', 'shield', 'reroll'],
          [ids.C]: ['steal', 'shield', 'reroll'],
        });

        await Meteor.callAsync('abilities.pick', ids.B, 'shield');
        await Meteor.callAsync('abilities.pick', ids.A, 'strike', ids.B);
        await Meteor.callAsync('abilities.pick', ids.C, 'steal', ids.B);

        assert.strictEqual(await lives(ids.B), 3);
        assert.strictEqual(await lives(ids.C), 3);
        const outcomes = (await abilityEvents()).map((e) => e.outcome);
        assert.deepStrictEqual(outcomes, ['blocked', 'blocked']);
      });

      it('moves a life with Steal, but never takes a last life', async function () {
        const { roundId, ids } = await setupGame({ lives: [3, 2, 1] });
        await openDraft(roundId, {
          [ids.A]: ['steal', 'shield', 'reroll'],
          [ids.B]: ['steal', 'shield', 'reroll'],
          [ids.C]: ['steal', 'shield', 'reroll'],
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'steal', ids.C);
        await Meteor.callAsync('abilities.pick', ids.C, 'steal', ids.B);
        await Meteor.callAsync('abilities.skip', ids.B);

        // A's Steal on C fails (C is on 1 life when the draft closes). C's on B lands.
        assert.strictEqual(await lives(ids.A), 3);
        assert.strictEqual(await lives(ids.B), 1);
        assert.strictEqual(await lives(ids.C), 2);
        const events = await abilityEvents();
        assert.strictEqual(events.find((e) => e.playerId === ids.A).outcome, 'failed');
        assert.strictEqual(events.find((e) => e.playerId === ids.C).outcome, 'hit');
      });

      it('stacks Strikes on one target', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, {
          [ids.A]: ['strike', 'shield', 'reroll'],
          [ids.B]: ['strike', 'shield', 'reroll'],
          [ids.C]: ['strike', 'shield', 'reroll'],
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'strike', ids.B);
        await Meteor.callAsync('abilities.pick', ids.C, 'strike', ids.B);
        await Meteor.callAsync('abilities.skip', ids.B);

        assert.strictEqual(await lives(ids.B), 1);
      });

      it('eliminates with a Strike and declares the last player standing the winner', async function () {
        const { roundId, ids } = await setupGame({ lives: [3, 1] });
        await openDraft(roundId, {
          [ids.A]: ['strike', 'shield', 'reroll'],
          [ids.B]: ['strike', 'shield', 'reroll'],
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'strike', ids.B);
        await Meteor.callAsync('abilities.skip', ids.B);

        const b = await PlayersCollection.findOneAsync(ids.B);
        assert.strictEqual(b.eliminated, true);
        assert.strictEqual(b.eliminatedRound, 2);
        const a = await PlayersCollection.findOneAsync(ids.A);
        assert.strictEqual(a.winner, true);
        assert.strictEqual(a.gameFinished, true);
        assert.strictEqual((await abilityEvents())[0].outcome, 'eliminated');
      });

      it('lands both Strikes when two players knock each other out, and ties the result', async function () {
        const { roundId, ids } = await setupGame({ lives: [1, 1] });
        await openDraft(roundId, {
          [ids.A]: ['strike', 'shield', 'reroll'],
          [ids.B]: ['strike', 'shield', 'reroll'],
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'strike', ids.B);
        await Meteor.callAsync('abilities.pick', ids.B, 'strike', ids.A);

        const players = await PlayersCollection.find({ gameId: GAME }).fetchAsync();
        assert.ok(players.every((p) => p.eliminated));
        assert.ok(players.every((p) => p.winner));
      });

      it('resolves once, however many times it is asked to close', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, { [ids.A]: ['strike', 'shield', 'reroll'], [ids.B]: ['strike', 'shield', 'reroll'] });
        await Meteor.callAsync('abilities.pick', ids.A, 'strike', ids.B);
        await RoundsCollection.updateAsync(roundId, { $set: { 'draft.endsAt': new Date(Date.now() - 1) } });

        const results = await Promise.all([
          Meteor.callAsync('abilities.closeDraft', roundId),
          Meteor.callAsync('abilities.closeDraft', roundId),
        ]);

        assert.deepStrictEqual(results.sort(), [false, true]);
        assert.strictEqual(await lives(ids.B), 2);
        assert.strictEqual((await PlayersCollection.findOneAsync(ids.B)).secret.draft.status, 'expired');
      });

      it('marks the draft resolved only after every effect has landed', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, { [ids.A]: ['strike', 'shield', 'reroll'], [ids.B]: ['strike', 'shield', 'reroll'] });
        await Meteor.callAsync('abilities.pick', ids.A, 'strike', ids.B);
        // A resolution already under way (claimed, effects still landing) is left alone.
        await RoundsCollection.updateAsync(roundId, {
          $set: { 'draft.resolving': true, 'draft.endsAt': new Date(Date.now() - 1) },
        });

        assert.strictEqual(await Meteor.callAsync('abilities.closeDraft', roundId), false);
        assert.strictEqual(await lives(ids.B), 3);

        await RoundsCollection.updateAsync(roundId, { $unset: { 'draft.resolving': '' } });
        assert.strictEqual(await Meteor.callAsync('abilities.closeDraft', roundId), true);
        const round = await RoundsCollection.findOneAsync(roundId);
        assert.strictEqual(round.draft.resolved, true);
        assert.strictEqual(round.draft.resolving, undefined);
        assert.strictEqual(await lives(ids.B), 2);
      });

      it('will not close early while someone is still choosing', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, { [ids.A]: ['strike', 'shield', 'reroll'], [ids.B]: ['strike', 'shield', 'reroll'] });

        assert.strictEqual(await Meteor.callAsync('abilities.closeDraft', roundId), false);
        assert.strictEqual((await RoundsCollection.findOneAsync(roundId)).draft.resolved, false);
      });
    });

    describe('picking', function () {
      it('rejects a card that was not dealt, a self target, and a second pick', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, {
          [ids.A]: ['strike', 'shield', 'reroll'],
          [ids.B]: ['strike', 'shield', 'reroll'],
          [ids.C]: ['strike', 'shield', 'reroll'],
        });

        await assert.rejects(
          Meteor.callAsync('abilities.pick', ids.A, 'freePass'),
          (e) => e.error === 'invalid-ability'
        );
        await assert.rejects(
          Meteor.callAsync('abilities.pick', ids.A, 'strike', ids.A),
          (e) => e.error === 'invalid-target'
        );
        await Meteor.callAsync('abilities.pick', ids.A, 'shield');
        await assert.rejects(Meteor.callAsync('abilities.pick', ids.A, 'reroll'), (e) => e.error === 'already-chosen');
      });

      it('rejects a pick after the draft has closed', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, { [ids.A]: ['strike', 'shield', 'reroll'] }, -5000);

        await assert.rejects(Meteor.callAsync('abilities.pick', ids.A, 'shield'), (e) => e.error === 'draft-closed');
      });

      it('puts an in-round card in the hand', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, {
          [ids.A]: ['freePass', 'shield', 'reroll'],
          [ids.B]: ['strike', 'shield', 'reroll'],
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'freePass');

        const a = await PlayersCollection.findOneAsync(ids.A);
        assert.deepStrictEqual(
          a.secret.hand.map((card) => card.type),
          ['freePass']
        );
      });
    });

    describe('playing cards', function () {
      it('refuses to play a card while the draft is still open', async function () {
        const { roundId, ids } = await setupGame();
        const cardId = await giveCard(ids.A, 'reroll', roundId);
        await openDraft(roundId, { [ids.A]: ['strike', 'shield', 'reroll'] });

        await assert.rejects(Meteor.callAsync('abilities.use', ids.A, cardId), (e) => e.error === 'draft-open');
      });

      it('clears the round with a Free Pass, without streak or accuracy credit', async function () {
        const { roundId, ids } = await setupGame({ lives: [3, 3] });
        await PlayersCollection.updateAsync(ids.A, { $set: { currentStreak: 2 } });
        await PlayersCollection.updateAsync(ids.B, { $set: { completeRound: true, roundStatus: 'Correct' } });
        const cardId = await giveCard(ids.A, 'freePass', 'an-earlier-round');

        await Meteor.callAsync('abilities.use', ids.A, cardId);

        const oldRound = await RoundsCollection.findOneAsync(roundId);
        assert.strictEqual(oldRound.advanced, true, 'everyone has cleared the round, so it advances');
        const a = await PlayersCollection.findOneAsync(ids.A);
        assert.strictEqual(a.currentStreak, 2);
        assert.strictEqual(a.correctGuesses, 0);
        assert.strictEqual(a.totalGuesses, 0);
        assert.deepStrictEqual(a.secret.hand, []);
      });

      it('marks a Free Pass as Passed while others are still playing', async function () {
        const { roundId, ids } = await setupGame({ lives: [3, 3] });
        const cardId = await giveCard(ids.A, 'freePass', roundId);

        await Meteor.callAsync('abilities.use', ids.A, cardId);

        const a = await PlayersCollection.findOneAsync(ids.A);
        assert.strictEqual(a.completeRound, true);
        assert.strictEqual(a.roundStatus, 'Passed');
      });

      it('gives a fresh sequence with Reroll, and grading follows it', async function () {
        const { roundId, ids } = await setupGame();
        const cardId = await giveCard(ids.A, 'reroll', roundId);

        await Meteor.callAsync('abilities.use', ids.A, cardId);

        const a = await PlayersCollection.findOneAsync(ids.A);
        assert.strictEqual(a.secret.sequence.version, 2);
        assert.strictEqual(a.secret.sequence.colours.length, 4);
        const result = await Meteor.callAsync('players.submitSequence', ids.A, a.secret.sequence.colours);
        assert.strictEqual(result.success, true);
      });

      it('grades against the player own sequence, not the round copy', async function () {
        const { roundId, ids } = await setupGame();
        await PlayersCollection.updateAsync(ids.A, {
          $set: { 'secret.sequence': { roundId, colours: ['red', 'red', 'red', 'red'], version: 2 } },
        });

        const wrong = await Meteor.callAsync('players.submitSequence', ids.A, SEQUENCE);
        assert.strictEqual(wrong.success, false);
        const right = await Meteor.callAsync('players.submitSequence', ids.A, ['red', 'red', 'red', 'red']);
        assert.strictEqual(right.success, true);
      });

      it('scrambles a target, unless they are shielded', async function () {
        const { roundId, ids } = await setupGame();
        const first = await giveCard(ids.A, 'scramble', roundId);

        await Meteor.callAsync('abilities.use', ids.A, first, ids.B);
        assert.strictEqual((await PlayersCollection.findOneAsync(ids.B)).secret.sequence.version, 2);

        await PlayersCollection.updateAsync(ids.C, { $set: { 'secret.shieldRoundId': roundId } });
        const second = await giveCard(ids.A, 'scramble', roundId);
        const result = await Meteor.callAsync('abilities.use', ids.A, second, ids.C);
        assert.strictEqual(result.outcome, 'blocked');
        assert.strictEqual((await PlayersCollection.findOneAsync(ids.C)).secret.sequence.version, 1);
        assert.deepStrictEqual((await PlayersCollection.findOneAsync(ids.A)).secret.hand, []);
      });

      it('keeps the Scramble card when the target has already cleared the round', async function () {
        const { roundId, ids } = await setupGame();
        await PlayersCollection.updateAsync(ids.B, { $set: { completeRound: true } });
        const cardId = await giveCard(ids.A, 'scramble', roundId);

        await assert.rejects(
          Meteor.callAsync('abilities.use', ids.A, cardId, ids.B),
          (e) => e.error === 'target-cleared'
        );
        assert.strictEqual((await PlayersCollection.findOneAsync(ids.A)).secret.hand.length, 1);
      });

      it('refuses Jump outside Battle Royale', async function () {
        const { roundId, ids } = await setupGame();
        const cardId = await giveCard(ids.A, 'jump', roundId);

        await assert.rejects(Meteor.callAsync('abilities.use', ids.A, cardId), (e) => e.error === 'invalid-ability');
      });
    });

    describe('Battle Royale', function () {
      it('jumps to the level of a player on a different level', async function () {
        const { roundId, ids } = await setupGame({ gameMode: 'battle_royale', lives: [1, 1], startingLives: 1 });
        await PlayersCollection.updateAsync(ids.B, { $set: { currentLevel: 7 } });
        const cardId = await giveCard(ids.A, 'jump', roundId);

        const result = await Meteor.callAsync('abilities.use', ids.A, cardId);

        assert.strictEqual(result.level, 4);
        const a = await PlayersCollection.findOneAsync(ids.A);
        const round = await RoundsCollection.findOneAsync(a.roundId);
        assert.strictEqual(a.currentLevel, 7);
        assert.strictEqual(round.level, 7);
        assert.deepStrictEqual(a.secret.sequence.colours, round.sequence);
      });

      it('lands a Strike as soon as it is picked', async function () {
        const { roundId, ids } = await setupGame({ gameMode: 'battle_royale', lives: [1, 1, 1], startingLives: 1 });
        await PlayersCollection.updateAsync(ids.A, {
          $set: {
            'secret.draft': {
              roundId,
              offered: ['strike', 'shield', 'jump'],
              endsAt: new Date(Date.now() + 10000),
              status: 'open',
              pick: null,
            },
          },
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'strike', ids.B);

        assert.strictEqual((await PlayersCollection.findOneAsync(ids.B)).eliminated, true);
      });

      it('deals a draft on level-up when abilities are on', async function () {
        const { ids } = await setupGame({ gameMode: 'battle_royale', lives: [1, 1], startingLives: 1 });

        await Meteor.callAsync('players.submitSequence', ids.A, SEQUENCE);

        const a = await PlayersCollection.findOneAsync(ids.A);
        assert.strictEqual(a.currentLevel, 5);
        assert.strictEqual(a.secret.draft.roundId, a.roundId);
        assert.ok(!a.secret.draft.offered.includes('steal'), 'nobody has a spare life to steal');
        assert.strictEqual(a.secret.sequence.colours.length, 5);
      });
    });

    describe('playback cards', function () {
      const PLAYBACK_OFFER = ['slowMo', 'fastForward', 'lightsOut'];
      const playbackOf = async (id) => playbackFor(await PlayersCollection.findOneAsync(id));

      it('lands Slo-Mo on the target when the draft closes, for that round only', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, { [ids.A]: PLAYBACK_OFFER, [ids.B]: PLAYBACK_OFFER, [ids.C]: PLAYBACK_OFFER });

        await Meteor.callAsync('abilities.pick', ids.A, 'slowMo', ids.B);
        assert.deepStrictEqual(
          await playbackOf(ids.B),
          { speed: null, lightsOut: false },
          'not before the draft closes'
        );
        await Meteor.callAsync('abilities.skip', ids.B);
        await Meteor.callAsync('abilities.skip', ids.C);

        assert.deepStrictEqual(await playbackOf(ids.B), { speed: 'slow', lightsOut: false });
        assert.deepStrictEqual(await playbackOf(ids.A), { speed: null, lightsOut: false });
        const [event] = await abilityEvents();
        assert.strictEqual(event.ability, 'slowMo');
        assert.strictEqual(event.outcome, 'hit');
        assert.strictEqual(event.targetId, ids.B);

        await Meteor.callAsync('rounds.advance', roundId);
        assert.deepStrictEqual(await playbackOf(ids.B), { speed: null, lightsOut: false }, 'lapses next round');
      });

      it('stacks Lights Out with a speed change, but misses with a second speed change', async function () {
        const { roundId, ids } = await setupGame({ lives: [3, 3, 3, 3] });
        await openDraft(roundId, {
          [ids.A]: PLAYBACK_OFFER,
          [ids.B]: PLAYBACK_OFFER,
          [ids.C]: PLAYBACK_OFFER,
          [ids.D]: PLAYBACK_OFFER,
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'fastForward', ids.D);
        await Meteor.callAsync('abilities.pick', ids.B, 'slowMo', ids.D);
        await Meteor.callAsync('abilities.pick', ids.C, 'lightsOut', ids.D);
        await Meteor.callAsync('abilities.skip', ids.D);

        assert.deepStrictEqual(await playbackOf(ids.D), { speed: 'fast', lightsOut: true });
        const outcomes = Object.fromEntries((await abilityEvents()).map((e) => [e.ability, e.outcome]));
        assert.deepStrictEqual(outcomes, { fastForward: 'hit', slowMo: 'failed', lightsOut: 'hit' });
      });

      it('is blocked by a Shield', async function () {
        const { roundId, ids } = await setupGame();
        await openDraft(roundId, {
          [ids.A]: PLAYBACK_OFFER,
          [ids.B]: ['shield', 'strike', 'reroll'],
          [ids.C]: PLAYBACK_OFFER,
        });

        await Meteor.callAsync('abilities.pick', ids.B, 'shield');
        await Meteor.callAsync('abilities.pick', ids.A, 'lightsOut', ids.B);
        await Meteor.callAsync('abilities.pick', ids.C, 'slowMo', ids.B);

        assert.deepStrictEqual(await playbackOf(ids.B), { speed: null, lightsOut: false });
        assert.deepStrictEqual(
          (await abilityEvents()).map((e) => e.outcome),
          ['blocked', 'blocked']
        );
      });

      it('misses a player struck out in the same draft', async function () {
        const { roundId, ids } = await setupGame({ lives: [3, 1, 3] });
        await openDraft(roundId, {
          [ids.A]: PLAYBACK_OFFER,
          [ids.B]: PLAYBACK_OFFER,
          [ids.C]: ['strike', 'shield', 'reroll'],
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'slowMo', ids.B);
        await Meteor.callAsync('abilities.pick', ids.C, 'strike', ids.B);
        await Meteor.callAsync('abilities.skip', ids.B);

        const outcomes = Object.fromEntries((await abilityEvents()).map((e) => [e.ability, e.outcome]));
        assert.deepStrictEqual(outcomes, { strike: 'eliminated', slowMo: 'failed' });
      });

      it('waits for the target next level in Battle Royale', async function () {
        const { roundId, ids } = await setupGame({ gameMode: 'battle_royale', lives: [1, 1], startingLives: 1 });
        await PlayersCollection.updateAsync(ids.A, {
          $set: {
            'secret.draft': {
              roundId,
              offered: PLAYBACK_OFFER,
              endsAt: new Date(Date.now() + 10000),
              status: 'open',
              pick: null,
            },
          },
        });

        await Meteor.callAsync('abilities.pick', ids.A, 'lightsOut', ids.B);

        assert.deepStrictEqual(
          await playbackOf(ids.B),
          { speed: null, lightsOut: false },
          'not on the level under way'
        );
        const [event] = await abilityEvents();
        assert.strictEqual(event.outcome, 'hit');
        assert.strictEqual(event.pending, true);

        await Meteor.callAsync('players.submitSequence', ids.B, SEQUENCE);

        const b = await PlayersCollection.findOneAsync(ids.B);
        assert.strictEqual(b.currentLevel, 5);
        assert.deepStrictEqual(playbackFor(b), { speed: null, lightsOut: true });
      });
    });

    describe('rooms.setAbilities', function () {
      it('toggles abilities in the lobby only', async function () {
        await RoomsCollection.insertAsync({ pin: 'LOBBY', status: 'lobby', players: [] });

        await Meteor.callAsync('rooms.setAbilities', 'LOBBY', false);
        assert.strictEqual((await RoomsCollection.findOneAsync({ pin: 'LOBBY' })).abilitiesEnabled, false);

        await assert.rejects(Meteor.callAsync('rooms.setAbilities', 'LOBBY', 'yes'), (e) => e.error === 'invalid');
        await RoomsCollection.updateAsync({ pin: 'LOBBY' }, { $set: { status: 'in_progress' } });
        await assert.rejects(Meteor.callAsync('rooms.setAbilities', 'LOBBY', true), (e) => e.error === 'not-lobby');
      });
    });
  });
}
