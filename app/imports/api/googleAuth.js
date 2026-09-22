// Google sign-in, server side.
//
// The browser gets a signed ID token from Google Identity Services and sends it to
// playerAccounts.googleSignIn. The token is verified here against Google's published
// keys, with this app's OAuth client ID as the required audience. Nothing from the
// client is trusted beyond the signature.
//
// Configured by the GOOGLE_CLIENT_ID environment variable. Unset means Google sign-in
// is off: the Account page hides the button and googleSignIn refuses every call.

export function googleClientId() {
  return (process.env.GOOGLE_CLIENT_ID || '').trim() || null;
}

let client = null;

async function verifyWithGoogle(idToken, audience) {
  if (!client) {
    // Loaded on first use so this Node-only library never enters the client bundle,
    // which also includes this module through playerAccounts.js.
    const { OAuth2Client } = await import('google-auth-library');
    client = new OAuth2Client();
  }
  const ticket = await client.verifyIdToken({ idToken, audience });
  return ticket.getPayload();
}

let verifier = verifyWithGoogle;

// Returns the verified token payload ({ sub, email, email_verified, name, ... }),
// or throws if the signature, expiry, issuer, or audience is wrong.
export function verifyGoogleIdToken(idToken, audience) {
  return verifier(idToken, audience);
}

// Tests replace the network-bound verifier with a stub. Pass nothing to restore it.
export function setGoogleVerifierForTests(fn) {
  verifier = fn || verifyWithGoogle;
}
