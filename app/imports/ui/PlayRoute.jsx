import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { BG, PRIMARY, TILE, HAIRLINE, FG2, TileLattice, Wordmark, Avatar, avatarColor, ArrowIcon } from './design';

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
      className="relative text-left rounded-[18px] p-5 flex flex-col gap-2.5 overflow-hidden min-h-[150px] transition-opacity"
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
      <div className="flex justify-between items-start">
        {kind === 'create' ? (
          <div className="relative w-11 h-11">
            <div className="absolute inset-0 grid gap-[3px]" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
              <div className="rounded-[6px]" style={{ background: TILE.pink }} />
              <div className="rounded-[6px]" style={{ background: TILE.amber }} />
              <div className="rounded-[6px]" style={{ background: TILE.teal }} />
              <div className="rounded-[6px]" style={{ background: TILE.violet }} />
            </div>
            <div
              className="absolute inset-[30%] rounded-full flex items-center justify-center font-outfit font-extrabold text-sm"
              style={{ background: primary ? BG : color, color: primary ? color : 'white' }}
            >+</div>
          </div>
        ) : (
          <div
            className="w-11 h-11 rounded-[10px] flex items-center justify-center"
            style={{ border: `2px dashed ${primary ? BG : color}` }}
          >
            <ArrowIcon size={18} stroke={primary ? BG : color} />
          </div>
        )}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: primary ? `color-mix(in oklab, ${BG} 12%, transparent)` : `color-mix(in oklab, ${color} 18%, transparent)` }}
        >
          <ArrowIcon size={14} stroke={primary ? BG : color} />
        </div>
      </div>

      <div className="mt-auto">
        <div className="font-outfit font-extrabold text-2xl leading-tight tracking-tight">{title}</div>
        <div
          className="font-manrope font-medium text-[13px] mt-1.5 leading-snug"
          style={{ color: primary ? `color-mix(in oklab, ${BG} 70%, transparent)` : 'oklch(0.55 0.015 270)' }}
        >{blurb}</div>
      </div>
    </button>
  );
}

export function PlayRoute() {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const { state } = useLocation();
  const wasKicked = state?.kicked === true;

  const trimmedName = name.trim();
  const hasName = trimmedName.length > 0;

  const handleCreate = () => {
    if (!hasName || loading) return;
    setLoading(true);
    setError('');
    Meteor.call('rooms.create', trimmedName, (err, result) => {
      setLoading(false);
      if (err) { setError('Could not create room. Try again.'); return; }
      navigate(`/play/${result.pin}`, { state: { playerName: trimmedName, isHost: true } });
    });
  };

  const handleJoin = () => {
    if (!hasName) return;
    navigate('/play/join', { state: { playerName: trimmedName } });
  };

  return (
    <div className="relative w-full h-full bg-bg text-fg overflow-hidden flex flex-col">
      <TileLattice opacity={0.05} />

      {/* top bar */}
      <div className="relative flex justify-between items-center px-7 py-5 shrink-0">
        <Wordmark />
        <span className="font-mono text-[11px] text-fg3 uppercase tracking-widest">v1.0.0</span>
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center gap-7 px-7 pb-14 overflow-y-auto">
        {/* username */}
        <div className="w-full max-w-md">
          <p className="font-mono text-[11px] text-fg3 uppercase tracking-[0.16em] mb-2.5">Username</p>

          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => hasName && setEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && hasName && setEditing(false)}
              placeholder="Enter your username"
              maxLength={30}
              className="w-full bg-surface border border-hairline rounded-[14px] px-4 py-3.5 font-outfit font-semibold text-lg text-fg outline-none placeholder:text-fg3"
              style={{ caretColor: PRIMARY }}
            />
          ) : (
            <div className="flex items-center gap-3 bg-surface border border-hairline rounded-[14px] px-4 py-3.5">
              <Avatar letter={trimmedName[0]?.toUpperCase()} color={avatarColor(trimmedName)} size={36} />
              <span className="flex-1 font-outfit font-semibold text-lg text-fg">{trimmedName}</span>
              <button
                onClick={() => setEditing(true)}
                className="w-8 h-8 rounded-lg bg-transparent border-none text-fg2 cursor-pointer inline-flex items-center justify-center"
              >
                <PencilIcon size={14} />
              </button>
            </div>
          )}
        </div>

        {wasKicked && (
          <p className="font-manrope text-[13px] text-center px-4 py-2 rounded-lg"
            style={{ color: 'oklch(0.83 0.16 80)', background: 'color-mix(in oklab, oklch(0.83 0.16 80) 12%, transparent)' }}>
            You were removed from the room by the host.
          </p>
        )}
        {error && <p className="font-manrope text-[13px] text-red-400 m-0">{error}</p>}

        {/* route cards */}
        <div className="w-full max-w-2xl grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <RouteCard
            kind="create" title="Create Room TESTING" blurb="Start a new game and invite friends."
            color={PRIMARY} primary disabled={!hasName || loading} onClick={handleCreate}
          />
          <RouteCard
            kind="join" title="Join Room" blurb="Enter a room code to join a game."
            color={TILE.violet} disabled={!hasName} onClick={handleJoin}
          />
        </div>

        {!hasName && (
          <p className="font-manrope text-[13px] text-fg3 text-center">Enter a username above to continue</p>
        )}
      </div>
    </div>
  );
}
