import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { PRIMARY, TILE, HAIRLINE, TileLattice, Wordmark, ArrowIcon, BackChevron, FG2 } from '../components/design';

const SLOTS = 5;

export function JoinRoom() {
  const [searchParams] = useSearchParams();
  const prefill = (searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, SLOTS);
  const [code, setCode] = useState(prefill);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { state } = useLocation();
  const [playerName, setPlayerName] = useState(state?.playerName || '');

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace') { setCode(prev => prev.slice(0, -1)); setError(''); }
  };

  const handleInput = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setCode(prev => (prev + val).slice(0, SLOTS));
    setError('');
    e.target.value = '';
  };

  const handleJoin = () => {
    if (code.length !== SLOTS || loading) return;
    setLoading(true);
    setError('');
    Meteor.call('rooms.join', code, playerName, (err, res) => {
      setLoading(false);
      if (err) {
        const msg = {
          'not-found': 'Room not found. Check the code.',
          'not-lobby': 'This game has already started.',
          'name-taken': 'That name is already taken in this room.',
        }[err.error] ?? 'Something went wrong. Please try again.';
        setError(msg);
        return;
      }

      const reconnectData = {
        playerId : res.playerId,
        gameId : res.gameId
      }
      
      localStorage.setItem('reconnectData', JSON.stringify(reconnectData));
      navigate(`/play/${code}`, { state: { playerName, isHost: false, playerId: res.playerId } });
    });
  };

  const canJoin = code.length === SLOTS && playerName.trim().length > 0 && !loading;

  return (
    <div className="relative w-full h-full bg-bg text-fg overflow-hidden flex flex-col">
      <TileLattice opacity={0.05} />

      {/* top bar */}
      <div className="relative flex justify-between items-center px-7 py-5 shrink-0">
        <Wordmark />
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-[10px] bg-surface border border-hairline inline-flex items-center justify-center cursor-pointer"
        >
          <BackChevron size={14} stroke={FG2} />
        </button>
      </div>

      {/* hidden keyboard capture */}
      <input
        ref={inputRef}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className="absolute opacity-0 w-px h-px pointer-events-none"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />

      <div className="relative flex-1 flex flex-col items-center justify-center gap-9 px-6">
        <p className="font-mono text-[12px] text-fg3 uppercase tracking-[0.18em]">Enter Room Code</p>

        {/* Code slots */}
        <div className="flex gap-3 cursor-text" onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: SLOTS }).map((_, i) => {
            const ch = code[i];
            const filled = ch !== undefined;
            const active = !filled && i === code.length;
            return (
              <div
                key={i}
                className="relative flex items-center justify-center rounded-2xl font-mono font-bold"
                style={{
                  width:76, height:96, fontSize:52,
                  background: filled ? 'oklch(0.24 0.02 270)' : 'oklch(0.20 0.02 270)',
                  border:`2px solid ${active ? PRIMARY : filled ? HAIRLINE : 'transparent'}`,
                  color: filled ? 'oklch(0.97 0.006 80)' : 'oklch(0.55 0.015 270)',
                  boxShadow: active ? `0 0 0 4px color-mix(in oklab, ${PRIMARY} 22%, transparent)` : 'none',
                }}
              >
                {filled ? ch : active ? (
                  <span className="inline-block w-[3px] h-11 animate-kimply-caret" style={{ background: PRIMARY }} />
                ) : null}
                <div
                  className="absolute bottom-2 rounded-sm"
                  style={{ left:'20%', right:'20%', height:3, background: filled ? TILE.violet : 'transparent' }}
                />
              </div>
            );
          })}
        </div>

        <p className="font-manrope font-medium text-[13px] text-fg3 tracking-wide text-center">
          5-character code · Ask the host to share theirs
        </p>

        {!state?.playerName && (
          <div className="w-full max-w-sm">
            <p className="font-mono text-[11px] text-fg3 uppercase tracking-[0.16em] mb-2">Username</p>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your username"
              maxLength={30}
              className="w-full bg-surface border border-hairline rounded-[14px] px-4 py-3 font-outfit font-semibold text-base text-fg outline-none placeholder:text-fg3"
              style={{ caretColor: PRIMARY }}
            />
          </div>
        )}

        {error && <p className="font-manrope text-[13px] text-red-400 m-0 text-center">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={!canJoin}
          className="inline-flex items-center gap-2.5 font-outfit font-extrabold text-sm uppercase tracking-[0.14em] px-7 py-3.5 rounded-xl transition-all"
          style={{
            background: canJoin ? PRIMARY : `color-mix(in oklab, ${PRIMARY} 30%, oklch(0.14 0.02 270))`,
            color: 'oklch(0.14 0.02 270)',
            cursor: canJoin ? 'pointer' : 'not-allowed',
            border: 'none',
            boxShadow: canJoin ? `0 12px 40px -10px color-mix(in oklab, ${PRIMARY} 70%, transparent)` : 'none',
          }}
        >
          {loading ? 'Joining…' : 'Join Room'}
          <ArrowIcon size={14} stroke="oklch(0.14 0.02 270)" />
        </button>
      </div>
    </div>
  );
}
