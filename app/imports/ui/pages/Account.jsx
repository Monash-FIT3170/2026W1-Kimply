import { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useNavigate } from 'react-router-dom';
import { BG, HAIRLINE, PRIMARY, TILE, TileLattice, TopBar } from '../components/design';

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

    Meteor.call(
      'playerAccounts.register',
      { displayName, email, password },
      (err, account) => {
        setSaving(false);

        if (err) {
          setError(err.reason || 'Could not create account.');
          return;
        }

        navigate('/play', { state: { playerAccount: account } });
      }
    );
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

  const onKey = (event) => {
    if (event.key === 'Enter') submit();
  };

  return (
    <div className="relative w-full h-full bg-bg text-fg overflow-hidden flex flex-col">
      <TileLattice opacity={0.05} />

      <TopBar
        right={(
          <button
            onClick={() => navigate('/play')}
            className="font-outfit font-semibold text-[12px] uppercase tracking-wider px-3 py-2 rounded-lg border border-hairline text-fg2 bg-surface cursor-pointer"
          >
            Back
          </button>
        )}
      />

      <div className="relative flex-1 flex items-center justify-center px-7 pb-10">
        <div className="w-full max-w-md bg-surface border border-hairline rounded-[22px] p-5">
          <div
            className="h-1 rounded-full mb-5"
            style={{ background: `linear-gradient(90deg, ${TILE.pink}, ${TILE.amber}, ${TILE.teal}, ${TILE.violet})` }}
          />

          <h1 className="font-outfit font-extrabold text-3xl text-fg mb-2">
            {mode === 'register' ? 'Create account' : 'Sign in'}
          </h1>

          <p className="font-manrope text-sm text-fg3 mb-5">
            {mode === 'register'
              ? 'Register with an email and password so your stats can be saved.'
              : 'Sign in with your email and password to continue saving stats.'}
          </p>

          <div className="grid grid-cols-2 gap-2 mb-5">
            <button
              onClick={() => switchMode('register')}
              className="rounded-xl px-4 py-2.5 font-outfit font-bold border cursor-pointer"
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
              className="rounded-xl px-4 py-2.5 font-outfit font-bold border cursor-pointer"
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
            <label className="block mb-3">
              <span className="block font-mono text-[10px] text-fg3 uppercase tracking-widest mb-1.5">
                Display name
              </span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onKeyDown={onKey}
                placeholder="Your name"
                maxLength={40}
                className="w-full bg-bg border border-hairline rounded-xl px-3.5 py-3 font-outfit font-semibold text-fg outline-none placeholder:text-fg3"
                style={{ caretColor: PRIMARY }}
              />
            </label>
          )}

          <label className="block mb-3">
            <span className="block font-mono text-[10px] text-fg3 uppercase tracking-widest mb-1.5">
              Email
            </span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={onKey}
              placeholder="you@example.com"
              maxLength={80}
              className="w-full bg-bg border border-hairline rounded-xl px-3.5 py-3 font-outfit font-semibold text-fg outline-none placeholder:text-fg3"
              style={{ caretColor: PRIMARY }}
            />
          </label>

          <label className="block mb-3">
            <span className="block font-mono text-[10px] text-fg3 uppercase tracking-widest mb-1.5">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={onKey}
              placeholder="At least 8 characters"
              maxLength={80}
              className="w-full bg-bg border border-hairline rounded-xl px-3.5 py-3 font-outfit font-semibold text-fg outline-none placeholder:text-fg3"
              style={{ caretColor: PRIMARY }}
            />
          </label>

          {mode === 'register' && (
            <label className="block mb-4">
              <span className="block font-mono text-[10px] text-fg3 uppercase tracking-widest mb-1.5">
                Confirm password
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onKeyDown={onKey}
                placeholder="Re-enter your password"
                maxLength={80}
                className="w-full bg-bg border border-hairline rounded-xl px-3.5 py-3 font-outfit font-semibold text-fg outline-none placeholder:text-fg3"
                style={{ caretColor: PRIMARY }}
              />
            </label>
          )}

          {error && <p className="font-manrope text-[13px] text-red-400 mb-3">{error}</p>}

          <button
            onClick={submit}
            disabled={saving}
            className="w-full rounded-xl border-none px-4 py-3 font-outfit font-extrabold cursor-pointer disabled:opacity-60"
            style={{ background: PRIMARY, color: BG }}
          >
            {saving ? 'Please wait...' : mode === 'register' ? 'Create Account' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
