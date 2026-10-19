import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods';
import '../imports/api/playerAccounts';
import '../imports/api/browserSessions';

import '/imports/api/rooms';

import './health.js';
import './publications.js';
import { ensureIndexes } from './indexes.js';
import { sweepRoundDeadlines } from '../imports/api/gameEngine';
import { ROUND_SWEEP_INTERVAL_MS } from '../imports/constants';

Meteor.startup(async () => {
  await ensureIndexes();

  // Round deadlines are normally enforced by a timer set when the clock starts. A restart
  // loses those timers, so look for rounds they missed. expireRound is idempotent, which
  // keeps this safe on every replica at once.
  Meteor.setInterval(() => {
    sweepRoundDeadlines().catch((error) => console.error('Round deadline sweep failed', error));
  }, ROUND_SWEEP_INTERVAL_MS);
  sweepRoundDeadlines().catch((error) => console.error('Round deadline sweep failed', error));
});
