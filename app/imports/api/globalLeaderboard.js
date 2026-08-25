// The global leaderboard is a ranked, capped-at-50 snapshot of player
// achievement — separate from `leaderboard.js`, which is an append-only
// per-round completion log for the *in-game* leaderboard UI. This one only
// ever holds registered accounts (guests have no accountId, so they never
// get an entry) and is written to from a single place: `recordGlobalResult`
// in gameMethods.js, at the moment a game ends.
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { PlayerAccountsCollection } from './playerAccounts';

// Guard against --full-app test mode evaluating this module twice
// (app bundle + test bundle both load it; global is shared across both).
if (!global._GlobalLeaderboardCollection) {
  global._GlobalLeaderboardCollection = new Mongo.Collection('globalLeaderboard');
}
export const GlobalLeaderboardCollection = global._GlobalLeaderboardCollection;

// One doc per registered account, capped at the top 50 by bestRound (see
// recordGlobalResult in gameMethods.js, which upserts and trims this collection).
// Ranking is bestRound desc, then wins desc as the tiebreak (fewer wins
// loses the tie), then achievedAt as a final tiebreak for a full tie.
// Indexes:
//  - accountId unique: enforces one leaderboard row per account, and doubles
//    as the "did my score improve" guard when recordGlobalResult upserts.
//  - (bestRound desc, wins desc, achievedAt asc): matches the sort order the
//    UI and the trim step both query with, so reads and the eviction scan
//    can use it directly.
if (Meteor.isServer && !global._globalLeaderboardIndexesInitialized) {
  global._globalLeaderboardIndexesInitialized = true;
  Meteor.startup(async () => {
    const raw = GlobalLeaderboardCollection.rawCollection();
    await raw.createIndex({ accountId: 1 }, { unique: true });
    await raw.createIndex({ bestRound: -1, wins: -1, achievedAt: 1 });
  });
}

// Lets a signed-in player see their own stats even when they're outside the
// published top 50 — unranked (no globalLeaderboard entry exists for them
// to derive a position from), but still their real stats from playerAccounts.
// Returns null when the account hasn't played yet, so the UI can simply skip
// rendering a "your standing" row instead of showing an all-zero one.
if (Meteor.isServer && !global._globalLeaderboardMethodsInitialized) {
  global._globalLeaderboardMethodsInitialized = true;
  Meteor.methods({
    async 'globalLeaderboard.myStanding'(accountId) {
      if (typeof accountId !== 'string' || !accountId.trim()) {
        throw new Meteor.Error('invalid', 'Invalid account id');
      }

      const account = await PlayerAccountsCollection.findOneAsync(accountId.trim());
      if (!account || !account.gamesPlayed) return null;

      // Deliberately unranked: computing a real position would mean ranking
      // against every account's bestRound, which gets expensive and only
      // approximates the tie-break the top-50 collection itself uses. The
      // caller renders this as a dash instead of a number — see GlobalLeaderboard.jsx.
      return {
        displayName: account.displayName,
        bestRound: account.bestRound,
        gamesPlayed: account.gamesPlayed,
        wins: account.wins,
      };
    },
  });
}
