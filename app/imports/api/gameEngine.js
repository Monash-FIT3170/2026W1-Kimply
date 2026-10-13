// Server-side game helpers shared by the game loop methods (gameMethods.js) and the
// ability methods (abilities.js). Nothing here is a Meteor method.
import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';
import { PlayerAccountsCollection } from './playerAccounts';
import { GlobalLeaderboardCollection } from './globalLeaderboard';
import { RoomsCollection } from './rooms';
import { generateSequence } from './sequence';
import { ABILITIES, ABILITY_TYPES } from './abilityRules';
import {
  GLOBAL_LEADERBOARD_SIZE,
  BONUS_LIFE_ROUND,
  DEFAULT_STARTING_LIVES,
  INITIAL_LEVEL,
  STREAK_BONUS_LIFE_THRESHOLD,
} from '../constants';

export { generateSequence };

// Matches the hand cards that expire when their round ends.
export const ROUND_ONLY_CARDS = { type: { $in: ABILITY_TYPES.filter((type) => !ABILITIES[type].kept) } };

// The level a round is shown as. Standard rounds carry roundNumber; Battle Royale
// level rounds only carry their sequence length (level 1 is length 4).
export function roundLevel(round) {
  return round.roundNumber ?? round.lengthOfSequence - 3;
}

// The private sequence a player must repeat. Each player's copy lives in
// players.secret.sequence so it reaches only them; round.sequence is the fallback.
export function sequenceFor(player, round) {
  const own = player?.secret?.sequence;
  if (own && round && own.roundId === round._id) return own.colours;
  return round?.sequence ?? [];
}

export function sequenceState(roundId, colours, version = 1) {
  return { roundId, colours, version };
}

export async function recordGlobalResult(accountId, displayName, levelReached, won) {
  if (!accountId) return;

  const now = new Date();

  await PlayerAccountsCollection.updateAsync(accountId, {
    $inc: { gamesPlayed: 1, wins: won ? 1 : 0 },
    $max: { bestRound: levelReached },
    $set: { updatedAt: now },
  });

  const account = await PlayerAccountsCollection.findOneAsync(accountId);
  if (!account) return;

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

  const total = await GlobalLeaderboardCollection.find().countAsync();
  if (total > GLOBAL_LEADERBOARD_SIZE) {
    const overflow = await GlobalLeaderboardCollection.find(
      {},
      { sort: { bestRound: 1, wins: 1, achievedAt: -1 }, limit: total - GLOBAL_LEADERBOARD_SIZE }
    ).fetchAsync();
    await GlobalLeaderboardCollection.removeAsync({ _id: { $in: overflow.map((doc) => doc._id) } });
  }
}

export async function checkWinner(gameId, isBattleRoyale = false) {
  const players = await PlayersCollection.find({ gameId }).fetchAsync();

  const alreadyFinished = players.some((p) => p.gameFinished);
  if (alreadyFinished) return;

  // Wait until every lobby member has actually joined before declaring a winner.
  const room = await RoomsCollection.findOneAsync({ pin: gameId });
  const expectedPlayerCount = room?.players?.length ?? 0;
  if (players.length < expectedPlayerCount) return;

  const active = players.filter((p) => !p.eliminated);
  const hasMultiplePlayers = players.length > 1;

  // Battle Royale: everyone races independently; the winner is whoever reached
  // the highest level once nobody is left standing.
  if (isBattleRoyale) {
    if (active.length > 0) return; // game is still going

    const highestLevel = Math.max(...players.map((p) => p.currentLevel ?? 4));
    const winners = players.filter((p) => (p.currentLevel ?? 4) === highestLevel);
    const winnerIds = new Set(winners.map((w) => w._id));

    await PlayersCollection.updateAsync(
      { gameId, _id: { $in: winners.map((w) => w._id) } },
      { $set: { winner: true } },
      { multi: true }
    );
    await PlayersCollection.updateAsync({ gameId }, { $set: { gameFinished: true } }, { multi: true });

    for (const p of players) {
      const isWinner = winnerIds.has(p._id);
      await recordGlobalResult(p.accountId, p.name, (p.currentLevel ?? 4) - 3, isWinner);
    }
    return;
  }

  // Standard mode - last player standing wins.
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
    const winnerLevel = winnerRound ? roundLevel(winnerRound) : (winner.eliminatedRound ?? 0);

    for (const p of players) {
      const isWinner = p._id === winner._id;
      await recordGlobalResult(p.accountId, p.name, isWinner ? winnerLevel : (p.eliminatedRound ?? 0), isWinner);
    }
    return;
  }

  // Standard mode - everyone was eliminated on the same round: highest round reached wins.
  if (hasMultiplePlayers && active.length === 0 && players.length > 0) {
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

    for (const p of players) {
      const isWinner = (p.eliminatedRound ?? 0) === highestRound;
      await recordGlobalResult(p.accountId, p.name, p.eliminatedRound ?? 0, isWinner);
    }
  }
}

export async function advanceRoundIfReady(round) {
  if (!round) return false;

  const playersInRound = await PlayersCollection.find({
    roundId: round._id,
  }).fetchAsync();
  const room = await RoomsCollection.findOneAsync({ pin: round.gameId });
  const lobbyPlayerIds = (room?.players || []).map((player) => player.id).filter(Boolean);

  // Eliminated players stay on their old round and never join later rounds, so
  // they must not count towards the players this round waits for.
  const eliminatedPlayers = await PlayersCollection.find({ gameId: round.gameId, eliminated: true }).fetchAsync();
  const eliminatedLobbyIds = new Set(eliminatedPlayers.map((p) => p.lobbyPlayerId).filter(Boolean));
  const activeLobbyIds = lobbyPlayerIds.filter((id) => !eliminatedLobbyIds.has(id));
  const expectedPlayerCount = activeLobbyIds.length;

  const playersToEvaluate = activeLobbyIds.length
    ? activeLobbyIds
        .map((lobbyPlayerId) => playersInRound.find((player) => player.lobbyPlayerId === lobbyPlayerId))
        .filter(Boolean)
    : playersInRound.filter((p) => !p.eliminated);

  if (playersToEvaluate.length < expectedPlayerCount) return false;

  const activePlayers = playersToEvaluate.filter((p) => !p.eliminated);
  const allFinished = activePlayers.length > 0 && activePlayers.every((p) => p.completeRound);
  const hasWinner = await PlayersCollection.findOneAsync({
    gameId: round.gameId,
    winner: true,
  });

  if (!round.advanced && allFinished && !hasWinner) {
    await Meteor.callAsync('rounds.advance', round._id);
    return true;
  }
  return false;
}

// Gets an existing round for a level or creates a new one (Battle Royale runs a
// per-player round rather than one shared current round).
export async function getOrCreateRound(gameId, level) {
  const existing = await RoundsCollection.findOneAsync({ gameId, level });

  if (existing) {
    return existing._id;
  }
  const sequence = generateSequence(level);
  return await RoundsCollection.insertAsync({
    gameId,
    level,
    lengthOfSequence: level,
    sequence,
    createdAt: new Date(),
    advanced: false,
    isCurrent: false, // current round is not shared, it is per player to accommodate battle royale
  });
}

// Take one life. $inc rather than a $set computed from an earlier read, so a life
// lost here cannot overwrite one a Steal moved at the same moment.
export async function loseLife(playerId, round) {
  const applied = await PlayersCollection.updateAsync(
    { _id: playerId, eliminated: false, lives: { $gt: 0 } },
    { $inc: { lives: -1 } }
  );
  if (!applied) return { applied: false, eliminated: false, lives: null };

  const player = await PlayersCollection.findOneAsync(playerId);
  if (player.lives > 0) return { applied: true, eliminated: false, lives: player.lives };

  await PlayersCollection.updateAsync(
    { _id: playerId, eliminated: false },
    {
      $set: {
        eliminated: true,
        roundStatus: 'Eliminated',
        currentLevel: round.level ?? round.lengthOfSequence,
        eliminatedRound: roundLevel(round),
        eliminatedAt: new Date(),
      },
    }
  );
  return { applied: true, eliminated: true, lives: 0 };
}

// A player has cleared their round, by repeating it (credited) or with a Free Pass
// (not credited: no streak, accuracy or bonus life). Returns the next round id in
// Battle Royale, where the player moves on straight away, and any life it earned.
export async function clearRound(player, round, { credited, attemptedSequence = [] }) {
  const isBattleRoyale = player.isBattleRoyale ?? false;
  const set = { attemptedSequence, completeRound: true, roundStatus: credited ? 'Correct' : 'Passed' };
  const inc = {};

  let lifeAward = null;

  if (credited) {
    set.currentStreak = (player.currentStreak ?? 0) + 1;
    set.longestStreak = Math.max(player.longestStreak ?? 0, set.currentStreak);
    inc.totalGuesses = 1;
    inc.correctGuesses = 1;

    const room = await RoomsCollection.findOneAsync({ pin: player.gameId });
    const startingLives = room?.customSettings?.startingLives || DEFAULT_STARTING_LIVES;

    // Every STREAK_BONUS_LIFE_THRESHOLD correct rounds in a row earns a life. In battle
    // royale a streak can bank lives above the starting count; every other mode only
    // tops a player back up to the starting lives the room was created with.
    const bonusLife = round.roundNumber === BONUS_LIFE_ROUND ? 1 : 0;
    const streakReached = set.currentStreak % STREAK_BONUS_LIFE_THRESHOLD === 0;
    const belowCap = isBattleRoyale || (player.lives ?? 0) + bonusLife < startingLives;
    const streakLife = streakReached && belowCap ? 1 : 0;

    if (bonusLife + streakLife) {
      inc.lives = bonusLife + streakLife;
      lifeAward = {
        streak: streakLife === 1,
        bonusRound: bonusLife === 1,
        lives: (player.lives ?? 0) + bonusLife + streakLife,
      };
    }
  }

  await PlayersCollection.updateAsync(player._id, Object.keys(inc).length ? { $set: set, $inc: inc } : { $set: set });

  await checkWinner(player.gameId, isBattleRoyale);

  const updated = await PlayersCollection.findOneAsync(player._id);
  await LeaderboardCollection.insertAsync({
    gameId: player.gameId,
    playerId: player._id,
    name: player.name,
    lives: updated?.lives ?? player.lives,
    roundId: player.roundId,
    completedAt: new Date(),
  });

  if (isBattleRoyale) {
    // advance player immediately to next round, no waiting for other players
    const nextLevel = (player.currentLevel ?? INITIAL_LEVEL) + 1;
    const nextRoundId = await moveToLevel(player._id, player.gameId, nextLevel);
    return { nextRoundId, lifeAward };
  }

  const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
  await advanceRoundIfReady(updatedRound);
  return { nextRoundId: null, lifeAward };
}

// Battle Royale: put a player on a level's round with that round's sequence. Cards
// that only last a round are dropped, since the player has left it. A Slo-Mo, 2x Speed
// or Lights Out waiting for this player's next level lands on this one, in the same
// write, so the sequence never plays before the effect is in place.
export async function moveToLevel(playerId, gameId, level) {
  const roundId = await getOrCreateRound(gameId, level);
  const round = await RoundsCollection.findOneAsync(roundId);
  const player = await PlayersCollection.findOneAsync(playerId, { fields: { 'secret.playback': 1 } });

  const set = {
    roundId,
    currentLevel: level,
    completeRound: false,
    roundStatus: 'Playing',
    attemptedSequence: [],
    'secret.sequence': sequenceState(roundId, round.sequence),
  };
  for (const [kind, effect] of Object.entries(player?.secret?.playback ?? {})) {
    if (effect && effect.roundId === null) set[`secret.playback.${kind}.roundId`] = roundId;
  }

  await PlayersCollection.updateAsync(playerId, {
    $set: set,
    $pull: { 'secret.hand': ROUND_ONLY_CARDS },
  });
  return roundId;
}
