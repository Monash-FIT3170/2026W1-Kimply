import { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useNavigate } from 'react-router-dom';
import { BG, HAIRLINE, PRIMARY, TILE, TileLattice, TopBar } from '../components/design';
import { submitOnEnter } from '../keyboard';

export function Account() {
  const navigate = useNavigate();

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

      navigate('/play', { state: { playerAccount: account } });
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

      navigate('/play', { state: { playerAccount: account } });
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
        </div>
      </div>
    </div>
  );
}
