import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods';
import '../imports/api/playerAccounts';

import '/imports/api/rooms';

import './health.js';
import './publications.js';
import { ensureIndexes } from './indexes.js';
import { ensureUniqueDisplayNames } from '../imports/api/playerAccounts';

Meteor.startup(async () => {
  // Must run before ensureIndexes: the unique display name index cannot build over duplicates.
  try {
    await ensureUniqueDisplayNames();
  } catch (error) {
    console.error(`[playerAccounts] Could not de-duplicate display names: ${error.message}`);
  }
  await ensureIndexes();
});
