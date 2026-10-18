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
  ROUND_EXPIRE_GRACE_MS,
  ROUND_EXPIRE_LEASE_MS,
  ROUND_START_FALLBACK_MS,
  ROUND_TIMER_SECONDS,
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

// --- The round clock ---
// A standard round carries deadlineAt, the server's own deadline, so one player who stops
// responding (a phone that left the browser) cannot hold everyone else on a round. It is
// null while the clock has not started (round 1 waiting for the lobby, or a round whose
// draft is still open) and absent on Battle Royale rounds, which have no timer.

export function roundDeadline(now = Date.now()) {
  return new Date(now + ROUND_TIMER_SECONDS * 1000);
}

// An answer is accepted until ROUND_EXPIRE_GRACE_MS after deadlineAt. Only after that does
// the server eliminate whoever has not cleared the round, so the two never disagree.
export function roundIsPastCutoff(round, now = Date.now()) {
  return round?.deadlineAt instanceof Date && now > round.deadlineAt.getTime() + ROUND_EXPIRE_GRACE_MS;
}

// Runs expireRound when the cutoff passes. Idempotent, so a duplicate (the sweep, a client)
// is harmless. A server restart loses this timer, which is why the sweep exists.
export function armRoundTimer(roundId, deadlineAt) {
  const delay = Math.max(0, deadlineAt.getTime() + ROUND_EXPIRE_GRACE_MS - Date.now()) + 100;
  Meteor.setTimeout(async () => {
    try {
      if (await expireRound(roundId)) return;
      // Node counts a timer from the start of the event-loop turn it was set in, so on a busy
      // server it can fire a few ms before the wall clock reaches the cutoff. Wait out the
      // difference rather than leaving the round to the sweep, which runs every few seconds.
      if (!roundIsPastCutoff({ deadlineAt })) armRoundTimer(roundId, deadlineAt);
    } catch (error) {
      console.error('Could not expire the round', error);
    }
  }, delay);
}

// Start a round's clock. Only a round created with deadlineAt: null can start, and only once.
export async function startRoundClock(roundId, now = Date.now()) {
  const deadlineAt = roundDeadline(now);
  const started = await RoundsCollection.updateAsync(
    { _id: roundId, advanced: { $ne: true }, deadlineAt: { $type: 'null' } },
    { $set: { deadlineAt } }
  );
  if (!started) return null;
  armRoundTimer(roundId, deadlineAt);
  return deadlineAt;
}

// Round 1: start the clock at ROUND_START_FALLBACK_MS if the lobby has not all joined by then.
export function armRoundStartFallback(roundId) {
  Meteor.setTimeout(() => {
    startRoundClock(roundId).catch((error) => console.error('Could not start the round clock', error));
  }, ROUND_START_FALLBACK_MS);
}

// Round 1: start the clock as soon as every lobby member has a player in the game.
export async function startClockIfEveryoneJoined(gameId, roundId) {
  const round = await RoundsCollection.findOneAsync(roundId);
  if (!round || round.roundNumber !== 1 || round.deadlineAt !== null) return null;
  const room = await RoomsCollection.findOneAsync({ pin: gameId });
  const expected = room?.players?.length ?? 0;
  const joined = await PlayersCollection.find({ gameId }).countAsync();
  if (joined < expected) return null;
  return startRoundClock(roundId);
}

// The deadline passed: eliminate every player who has not cleared the round, drop lobby
// members who never joined (they would hold the round forever), then declare a winner or
// advance as any other elimination does. Returns whether this call did the work.
//
// Safe to call from anywhere, any number of times. It does nothing before the cutoff, the
// eliminations are conditional, and the lease keeps two callers from both finishing the
// round. The lease also expires, so a call that dies half way is retried by the sweep.
export async function expireRound(roundId, now = Date.now()) {
  const round = await RoundsCollection.findOneAsync(roundId);
  if (!round || round.advanced || round.expiredAt || !roundIsPastCutoff(round, now)) return false;

  const claimed = await RoundsCollection.updateAsync(
    {
      _id: roundId,
      expiredAt: { $exists: false },
      $or: [{ expiringUntil: { $exists: false } }, { expiringUntil: { $lt: new Date(now) } }],
    },
    { $set: { expiringUntil: new Date(now + ROUND_EXPIRE_LEASE_MS) } }
  );
  if (!claimed) return false;

  const gameId = round.gameId;
  const finished = await PlayersCollection.findOneAsync({ gameId, gameFinished: true });
  if (!finished) {
    const stragglers = await PlayersCollection.find({
      roundId,
      eliminated: false,
      completeRound: false,
      winner: { $ne: true },
    }).fetchAsync();
    for (const player of stragglers) {
      await PlayersCollection.updateAsync(
        { _id: player._id, roundId, eliminated: false, completeRound: false },
        {
          $set: {
            lives: 0,
            currentStreak: 0,
            longestStreak: Math.max(player.longestStreak ?? 0, player.currentStreak ?? 0),
            eliminated: true,
            roundStatus: 'Eliminated',
            eliminatedRound: roundLevel(round),
            eliminatedAt: new Date(),
          },
        }
      );
    }

    const room = await RoomsCollection.findOneAsync({ pin: gameId });
    const joined = new Set(
      (await PlayersCollection.find({ gameId }, { fields: { lobbyPlayerId: 1 } }).fetchAsync())
        .map((p) => p.lobbyPlayerId)
        .filter(Boolean)
    );
    const missing = (room?.players ?? []).map((p) => p.id).filter((id) => id && !joined.has(id));
    if (missing.length) {
      await RoomsCollection.updateAsync({ pin: gameId }, { $pull: { players: { id: { $in: missing } } } });
    }

    await checkWinner(gameId, false);
    await advanceRoundIfReady(await RoundsCollection.findOneAsync(roundId));
  }

  await RoundsCollection.updateAsync(
    { _id: roundId },
    { $set: { expiredAt: new Date() }, $unset: { expiringUntil: '' } }
  );
  return true;
}

// Refuse an action on a round whose cutoff has passed, eliminating whoever is late first.
export async function assertRoundOpen(round, now = Date.now()) {
  if (!roundIsPastCutoff(round, now)) return;
  await expireRound(round._id, now);
  throw new Meteor.Error('round-expired', 'Time is up for this round');
}

// Catch up on what a lost timer or a restart missed: rounds past their cutoff that were
// never expired, and round-1 clocks whose fallback timer never fired.
export async function sweepRoundDeadlines(now = Date.now()) {
  const overdue = await RoundsCollection.find(
    {
      isCurrent: true,
      advanced: false,
      expiredAt: { $exists: false },
      deadlineAt: { $lt: new Date(now - ROUND_EXPIRE_GRACE_MS) },
    },
    { fields: { _id: 1 } }
  ).fetchAsync();
  for (const { _id } of overdue) await expireRound(_id, now);

  const waiting = await RoundsCollection.find(
    {
      isCurrent: true,
      advanced: false,
      roundNumber: 1,
      deadlineAt: { $type: 'null' },
      createdAt: { $lt: new Date(now - ROUND_START_FALLBACK_MS) },
    },
    { fields: { _id: 1 } }
  ).fetchAsync();
  for (const { _id } of waiting) await startRoundClock(_id, now);
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
