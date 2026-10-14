// Anonymous browser session for bot detection. Separate from the signed-in account
// session in accountSession.js: this one exists for every visitor, with or without an account.
import { Meteor } from 'meteor/meteor';

export const BROWSER_STORAGE_KEY = 'kimply.browser';

function readToken() {
  try {
    return globalThis.localStorage?.getItem(BROWSER_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeToken(token) {
  try {
    if (token) globalThis.localStorage?.setItem(BROWSER_STORAGE_KEY, token);
    else globalThis.localStorage?.removeItem(BROWSER_STORAGE_KEY);
  } catch {
    // Without storage the session lasts for this page load only.
  }
}

let resumeChain = Promise.resolve();

// wait: true so later method calls on this connection stay behind the resume.
export function resumeBrowserSession() {
  const token = readToken();
  const run = new Promise((resolve) => {
    Meteor.apply('browserSessions.resume', [token], { wait: true }, (error, result) => {
      if (!error && result?.token) writeToken(result.token);
      resolve();
    });
  });
  resumeChain = run;
  return run;
}

export function whenBrowserSessionReady() {
  return resumeChain;
}

export function banMessage(error) {
  const details = error?.details;
  if (details?.reason === 'address' && details.expiresAt) {
    const when = new Date(details.expiresAt);
    const formatted = Number.isNaN(when.getTime()) ? '' : when.toLocaleString();
    return formatted
      ? `This network is blocked from this room until ${formatted}.`
      : 'This network is blocked from this room.';
  }
  return 'This browser is blocked from this room.';
}
