import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';
import { PlayerAccountsCollection } from './playerAccounts';
import { GlobalLeaderboardCollection } from './globalLeaderboard';

const COLOURS = ['red', 'blue', 'green', 'yellow'];
const GLOBAL_LEADERBOARD_SIZE = 50;

// generate random colour sequence
function generateSequence(length) {
  return Array.from({ length }, () => COLOURS[Math.floor(Math.random() * COLOURS.length)]);
}

// Records a player's final result (on elimination or win) against their
// registered account, then keeps the global leaderboard trimmed to the top 50.
// No-op for guests (no accountId) — this is the *only* place globalLeaderboard
// or playerAccounts' stats get written, called once per player from the two
// checkWinner branches below (one call per player, exactly once per game).
async function recordGlobalResult(accountId, displayName, levelReached, won) {
  if (!accountId) return;

  const now = new Date();

  // playerAccounts is the durable record — gamesPlayed/wins always increment,
  // bestRound only ever moves up ($max), regardless of whether this particular
  // game beat their previous best.
  await PlayerAccountsCollection.updateAsync(accountId, {
    $inc: { gamesPlayed: 1, wins: won ? 1 : 0 },
    $max: { bestRound: levelReached },
    $set: { updatedAt: now },
  });

  const account = await PlayerAccountsCollection.findOneAsync(accountId);
  if (!account) return;

  // globalLeaderboard is a denormalized *snapshot*, not the source of truth —
  // one row per account. A worse game still refreshes gamesPlayed/wins so the
  // row stays accurate, but only actually improving bestRound moves the rank
  // (bumps achievedAt too, which is the tie-break the sort/trim below rely on).
  const existing = await GlobalLeaderboardCollection.findOneAsync({ accountId });

  if (!existing) {
    await GlobalLeaderboardCollection.insertAsync({
      accountId,
      displayName,
      bestRound: levelReached,
      achievedAt: now,
      gamesPlayed: account.gamesPlayed,
      wins: account.wins,
      updatedAt: now,
    });
  } else {
    const isNewBest = levelReached > existing.bestRound;
    await GlobalLeaderboardCollection.updateAsync(existing._id, {
      $set: {
        displayName,
        gamesPlayed: account.gamesPlayed,
        wins: account.wins,
        updatedAt: now,
        ...(isNewBest ? { bestRound: levelReached, achievedAt: now } : {}),
      },
    });
  }

  // Cap enforcement: only ever fires when a brand-new account just entered
  // the board (an existing account's update can't push the count past 50).
  // Sorts worst-first (lowest bestRound; on a tie, most-recently achieved is
  // considered "worst" and evicted first) and deletes exactly the overflow,
  // so the collection never holds more than GLOBAL_LEADERBOARD_SIZE docs.
  const total = await GlobalLeaderboardCollection.find().countAsync();
  if (total > GLOBAL_LEADERBOARD_SIZE) {
    const overflow = await GlobalLeaderboardCollection.find(
      {},
      { sort: { bestRound: 1, achievedAt: -1 }, limit: total - GLOBAL_LEADERBOARD_SIZE }
    ).fetchAsync();
    await GlobalLeaderboardCollection.removeAsync({ _id: { $in: overflow.map((doc) => doc._id) } });
  }
}

async function checkWinner(gameId) {
  const players = await PlayersCollection.find({ gameId }).fetchAsync();

  const alreadyFinished = players.some((p) => p.gameFinished);
  if (alreadyFinished) return;

  const active = players.filter((p) => !p.eliminated);

  if (active.length === 1) {
    const winner = active[0];
    await PlayersCollection.updateAsync(winner._id, {
      $set: {
        winner: true,
      },
    });

    await PlayersCollection.updateAsync(
      { gameId },
      {
        $set: {
          gameFinished: true,
        },
      },
      { multi: true }
    );

    const winnerRound = await RoundsCollection.findOneAsync(winner.roundId);
    const winnerLevel = winnerRound ? winnerRound.lengthOfSequence - 3 : winner.eliminatedRound ?? 0;

    // Record every player's final result exactly once, now that the game has concluded.
    for (const p of players) {
      const isWinner = p._id === winner._id;
      await recordGlobalResult(p.accountId, p.name, isWinner ? winnerLevel : p.eliminatedRound ?? 0, isWinner);
    }
  }

  if (active.length === 0 && players.length > 0) {
    const highestRound = Math.max(...players.map((p) => p.eliminatedRound ?? 0));

    await PlayersCollection.updateAsync(
      {
        gameId,
        eliminatedRound: highestRound,
      },
      {
        $set: {
          winner: true,
        },
      },
      { multi: true }
    );

    await PlayersCollection.updateAsync(
      { gameId },
      {
        $set: {
          gameFinished: true,
        },
      },
      { multi: true }
    );

    // Record every player's final result exactly once, now that the game has concluded.
    for (const p of players) {
      const isWinner = p.eliminatedRound === highestRound;
      await recordGlobalResult(p.accountId, p.name, p.eliminatedRound ?? 0, isWinner);
    }
  }
}

async function advanceRoundIfReady(round) {
  const playersInRound = await PlayersCollection.find({
    roundId: round._id,
  }).fetchAsync();

  const activePlayers = playersInRound.filter((p) => !p.eliminated);
  const allFinished = activePlayers.length > 0 && activePlayers.every((p) => p.completeRound);
  const hasWinner = await PlayersCollection.findOneAsync({
    gameId: round.gameId,
    winner: true,
  });

  if (!round.advanced && allFinished && !hasWinner) {
    await Meteor.callAsync('rounds.advance', round._id);
  }
}

if (Meteor.isServer && !global._gameMethodsInitialized) {
  global._gameMethodsInitialized = true;
  Meteor.methods({
    // Generate a new round with a colour sequence
    'rounds.generate'(length = 4, gameId = null) {
      const sequence = generateSequence(length);

      return RoundsCollection.insertAsync({
        gameId,
        lengthOfSequence: length,
        sequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });
    },

    // Add a player to a round
    'players.join'(roundId, playerName, gameId = null, accountId = null) {
      return PlayersCollection.insertAsync({
        gameId,
        roundId,
        name: playerName,
        accountId: typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null,
        lives: 3,
        attemptedSequence: [],
        currentStreak: 0,
        longestStreak: 0,
        totalGuesses: 0,
        correctGuesses: 0,
        eliminatedRound: null,
        eliminated: false,
        winner: false,
        completeRound: false,
        gameFinished: false,
      });
    },

    // Submit a player's attempted sequence
    async 'players.submitSequence'(playerId, attemptedSequence) {
      // get player and current round
      const player = await PlayersCollection.findOneAsync(playerId);
      const round = await RoundsCollection.findOneAsync(player.roundId);

      // compare submitted sequence with actual sequence
      const correct = JSON.stringify(attemptedSequence) === JSON.stringify(round.sequence);

      // if correct update player values
      if (correct) {
        const currentStreak = (player.currentStreak ?? 0) + 1;
        const longestStreak = Math.max(player.longestStreak ?? 0, currentStreak);
        const totalGuesses = (player.totalGuesses ?? 0) + 1;
        const correctGuesses = (player.correctGuesses ?? 0) + 1;

        // mark player as completed
        await PlayersCollection.updateAsync(playerId, {
          $set: {
            attemptedSequence,
            currentStreak,
            longestStreak,
            totalGuesses,
            correctGuesses,
            completeRound: true,
          },
        });

        await checkWinner(player.gameId);

        // add successful completion to leaderboard
        await LeaderboardCollection.insertAsync({
          gameId: player.gameId,
          playerId,
          name: player.name,
          lives: player.lives,
          roundId: player.roundId,
          completedAt: new Date(),
        });
      } else {
        // remove one life for wrong sequence
        const newLives = player.lives - 1;
        const eliminated = newLives <= 0;
        const longestStreak = Math.max(player.longestStreak ?? 0, player.currentStreak ?? 0);
        const totalGuesses = (player.totalGuesses ?? 0) + 1;

        await PlayersCollection.updateAsync(playerId, {
          $set: {
            attemptedSequence,
            lives: newLives,
            currentStreak: 0,
            longestStreak,
            totalGuesses,
            eliminated,
            eliminatedRound: eliminated ? round.lengthOfSequence - 3 : player.eliminatedRound,
          },
        });

        await checkWinner(player.gameId);

        const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
        await advanceRoundIfReady(updatedRound);

        // return failed attempt to client
        return {
          success: false,
          sequenceComplete: false,
          remainingLives: newLives,
        };
      }

      // check all players in current round
      const playersInRound = await PlayersCollection.find({
        roundId: player.roundId,
      }).fetchAsync();

      // only active players
      const activePlayers = playersInRound.filter((p) => !p.eliminated);

      // check if all active players finished
      const allFinished = activePlayers.length > 0 && activePlayers.every((p) => p.completeRound);

      const hasWinner = playersInRound.some((p) => p.winner);

      // move to next round if everyone finished
      if (!round.advanced && allFinished && !hasWinner) {
        await Meteor.callAsync('rounds.advance', player.roundId);
      }

      // return successful completion
      return {
        success: true,
        sequenceComplete: true,
      };
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
      const nextLength = currentRound.lengthOfSequence + 1;

      const nextSequence = generateSequence(nextLength);

      // create next round
      const nextRoundId = await RoundsCollection.insertAsync({
        gameId: currentRound.gameId,
        lengthOfSequence: nextLength,
        sequence: nextSequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
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
            attemptedSequence: [],
          },
        },
        { multi: true }
      );

      return nextRoundId;
    },
  });
}
