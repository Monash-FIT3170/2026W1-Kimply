import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods';
import '../imports/api/playerAccounts';

import '/imports/api/rooms';

import './health.js';
import './publications.js';
import { ensureIndexes } from './indexes.js';

Meteor.startup(async () => {
  await ensureIndexes();
});
