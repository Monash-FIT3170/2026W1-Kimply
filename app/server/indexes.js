import { RoomsCollection } from '../imports/api/rooms.js';
import { RoundsCollection } from '../imports/api/rounds.js';
import { PlayersCollection } from '../imports/api/players.js';
import { LeaderboardCollection } from '../imports/api/leaderboard.js';
import { PlayerAccountsCollection } from '../imports/api/playerAccounts.js';

const DAY_SECONDS = 60 * 60 * 24;
const WEEK_SECONDS = DAY_SECONDS * 7;

// Every index below supports a query that runs on the hot path. Without them each
// lookup is a collection scan, and players.submitSequence alone performs 6-9 round
// trips per submission.
//
// The TTL indexes also replace what used to be a destructive wipe of the rounds
// collection on every server startup: old data now expires on a timer instead of
// being deleted out from under live games on every restart or deploy.
const INDEXES = [
  // rooms.create collision check, the rooms.lobby publication, and the six
  // findOneAsync({ pin }) lookups across imports/api/rooms.js.
  // unique also closes the check-then-insert PIN race at the database layer.
  { collection: RoomsCollection, keys: { pin: 1 }, options: { unique: true, name: 'pin_unique' } },
  {
    collection: RoomsCollection,
    keys: { createdAt: 1 },
    options: { expireAfterSeconds: DAY_SECONDS, name: 'rooms_ttl' },
  },

  // The scoped `rounds` publication and the current-round lookup.
  { collection: RoundsCollection, keys: { gameId: 1, isCurrent: 1 }, options: { name: 'gameId_isCurrent' } },
  // advanceRoundIfReady, imports/api/gameMethods.js.
  { collection: RoundsCollection, keys: { gameId: 1, advanced: 1 }, options: { name: 'gameId_advanced' } },
  {
    collection: RoundsCollection,
    keys: { createdAt: 1 },
    options: { expireAfterSeconds: DAY_SECONDS, name: 'rounds_ttl' },
  },

  // find({ roundId }) and the multi-update in players.submitSequence / rounds.advance.
  { collection: PlayersCollection, keys: { roundId: 1 }, options: { name: 'roundId' } },
  // checkWinner, the scoped `players` publication, and EndLeaderboard.
  { collection: PlayersCollection, keys: { gameId: 1 }, options: { name: 'gameId' } },
  // findOneAsync({ gameId, winner: true }) in advanceRoundIfReady.
  { collection: PlayersCollection, keys: { gameId: 1, winner: 1 }, options: { name: 'gameId_winner' } },

  // The scoped `leaderboard` publication plus the per-round view.
  { collection: LeaderboardCollection, keys: { gameId: 1, roundId: 1 }, options: { name: 'gameId_roundId' } },
  // leaderboard is append-only and nothing ever deletes from it, so without this
  // TTL it grows without bound against a 512 MB Atlas free-tier allowance.
  {
    collection: LeaderboardCollection,
    keys: { completedAt: 1 },
    options: { expireAfterSeconds: WEEK_SECONDS, name: 'leaderboard_ttl' },
  },

  // Duplicate-email check in register and the lookup in signIn.
  { collection: PlayerAccountsCollection, keys: { email: 1 }, options: { unique: true, name: 'email_unique' } },
];

// createIndex is idempotent, so this is safe to run on every boot.
//
// A unique index fails to build if the collection already holds duplicates. That
// cannot happen in production, which starts from an empty database, but it can
// happen against a developer's local Mongo that predates the index. Log clearly
// and keep going rather than taking the whole server down over it.
export async function ensureIndexes() {
  for (const { collection, keys, options } of INDEXES) {
    try {
      await collection.createIndexAsync(keys, options);
    } catch (error) {
      console.error(
        `[indexes] Failed to create ${options.name} on "${collection._name}": ${error.message}\n` +
          '[indexes] If this is a unique index on a local database, it most likely holds ' +
          'duplicate documents from before the index existed. Drop the collection and retry.'
      );
    }
  }
}
