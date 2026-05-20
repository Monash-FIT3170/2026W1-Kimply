import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import {
  BG,
  PRIMARY,
  TILE,
  HAIRLINE,
  TileLattice,
  Wordmark,
  Avatar,
  avatarColor,
  ArrowIcon,
} from '../components/design';
import { submitOnEnter } from '../keyboard';

function PencilIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="m3 13 .5-2.5L10 4l2 2-6.5 6.5L3 13Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m9 5 2 2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function RouteCard({ kind, title, blurb, color, primary, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative flex min-h-[150px] flex-col gap-2.5 overflow-hidden rounded-[18px] p-5 text-left transition-opacity"
      style={{
        background: primary ? color : 'oklch(0.20 0.02 270)',
        color: primary ? BG : 'oklch(0.97 0.006 80)',
        border: primary ? 'none' : `1px solid ${HAIRLINE}`,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: primary
          ? `0 12px 40px -10px color-mix(in oklab, ${color} 70%, transparent), inset 0 0 0 1px color-mix(in oklab, ${color} 50%, transparent)`
          : '0 6px 18px -10px rgba(0,0,0,0.5)',
      }}
    >
      <div className="flex items-start justify-between">
        {kind === 'create' ? (
          <div className="relative h-11 w-11">
            <div
              className="absolute inset-0 grid gap-[3px]"
              style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}
            >
              <div className="rounded-[6px]" style={{ background: TILE.pink }} />
              <div className="rounded-[6px]" style={{ background: TILE.amber }} />
              <div className="rounded-[6px]" style={{ background: TILE.teal }} />
              <div className="rounded-[6px]" style={{ background: TILE.violet }} />
            </div>
            <div
              className="absolute inset-[30%] flex items-center justify-center rounded-full font-outfit text-sm font-extrabold"
              style={{ background: primary ? BG : color, color: primary ? color : 'white' }}
            >
              +
            </div>
          </div>
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-[10px]"
            style={{ border: `2px dashed ${primary ? BG : color}` }}
          >
            <ArrowIcon size={18} stroke={primary ? BG : color} />
          </div>
        )}
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{
            background: primary
              ? `color-mix(in oklab, ${BG} 12%, transparent)`
              : `color-mix(in oklab, ${color} 18%, transparent)`,
          }}
        >
          <ArrowIcon size={14} stroke={primary ? BG : color} />
        </div>
      </div>

      <div className="mt-auto">
        <div className="font-outfit text-2xl font-extrabold leading-tight tracking-tight">{title}</div>
        <div
          className="mt-1.5 font-manrope text-[13px] font-medium leading-snug"
          style={{ color: primary ? `color-mix(in oklab, ${BG} 70%, transparent)` : 'oklch(0.55 0.015 270)' }}
        >
          {blurb}
        </div>
      </div>
    </button>
  );
}

export function PlayRoute() {
  const { state } = useLocation();
  const signedInAccount = state?.playerAccount;

  const [name, setName] = useState(signedInAccount?.displayName || '');
  const [editing, setEditing] = useState(!signedInAccount?.displayName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const wasKicked = state?.kicked === true;

  const trimmedName = name.trim();
  const hasName = trimmedName.length > 0;

  const handleCreate = () => {
    if (!hasName || loading) return;
    setLoading(true);
    setError('');
    Meteor.call('rooms.create', trimmedName, (err, result) => {
      setLoading(false);
      if (err) {
        setError('Could not create room. Try again.');
        return;
      }
      navigate(`/play/${result.pin}`, { state: { playerName: trimmedName, isHost: true } });
    });
  };

  const handleJoin = () => {
    if (!hasName) return;
    navigate('/play/join', { state: { playerName: trimmedName, playerAccount: signedInAccount } });
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.05} />

      {/* top bar */}
      <div className="relative flex shrink-0 items-center justify-between px-7 py-5">
        <Wordmark />
        <span className="font-mono text-[11px] uppercase tracking-widest text-fg3">v1.0.0</span>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 overflow-y-auto px-7 pb-14">
        {/* username */}
        <div className="w-full max-w-md">
          <p className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-fg3">Username</p>

          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => hasName && setEditing(false)}
              onKeyDown={submitOnEnter(() => setEditing(false), { when: () => hasName })}
              placeholder="Enter your username"
              maxLength={30}
              className="w-full rounded-[14px] border border-hairline bg-surface px-4 py-3.5 font-outfit text-lg font-semibold text-fg outline-none placeholder:text-fg3"
              style={{ caretColor: PRIMARY }}
            />
          ) : (
            <div className="flex items-center gap-3 rounded-[14px] border border-hairline bg-surface px-4 py-3.5">
              <Avatar letter={trimmedName[0]?.toUpperCase()} color={avatarColor(trimmedName)} size={36} />
              <span className="flex-1 font-outfit text-lg font-semibold text-fg">{trimmedName}</span>
              <button
                onClick={() => setEditing(true)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-fg2"
              >
                <PencilIcon size={14} />
              </button>
            </div>
          )}

          {signedInAccount ? (
            <p className="mt-3 text-center font-manrope text-[13px] text-fg3">Signed in as {signedInAccount.email}</p>
          ) : (
            <p className="mt-3 text-center font-manrope text-[13px] text-fg3">
              Want to save your stats?{' '}
              <Link to="/account" className="font-outfit font-bold text-fg">
                Sign up
              </Link>
            </p>
          )}
        </div>

        {wasKicked && (
          <p
            className="rounded-lg px-4 py-2 text-center font-manrope text-[13px]"
            style={{
              color: 'oklch(0.83 0.16 80)',
              background: 'color-mix(in oklab, oklch(0.83 0.16 80) 12%, transparent)',
            }}
          >
            You were removed from the room by the host.
          </p>
        )}
        {error && <p className="m-0 font-manrope text-[13px] text-red-400">{error}</p>}

        {/* route cards */}
        <div
          className="grid w-full max-w-2xl gap-3.5"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
        >
          <RouteCard
            kind="create"
            title="Create Room"
            blurb="Start a new game and invite friends."
            color={PRIMARY}
            primary
            disabled={!hasName || loading}
            onClick={handleCreate}
          />
          <RouteCard
            kind="join"
            title="Join Room"
            blurb="Enter a room code to join a game."
            color={TILE.violet}
            disabled={!hasName}
            onClick={handleJoin}
          />
        </div>

        {!hasName && (
          <p className="text-center font-manrope text-[13px] text-fg3">Enter a username above to continue</p>
        )}
      </div>
    </div>
  );
}
