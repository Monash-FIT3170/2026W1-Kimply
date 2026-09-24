// The signed-in player account, kept for as long as its session token is valid.
//
// The server hands out a random session token on register and sign-in and keeps only
// its hash. The client stores the token in localStorage, so the account survives page
// reloads, new tabs, and every navigation, instead of being passed through router state
// where any page that forgot to forward it silently signed the player out.

import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { useTracker } from 'meteor/react-meteor-data';

export const SESSION_STORAGE_KEY = 'kimply.session';

const account = new ReactiveVar(null);
// True while a stored token is being checked, so pages do not flash a signed-out state.
const resuming = new ReactiveVar(false);

function readToken() {
  try {
    return globalThis.localStorage?.getItem(SESSION_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeToken(token) {
  try {
    if (token) globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, token);
    else globalThis.localStorage?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Without storage the session lasts for this page load only.
  }
}

function publicAccount({ _id, displayName, email }) {
  return { _id, displayName, email };
}

// Called with the result of playerAccounts.register / signIn.
// Signing in again on the same device ends the session it replaces.
export function setSession(result) {
  const previous = readToken();
  if (previous && previous !== result.sessionToken) Meteor.call('playerAccounts.signOut', previous, () => {});
  writeToken(result.sessionToken);
  account.set(publicAccount(result));
}

// Restores the account from a stored token. Runs once at startup.
export function resumeSession() {
  const token = readToken();
  if (!token) return;
  resuming.set(true);
  Meteor.call('playerAccounts.resume', token, (err, result) => {
    resuming.set(false);
    if (err) {
      // Only an explicit rejection clears the token. A dropped connection keeps it for next time.
      if (err.error === 'invalid-session') writeToken(null);
      return;
    }
    account.set(publicAccount(result));
  });
}

export function signOut() {
  const token = readToken();
  writeToken(null);
  account.set(null);
  if (token) Meteor.call('playerAccounts.signOut', token, () => {});
}

export function useSignedInAccount() {
  return useTracker(() => account.get(), []);
}

export function useSessionResuming() {
  return useTracker(() => resuming.get(), []);
}
