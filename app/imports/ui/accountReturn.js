// Where the account page sends a player once they have signed in or registered.
//
// A page that links to /account puts its own path in router state as `returnTo`, so a
// player who arrived through an invite link goes back to that room instead of to /play.
// Only paths inside this app are honoured, so router state can never send anyone off-site.

export const DEFAULT_ACCOUNT_RETURN = '/play';

export function accountReturnPath(state) {
  const path = state?.returnTo;
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return DEFAULT_ACCOUNT_RETURN;
  }
  return path;
}
