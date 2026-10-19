import { Meteor } from 'meteor/meteor';

// Round deadlines are set on the server's clock. A phone's clock can be seconds off, so
// count down against the server's time: the offset is measured once per sync, assuming the
// reply took half the round trip.
let offsetMs = 0;

export function serverNow() {
  return Date.now() + offsetMs;
}

// Calls done(offsetMs) when the measurement lands. A failed call keeps the previous offset.
export function syncServerClock(done) {
  const sent = Date.now();
  Meteor.call('time.now', (error, serverTime) => {
    if (error || typeof serverTime !== 'number') return;
    const received = Date.now();
    offsetMs = serverTime + (received - sent) / 2 - received;
    done?.(offsetMs);
  });
}

// Whole seconds from now to a deadline, never below zero.
export function secondsUntil(deadlineMs, now = serverNow()) {
  return Math.max(0, Math.ceil((deadlineMs - now) / 1000));
}
