import { RoomsCollection } from '../imports/api/rooms.js';
import { RoundsCollection } from '../imports/api/rounds.js';
import { PlayersCollection } from '../imports/api/players.js';
import { LeaderboardCollection } from '../imports/api/leaderboard.js';
import { PlayerAccountsCollection } from '../imports/api/playerAccounts.js';

const DAY_SECONDS = 60 * 60 * 24;
const WEEK_SECONDS = DAY_SECONDS * 7;

const INDEXES = [
  { collection: RoomsCollection, keys: { pin: 1 }, options: { unique: true, name: 'pin_unique' } },
  {
    collection: RoomsCollection,
    keys: { createdAt: 1 },
    options: { expireAfterSeconds: DAY_SECONDS, name: 'rooms_ttl' },
  },
  { collection: RoundsCollection, keys: { gameId: 1, isCurrent: 1 }, options: { name: 'gameId_isCurrent' } },
  { collection: RoundsCollection, keys: { gameId: 1, advanced: 1 }, options: { name: 'gameId_advanced' } },
  {
    collection: RoundsCollection,
    keys: { createdAt: 1 },
    options: { expireAfterSeconds: DAY_SECONDS, name: 'rounds_ttl' },
  },
  { collection: PlayersCollection, keys: { roundId: 1 }, options: { name: 'roundId' } },
  { collection: PlayersCollection, keys: { gameId: 1 }, options: { name: 'gameId' } },
  { collection: PlayersCollection, keys: { gameId: 1, winner: 1 }, options: { name: 'gameId_winner' } },
  { collection: LeaderboardCollection, keys: { gameId: 1, roundId: 1 }, options: { name: 'gameId_roundId' } },
  {
    collection: LeaderboardCollection,
    keys: { completedAt: 1 },
    options: { expireAfterSeconds: WEEK_SECONDS, name: 'leaderboard_ttl' },
  },
  { collection: PlayerAccountsCollection, keys: { email: 1 }, options: { unique: true, name: 'email_unique' } },
];

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
