// Pure timing check plus the development-only kill switch. Nothing here reads a
// connection or writes a ban.
import { Meteor } from 'meteor/meteor';
import { BOT_MAX_INTERVAL_MS, BOT_MAX_SPREAD_MS, BOT_MIN_COLOURS, BOT_SERVER_SLACK_MS } from '../constants';

export function assessAttempt({ colours, offsets, serverElapsedMs }) {
  if (!Array.isArray(colours) || colours.length < BOT_MIN_COLOURS) {
    return { flagged: false, reason: 'short' };
  }
  if (!Array.isArray(offsets) || offsets.length !== colours.length) {
    return { flagged: false, reason: 'unusable-timing' };
  }
  const intervals = [];
  for (let i = 1; i < offsets.length; i += 1) intervals.push(offsets[i] - offsets[i - 1]);
  if (intervals.some((interval) => !Number.isFinite(interval))) {
    return { flagged: false, reason: 'unusable-timing' };
  }
  const min = Math.min(...intervals);
  const max = Math.max(...intervals);
  const fast = intervals.every((interval) => interval < BOT_MAX_INTERVAL_MS);
  const tight = max - min <= BOT_MAX_SPREAD_MS;
  const lastOffset = offsets[offsets.length - 1];
  const supported = Number.isFinite(serverElapsedMs) && serverElapsedMs <= lastOffset + BOT_SERVER_SLACK_MS;
  if (fast && tight && supported) return { flagged: true, reason: 'uniform-fast-input' };
  if (fast && tight) return { flagged: false, reason: 'server-elapsed' };
  return { flagged: false, reason: 'human-timing' };
}

// `false` is honoured only in development, so a local agent can play. Anywhere else
// the flag is ignored and detection stays on. The warning is logged once per process.
export function detectionEnabledFrom(envValue, isDevelopment) {
  if (envValue === 'false' && isDevelopment) return false;
  return true;
}

export function detectionEnabled() {
  const enabled = detectionEnabledFrom(process.env.BOT_DETECTION_ENABLED, Meteor.isDevelopment);
  if (!enabled) return false;
  if (
    process.env.BOT_DETECTION_ENABLED === 'false' &&
    !Meteor.isDevelopment &&
    !global._botDetectionProdOverrideLogged
  ) {
    global._botDetectionProdOverrideLogged = true;
    console.warn('[bot-detection] BOT_DETECTION_ENABLED=false is ignored outside development');
  }
  return true;
}
