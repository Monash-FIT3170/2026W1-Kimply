import { useEffect, useRef, useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useNavigate } from 'react-router-dom';
import { BG, HAIRLINE, PRIMARY, TILE, TileLattice, TopBar } from '../components/design';
import { submitOnEnter } from '../keyboard';
import { setSession, signOut, updateDisplayName, useSessionResuming, useSignedInAccount } from '../accountSession';

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_BUTTON_MAX_WIDTH = 400; // Google renders the button at most 400px wide.

let googleScript = null;
let googleInitializedFor = null;
// Set by whichever GoogleSignIn is mounted, so Google's one-time callback reaches it.
let handleGoogleCredential = null;

// Google Identity Services must be initialized once per page, not on every render
// of the button, or it logs a warning and may drop the earlier callback.
function initializeGoogle(google, clientId) {
  if (googleInitializedFor === clientId) return;
  google.accounts.id.initialize({
    client_id: clientId,
    callback: ({ credential }) => handleGoogleCredential?.(credential),
  });
  googleInitializedFor = clientId;
}

// Loads Google Identity Services once per page load.
function loadGoogleScript() {
  if (!googleScript) {
    googleScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve(window.google);
      script.onerror = () => {
        googleScript = null;
        reject(new Error('Could not load Google sign-in.'));
      };
      document.head.appendChild(script);
    });
  }
  return googleScript;
}

// Renders nothing until the server reports a Google client ID, so Google sign-in
// stays invisible wherever GOOGLE_CLIENT_ID is not configured.
function GoogleSignIn({ mode, onCredential }) {
  const [clientId, setClientId] = useState(null);
  const buttonRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    handleGoogleCredential = (credential) => onCredentialRef.current(credential);
    return () => {
      handleGoogleCredential = null;
    };
  }, []);

  useEffect(() => {
    Meteor.call('playerAccounts.googleClientId', (err, id) => {
      if (!err && id) setClientId(id);
    });
  }, []);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    loadGoogleScript()
      .then((google) => {
        if (cancelled || !buttonRef.current) return;
        initializeGoogle(google, clientId);
        buttonRef.current.replaceChildren();
        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: mode === 'register' ? 'signup_with' : 'signin_with',
          width: Math.min(buttonRef.current.offsetWidth, GOOGLE_BUTTON_MAX_WIDTH),
        });
      })
      .catch(() => {
        if (!cancelled) setClientId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, mode]);

  if (!clientId) return null;

  return (
    <>
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-hairline" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg3">Or</span>
        <div className="h-px flex-1 bg-hairline" />
      </div>
      <div ref={buttonRef} className="flex min-h-[44px] w-full justify-center" />
    </>
  );
}

const DISPLAY_NAME_MAX_LENGTH = 40;

// Shown instead of the register / sign-in form once a player is signed in.
function AccountDetails({ account }) {
  const [displayName, setDisplayName] = useState(account.displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const trimmed = displayName.trim().replace(/\s+/g, ' ');
  const unchanged = trimmed === account.displayName;

  const save = async () => {
    if (saving || unchanged || !trimmed) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await updateDisplayName(trimmed);
      setDisplayName(updated.displayName);
      setSaved(true);
    } catch (err) {
      setError(err.reason || 'Could not update your display name.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1 className="mb-2 font-outfit text-3xl font-extrabold text-fg">Your account</h1>
      <p className="mb-5 font-manrope text-sm text-fg3">
        Your display name is how you appear on the global leaderboard. No one else can use it.
      </p>

      <label className="mb-3 block">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-fg3">Display name</span>
        <input
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
            setError('');
            setSaved(false);
          }}
          onKeyDown={submitOnEnter(save)}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          className="w-full rounded-xl border border-hairline bg-bg px-3.5 py-3 font-outfit font-semibold text-fg outline-none placeholder:text-fg3"
          style={{ caretColor: PRIMARY }}
        />
      </label>

      <div className="mb-4">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-fg3">Email</span>
        <p className="font-outfit font-semibold text-fg2">{account.email}</p>
      </div>

      {error && <p className="mb-3 font-manrope text-[13px] text-red-400">{error}</p>}
      {saved && !error && <p className="mb-3 font-manrope text-[13px] text-fg2">Display name saved.</p>}

      <button
        onClick={save}
        disabled={saving || unchanged || !trimmed}
        className="w-full cursor-pointer rounded-xl border-none px-4 py-3 font-outfit font-extrabold disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: PRIMARY, color: BG }}
      >
        {saving ? 'Please wait...' : 'Save Display Name'}
      </button>

      <button
        onClick={signOut}
        className="mt-3 w-full cursor-pointer rounded-xl border border-hairline bg-transparent px-4 py-2.5 font-outfit text-[12px] font-semibold uppercase tracking-[0.1em] text-fg2"
      >
        Sign Out
      </button>
    </>
  );
}

export function Account() {
  const navigate = useNavigate();
  const signedInAccount = useSignedInAccount();
  const sessionResuming = useSessionResuming();

  const [mode, setMode] = useState('register');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  const register = () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    setError('');

    Meteor.call('playerAccounts.register', { displayName, email, password }, (err, account) => {
      setSaving(false);

      if (err) {
        setError(err.reason || 'Could not create account.');
        return;
      }

      setSession(account);
      navigate('/play');
    });
  };

  const signIn = () => {
    setSaving(true);
    setError('');

    Meteor.call('playerAccounts.signIn', { email, password }, (err, account) => {
      setSaving(false);

      if (err) {
        setError(err.reason || 'Could not sign in.');
        return;
      }

      setSession(account);
      navigate('/play');
    });
  };

  const googleSignIn = (credential) => {
    setSaving(true);
    setError('');

    Meteor.call('playerAccounts.googleSignIn', credential, (err, account) => {
      setSaving(false);

      if (err) {
        setError(err.reason || 'Google sign-in failed. Please try again.');
        return;
      }

      setSession(account);
      navigate('/play');
    });
  };

  const submit = () => {
    if (saving) return;
    if (mode === 'register') register();
    else signIn();
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.05} />

      <TopBar
        right={
          <button
            onClick={() => navigate('/play')}
            className="cursor-pointer rounded-lg border border-hairline bg-surface px-3 py-2 font-outfit text-[12px] font-semibold uppercase tracking-wider text-fg2"
          >
            Back
          </button>
        }
      />

      <div className="relative flex flex-1 items-center justify-center px-7 pb-10">
        <div className="w-full max-w-md rounded-[22px] border border-hairline bg-surface p-5">
          <div
            className="mb-5 h-1 rounded-full"
            style={{ background: `linear-gradient(90deg, ${TILE.pink}, ${TILE.amber}, ${TILE.teal}, ${TILE.violet})` }}
          />

          {sessionResuming ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-kimply-pulse rounded-full" style={{ background: PRIMARY }} />
            </div>
          ) : signedInAccount ? (
            <AccountDetails key={signedInAccount._id} account={signedInAccount} />
          ) : (
            <>
              <h1 className="mb-2 font-outfit text-3xl font-extrabold text-fg">
                {mode === 'register' ? 'Create account' : 'Sign in'}
              </h1>

              <p className="mb-5 font-manrope text-sm text-fg3">
                {mode === 'register'
                  ? 'Register with an email and password so your stats can be saved.'
                  : 'Sign in with your email and password to continue saving stats.'}
              </p>

              <div className="mb-5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => switchMode('register')}
                  className="cursor-pointer rounded-xl border px-4 py-2.5 font-outfit font-bold"
                  style={{
                    background: mode === 'register' ? PRIMARY : 'transparent',
                    color: mode === 'register' ? BG : 'oklch(0.72 0.01 270)',
                    borderColor: mode === 'register' ? PRIMARY : HAIRLINE,
                  }}
                >
                  Register
                </button>

                <button
                  onClick={() => switchMode('signin')}
                  className="cursor-pointer rounded-xl border px-4 py-2.5 font-outfit font-bold"
                  style={{
                    background: mode === 'signin' ? PRIMARY : 'transparent',
                    color: mode === 'signin' ? BG : 'oklch(0.72 0.01 270)',
                    borderColor: mode === 'signin' ? PRIMARY : HAIRLINE,
                  }}
                >
                  Sign in
                </button>
              </div>

              {mode === 'register' && (
                <label className="mb-3 block">
                  <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-fg3">
                    Display name
                  </span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    onKeyDown={submitOnEnter(submit)}
                    placeholder="Your name"
                    maxLength={40}
                    className="w-full rounded-xl border border-hairline bg-bg px-3.5 py-3 font-outfit font-semibold text-fg outline-none placeholder:text-fg3"
                    style={{ caretColor: PRIMARY }}
                  />
                </label>
              )}

              <label className="mb-3 block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-fg3">Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={submitOnEnter(submit)}
                  placeholder="you@example.com"
                  maxLength={80}
                  className="w-full rounded-xl border border-hairline bg-bg px-3.5 py-3 font-outfit font-semibold text-fg outline-none placeholder:text-fg3"
                  style={{ caretColor: PRIMARY }}
                />
              </label>

              <label className="mb-3 block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-fg3">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={submitOnEnter(submit)}
                  placeholder="At least 8 characters"
                  maxLength={80}
                  className="w-full rounded-xl border border-hairline bg-bg px-3.5 py-3 font-outfit font-semibold text-fg outline-none placeholder:text-fg3"
                  style={{ caretColor: PRIMARY }}
                />
              </label>

              {mode === 'register' && (
                <label className="mb-4 block">
                  <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-fg3">
                    Confirm password
                  </span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    onKeyDown={submitOnEnter(submit)}
                    placeholder="Re-enter your password"
                    maxLength={80}
                    className="w-full rounded-xl border border-hairline bg-bg px-3.5 py-3 font-outfit font-semibold text-fg outline-none placeholder:text-fg3"
                    style={{ caretColor: PRIMARY }}
                  />
                </label>
              )}

              {error && <p className="mb-3 font-manrope text-[13px] text-red-400">{error}</p>}

              <button
                onClick={submit}
                disabled={saving}
                className="w-full cursor-pointer rounded-xl border-none px-4 py-3 font-outfit font-extrabold disabled:opacity-60"
                style={{ background: PRIMARY, color: BG }}
              >
                {saving ? 'Please wait...' : mode === 'register' ? 'Create Account' : 'Sign In'}
              </button>

              <GoogleSignIn mode={mode} onCredential={googleSignIn} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
