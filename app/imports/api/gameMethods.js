import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';
import { GameEventsCollection } from './gameEvents';
import { RoomsCollection } from './rooms';
import {
  advanceRoundIfReady,
  checkWinner,
  clearRound,
  generateSequence,
  loseLife,
  roundLevel,
  sequenceFor,
  sequenceState,
  ROUND_ONLY_CARDS,
} from './gameEngine';
import { dealLevelUpDraft, dealRoundDrafts, gameContext, newRoundDraft } from './abilityEngine';
import './abilities';
import { DEFAULT_SEQUENCE_LENGTH, DEFAULT_STARTING_LIVES, INITIAL_LEVEL, DISCONNECT_GRACE_MS } from '../constants';

if (Meteor.isServer && !global._gameMethodsInitialized) {
  global._gameMethodsInitialized = true;
  Meteor.methods({
    // Generate a new round with a colour sequence
    async 'rounds.generate'(gameId = null) {
      const room = await RoomsCollection.findOneAsync({ pin: gameId });
      const length = room?.customSettings?.startingSequenceLength
        ? room.customSettings.startingSequenceLength
        : DEFAULT_SEQUENCE_LENGTH;
      const sequenceGrowth = room?.customSettings?.sequenceGrowth ?? 1;
      const startingLives = room?.customSettings?.startingLives ?? DEFAULT_STARTING_LIVES;

      const sequence = generateSequence(length);

      return RoundsCollection.insertAsync({
        gameId,
        gameMode: room?.gameMode ?? 'default',
        level: length, // level matches sequence length
        lengthOfSequence: length,
        lives: startingLives,
        sequenceGrowth,
        sequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
        roundNumber: 1,
      });
    },

    // Add a player to a round
    async 'players.join'(
      roundId,
      playerName,
      gameId = null,
      lobbyPlayerId = null,
      isBattleRoyale = false,
      accountId = null
    ) {
      const connectionId = this.connection?.id ?? null;
      if (lobbyPlayerId) {
        const existing = await PlayersCollection.findOneAsync({ gameId, lobbyPlayerId });
        if (existing) {
          await PlayersCollection.updateAsync(existing._id, { $set: { connectionId, connected: true } });
          return existing._id;
        }
      }

      const room = await RoomsCollection.findOneAsync({ pin: gameId });
      const round = await RoundsCollection.findOneAsync(roundId);
      const startingLives = room?.customSettings?.startingLives
        ? room.customSettings.startingLives
        : DEFAULT_STARTING_LIVES;

      return PlayersCollection.insertAsync({
        gameId,
        roundId,
        lobbyPlayerId,
        name: playerName,
        accountId: typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null,
        lives: startingLives,
        attemptedSequence: [],
        currentStreak: 0,
        longestStreak: 0,
        totalGuesses: 0,
        correctGuesses: 0,
        currentLevel: INITIAL_LEVEL,
        eliminatedRound: null,
        eliminated: false,
        winner: false,
        completeRound: false,
        roundStatus: 'Playing',
        gameFinished: false,
        isBattleRoyale,
        slowMotionActive: false,
        eliminatedAt: null,
        connectionId,
        connected: true,
        // Only ever published to this player's own connection (players.secret).
        secret: { sequence: round ? sequenceState(roundId, round.sequence) : null, hand: [] },
      });
    },

    // Point a player at the caller's connection again. A DDP reconnect opens a new
    // connection, and without this the disconnect grace timer removes the player.
    async 'players.rebind'(playerId) {
      if (typeof playerId !== 'string' || !playerId) throw new Meteor.Error('invalid', 'Invalid player');
      const connectionId = this.connection?.id ?? null;
      const updated = await PlayersCollection.updateAsync(playerId, { $set: { connectionId, connected: true } });
      if (!updated) throw new Meteor.Error('not-found', 'Player not found');
      return true;
    },

    // Submit a player's attempted sequence
    async 'players.submitSequence'(playerId, attemptedSequence) {
      // get player and current round
      const player = await PlayersCollection.findOneAsync(playerId);
      const round = await RoundsCollection.findOneAsync(player.roundId);
      const isBattleRoyale = player.isBattleRoyale ?? false;

      // compare submitted sequence with the player's own sequence
      const correct = JSON.stringify(attemptedSequence) === JSON.stringify(sequenceFor(player, round));

      if (correct) {
        const { nextRoundId } = await clearRound(player, round, { credited: true, attemptedSequence });
        if (nextRoundId) await dealLevelUpDraft(playerId);
        return { success: true, sequenceComplete: true };
      }

      // remove one life for wrong sequence
      await PlayersCollection.updateAsync(playerId, {
        $set: {
          attemptedSequence,
          currentStreak: 0,
          longestStreak: Math.max(player.longestStreak ?? 0, player.currentStreak ?? 0),
          currentLevel: round.level ?? round.lengthOfSequence,
          roundStatus: 'Playing', // loseLife switches it to 'Eliminated' on the last life
        },
        $inc: { totalGuesses: 1 },
      });
      const { lives: remainingLives } = await loseLife(playerId, round);

      await checkWinner(player.gameId, isBattleRoyale);

      if (!isBattleRoyale) {
        const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
        await advanceRoundIfReady(updatedRound);
      }

      return {
        success: false,
        sequenceComplete: false,
        remainingLives: remainingLives ?? 0,
      };
    },

    // Deduct a life when a player runs out of time on their turn
    async 'players.timeoutTurn'(playerId) {
      const player = await PlayersCollection.findOneAsync(playerId);
      if (!player || player.eliminated || player.winner || player.gameFinished) {
        return { ignored: true };
      }

      const round = await RoundsCollection.findOneAsync(player.roundId);
      if (!round) {
        throw new Meteor.Error('round-not-found', 'Current round does not exist');
      }

      const isBattleRoyale = player.isBattleRoyale ?? false;

      await PlayersCollection.updateAsync(playerId, {
        $set: {
          currentStreak: 0,
          longestStreak: Math.max(player.longestStreak ?? 0, player.currentStreak ?? 0),
          attemptedSequence: [],
          completeRound: false,
          currentLevel: round.level ?? round.lengthOfSequence,
          roundStatus: 'Playing', // loseLife switches it to 'Eliminated' on the last life
        },
        $inc: { totalGuesses: 1 },
      });
      const { lives: remainingLives, eliminated } = await loseLife(playerId, round);

      await checkWinner(player.gameId, isBattleRoyale);

      if (!isBattleRoyale) {
        const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
        await advanceRoundIfReady(updatedRound);
      }

      return {
        success: true,
        remainingLives: remainingLives ?? 0,
        eliminated,
      };
    },

    // Round timer ran out: eliminate the player so the round can advance.
    async 'players.timeoutRound'(playerId, timeoutRoundId) {
      const player = await PlayersCollection.findOneAsync(playerId);

      if (!player || player.roundId !== timeoutRoundId) {
        return { ignored: true };
      }

      if (!player || player.eliminated || player.winner || player.gameFinished || player.completeRound) {
        return { ignored: true };
      }
      const round = await RoundsCollection.findOneAsync(player.roundId);
      const isBattleRoyale = player.isBattleRoyale ?? false;
      const longestStreak = Math.max(player.longestStreak ?? 0, player.currentStreak ?? 0);

      await PlayersCollection.updateAsync(playerId, {
        $set: {
          lives: 0,
          currentStreak: 0,
          longestStreak,
          eliminated: true,
          roundStatus: 'Eliminated',
          eliminatedRound: round ? roundLevel(round) : (player.eliminatedRound ?? 0),
          eliminatedAt: new Date(),
        },
      });

      await checkWinner(player.gameId, isBattleRoyale);
      if (!isBattleRoyale) {
        const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
        if (updatedRound) await advanceRoundIfReady(updatedRound);
      }
      return { success: true, eliminated: true };
    },

    // Let a spectator stop watching without keeping the remaining players waiting.
    async 'players.leaveGame'(playerId) {
      const player = await PlayersCollection.findOneAsync(playerId);
      if (!player) throw new Meteor.Error('not-found', 'Player not found');

      const round = await RoundsCollection.findOneAsync(player.roundId);

      await PlayersCollection.updateAsync(player._id, {
        $set: {
          eliminated: true,
          completeRound: false,
          roundStatus: 'Eliminated',
          currentLevel: round?.level ?? round?.lengthOfSequence ?? player.currentLevel,
          eliminatedRound: player.eliminatedRound ?? (round ? roundLevel(round) : undefined),
          eliminatedAt: new Date(),
        },
      });

      await checkWinner(player.gameId, player.isBattleRoyale ?? false);
      if (round) await advanceRoundIfReady(round);

      return true;
    },

    // advance game to next round
    async 'rounds.advance'(currentRoundId) {
      // get current round
      const currentRound = await RoundsCollection.findOneAsync(currentRoundId);

      if (!currentRound) {
        throw new Meteor.Error('round-not-found', 'Current round does not exist');
      }

      // prevent duplicate advancement
      if (currentRound.advanced) return;

      // mark current round as completed
      await RoundsCollection.updateAsync(currentRoundId, {
        $set: {
          advanced: true,
          isCurrent: false,
        },
      });

      // increase sequence size for next round
      const room = await RoomsCollection.findOneAsync({ pin: currentRound.gameId });
      const sequenceGrowth = currentRound.sequenceGrowth ?? room?.customSettings?.sequenceGrowth ?? 1;
      const nextLength = currentRound.lengthOfSequence + sequenceGrowth;
      const nextSequence = generateSequence(nextLength);
      const nextRoundNumber = (currentRound.roundNumber ?? 1) + 1;
      // Set on insert, so no client starts the sequence before it sees the draft.
      const draft = newRoundDraft(await gameContext(currentRound.gameId), nextRoundNumber);

      // create next round
      const nextRoundId = await RoundsCollection.insertAsync({
        gameId: currentRound.gameId,
        gameMode: currentRound.gameMode ?? room?.gameMode ?? 'default',
        level: nextLength,
        lengthOfSequence: nextLength,
        lives: currentRound.lives ?? room?.customSettings?.startingLives ?? DEFAULT_STARTING_LIVES,
        sequenceGrowth,
        sequence: nextSequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
        roundNumber: nextRoundNumber,
        ...(draft ? { draft } : {}),
      });

      const grantsSlowMotion = currentRound.roundNumber === 5;

      // move active players into next round
      await PlayersCollection.updateAsync(
        {
          roundId: currentRoundId,
          eliminated: false,
        },
        {
          $set: {
            roundId: nextRoundId,
            completeRound: false,
            roundStatus: 'Playing',
            attemptedSequence: [],
            slowMotionActive: grantsSlowMotion,
            'secret.sequence': sequenceState(nextRoundId, nextSequence),
          },
          // Reroll and Scramble only last the round they were dealt for.
          $pull: { 'secret.hand': ROUND_ONLY_CARDS },
        },
        { multi: true }
      );

      if (draft) await dealRoundDrafts(nextRoundId);

      // announce the level-up for everyone who advanced
      const movedPlayers = await PlayersCollection.find({
        roundId: nextRoundId,
        eliminated: false,
      }).fetchAsync();

      for (const player of movedPlayers) {
        await GameEventsCollection.insertAsync({
          gameId: currentRound.gameId,
          type: 'level-up',
          playerId: player._id,
          playerName: player.name,
          level: nextRoundNumber,
          createdAt: new Date(),
        });
      }

      return nextRoundId;
    },

    // Reset sequence after game ends
    async 'game.resetSequences'(gameId) {
      await RoundsCollection.removeAsync({ gameId });
    },
  });

  // Remove a player who disconnects and does not reconnect within the grace
  // window, so a leaver does not stall the round for everyone else.
  Meteor.onConnection((connection) => {
    connection.onClose(() => {
      const closedId = connection.id;

      // Flag as disconnected right away. In the lobby the player is kept and
      // pruned at rooms.start; in game they are grace-removed below unless they
      // reconnect (which flips connected back to true).
      (async () => {
        await RoomsCollection.updateAsync(
          { status: 'lobby', 'players.connectionId': closedId },
          { $set: { 'players.$.connected': false } }
        );
        await PlayersCollection.updateAsync({ connectionId: closedId }, { $set: { connected: false } });
      })();

      Meteor.setTimeout(async () => {
        const gone = await PlayersCollection.find({
          connectionId: closedId,
          connected: false,
          eliminated: false,
          gameFinished: false,
        }).fetchAsync();
        for (const p of gone) {
          await PlayersCollection.removeAsync(p._id);
          await LeaderboardCollection.removeAsync({ gameId: p.gameId, playerId: p._id });
          if (p.lobbyPlayerId) {
            await RoomsCollection.updateAsync({ pin: p.gameId }, { $pull: { players: { id: p.lobbyPlayerId } } });
          }
          await checkWinner(p.gameId, p.isBattleRoyale ?? false);
          const round = await RoundsCollection.findOneAsync(p.roundId);
          if (round) await advanceRoundIfReady(round);
        }
      }, DISCONNECT_GRACE_MS);
    });
  });
}
