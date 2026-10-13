import { Meteor } from 'meteor/meteor';
import { createHash } from 'crypto';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';
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

function reconnectHash(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Meteor.Error('not-yours', 'Your game reconnect credential is missing or invalid');
  }
  return createHash('sha256').update(token).digest('hex');
}

async function rebindPlayer(player, connectionId, token) {
  const hash = reconnectHash(token);
  // A player created before credentials existed can enroll only on its owning
  // connection. Knowing a public player or lobby ID never grants that right.
  const enroll = !player.reconnectTokenHash && connectionId && player.connectionId === connectionId;
  const selector = enroll
    ? { _id: player._id, connectionId, reconnectTokenHash: { $exists: false } }
    : { _id: player._id, reconnectTokenHash: hash };
  const updated = await PlayersCollection.updateAsync(selector, {
    $set: { connectionId, connected: true, ...(enroll ? { reconnectTokenHash: hash } : {}) },
  });
  if (!updated) throw new Meteor.Error('not-yours', 'This reconnect credential does not belong to that player');
}

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
      accountId = null,
      reconnectToken = null
    ) {
      const connectionId = this.connection?.id ?? null;
      const room = await RoomsCollection.findOneAsync({ pin: gameId });
      const round = await RoundsCollection.findOneAsync(roundId);
      if (connectionId) {
        if (!room || !round || round.gameId !== gameId) {
          throw new Meteor.Error('invalid-game', 'Choose a round in your game');
        }
        // Older callers omit the lobby ID. Derive it only from their own room
        // membership, rather than allowing another unbound player to be minted.
        if (!lobbyPlayerId) {
          lobbyPlayerId = room.players?.find((p) => p.connectionId === connectionId && p.name === playerName)?.id;
          if (!lobbyPlayerId) throw new Meteor.Error('not-yours', 'Join the lobby before entering the game');
        }
      }
      if (lobbyPlayerId) {
        const existing = await PlayersCollection.findOneAsync({ gameId, lobbyPlayerId });
        if (existing) {
          await rebindPlayer(existing, connectionId, reconnectToken);
          return existing._id;
        }
      }

      if (connectionId && lobbyPlayerId) {
        const member = room?.players?.find((p) => p.id === lobbyPlayerId);
        if (!member || member.connectionId !== connectionId) {
          throw new Meteor.Error('not-yours', 'That lobby player does not belong to your connection');
        }
      }
      const reconnectTokenHash = connectionId || reconnectToken ? reconnectHash(reconnectToken) : null;
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
        eliminatedAt: null,
        connectionId,
        connected: true,
        ...(reconnectTokenHash ? { reconnectTokenHash } : {}),
        // Only ever published to this player's own connection (players.secret).
        secret: { sequence: round ? sequenceState(roundId, round.sequence) : null, hand: [] },
      });
    },

    // Point a player at the caller's connection again. A DDP reconnect opens a new
    // connection, and without this the disconnect grace timer removes the player.
    async 'players.rebind'(playerId, reconnectToken) {
      if (typeof playerId !== 'string' || !playerId) throw new Meteor.Error('invalid', 'Invalid player');
      const connectionId = this.connection?.id ?? null;
      const player = await PlayersCollection.findOneAsync(playerId);
      if (!player) throw new Meteor.Error('not-found', 'Player not found');
      await rebindPlayer(player, connectionId, reconnectToken);
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
        const { nextRoundId, lifeAward } = await clearRound(player, round, { credited: true, attemptedSequence });
        if (nextRoundId) await dealLevelUpDraft(playerId);
        return { success: true, sequenceComplete: true, lifeAward };
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

      // Claim the advance atomically. Two final answers landing together both pass a
      // read-then-check, and each then inserted its own next round (D4). Only the call
      // whose update flips `advanced` goes on to create the next round.
      const claimed = await RoundsCollection.updateAsync(
        { _id: currentRoundId, advanced: { $ne: true } },
        { $set: { advanced: true, isCurrent: false } }
      );
      if (!claimed) return;

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
            'secret.sequence': sequenceState(nextRoundId, nextSequence),
          },
          // Reroll and Scramble only last the round they were dealt for.
          $pull: { 'secret.hand': ROUND_ONLY_CARDS },
        },
        { multi: true }
      );

      if (draft) await dealRoundDrafts(nextRoundId);

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
