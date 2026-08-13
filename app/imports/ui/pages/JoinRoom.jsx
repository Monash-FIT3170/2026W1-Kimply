import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { PRIMARY, TILE, HAIRLINE, TileLattice, Wordmark, ArrowIcon, BackChevron, FG2 } from '../components/design';
import { combineKeyHandlers, removeOnBackspace, submitOnEnter } from '../keyboard';
import { appendRoomCodeInput, clearCapturedInput, roomCodeFromSearchParams } from '../roomCode';

const SLOTS = 5;

export function JoinRoom() {
  const [searchParams] = useSearchParams();
  const prefill = roomCodeFromSearchParams(searchParams, 'code', SLOTS);
  const [code, setCode] = useState(prefill);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { state } = useLocation();
  const [playerName, setPlayerName] = useState(state?.playerName || '');
  const playerAccount = state?.playerAccount;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const removeLastCodeCharacter = () => {
    setCode((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleInput = (e) => {
    setCode((prev) => appendRoomCodeInput(prev, e.target.value, SLOTS));
    setError('');
    clearCapturedInput(e);
  };

  const handleJoin = () => {
    if (code.length !== SLOTS || loading) return;
    setLoading(true);
    setError('');
    Meteor.call('rooms.join', code, playerName, playerAccount?._id, (err, res) => {
      setLoading(false);
      if (err) {
        const msg =
          {
            'not-found': 'Room not found. Check the code.',
            'not-lobby': 'This game has already started.',
            'name-taken': 'That name is already taken in this room.',
          }[err.error] ?? 'Something went wrong. Please try again.';
        setError(msg);
        return;
      }

      const reconnectData = {
        playerId : res.playerId,
        gameId : res.roomId
      }

      localStorage.setItem('reconnectData', JSON.stringify(reconnectData));
      navigate(`/play/${code}`, { state: { playerName, isHost: false, playerId: res.playerId, playerAccount } });
    });
  };

  const handleCodeKeyDown = combineKeyHandlers(removeOnBackspace(removeLastCodeCharacter), submitOnEnter(handleJoin));

  const canJoin = code.length === SLOTS && playerName.trim().length > 0 && !loading;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.05} />

      {/* top bar */}
      <div className="relative flex shrink-0 items-center justify-between px-7 py-5">
        <Wordmark />
        <button
          onClick={() => navigate(-1)}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-hairline bg-surface"
        >
          <BackChevron size={14} stroke={FG2} />
        </button>
      </div>

      {/* hidden keyboard capture */}
      <input
        ref={inputRef}
        onInput={handleInput}
        onKeyDown={handleCodeKeyDown}
        className="pointer-events-none absolute h-px w-px opacity-0"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />

      <div className="relative flex flex-1 flex-col items-center justify-center gap-9 px-6">
        <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-fg3">Enter Room Code</p>

        {/* Code slots */}
        <div className="flex cursor-text gap-3" onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: SLOTS }).map((_, i) => {
            const ch = code[i];
            const filled = ch !== undefined;
            const active = !filled && i === code.length;
            return (
              <div
                key={i}
                className="relative flex items-center justify-center rounded-2xl font-mono font-bold"
                style={{
                  width: 76,
                  height: 96,
                  fontSize: 52,
                  background: filled ? 'oklch(0.24 0.02 270)' : 'oklch(0.20 0.02 270)',
                  border: `2px solid ${active ? PRIMARY : filled ? HAIRLINE : 'transparent'}`,
                  color: filled ? 'oklch(0.97 0.006 80)' : 'oklch(0.55 0.015 270)',
                  boxShadow: active ? `0 0 0 4px color-mix(in oklab, ${PRIMARY} 22%, transparent)` : 'none',
                }}
              >
                {filled ? (
                  ch
                ) : active ? (
                  <span className="inline-block h-11 w-[3px] animate-kimply-caret" style={{ background: PRIMARY }} />
                ) : null}
                <div
                  className="absolute bottom-2 rounded-sm"
                  style={{
                    left: '20%',
                    right: '20%',
                    height: 3,
                    background: filled ? TILE.violet : 'transparent',
                  }}
                />
              </div>
            );
          })}
        </div>

        <p className="text-center font-manrope text-[13px] font-medium tracking-wide text-fg3">
          5-character code · Ask the host to share theirs
        </p>

        {!state?.playerName && (
          <div className="w-full max-w-sm">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-fg3">Username</p>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={submitOnEnter(handleJoin)}
              placeholder="Enter your username"
              maxLength={30}
              className="w-full rounded-[14px] border border-hairline bg-surface px-4 py-3 font-outfit text-base font-semibold text-fg outline-none placeholder:text-fg3"
              style={{ caretColor: PRIMARY }}
            />
          </div>
        )}

        {error && <p className="m-0 text-center font-manrope text-[13px] text-red-400">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={!canJoin}
          className="inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 font-outfit text-sm font-extrabold uppercase tracking-[0.14em] transition-all"
          style={{
            background: canJoin ? PRIMARY : `color-mix(in oklab, ${PRIMARY} 30%, oklch(0.14 0.02 270))`,
            color: 'oklch(0.14 0.02 270)',
            cursor: canJoin ? 'pointer' : 'not-allowed',
            border: 'none',
            boxShadow: canJoin ? `0 12px 40px -10px color-mix(in oklab, ${PRIMARY} 70%, transparent)` : 'none',
          }}
        >
          {loading ? 'Joining...' : 'Join Room'}
          <ArrowIcon size={14} stroke="oklch(0.14 0.02 270)" />
        </button>
      </div>
    </div>
  );
}
