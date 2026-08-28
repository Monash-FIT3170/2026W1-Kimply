import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BG, PRIMARY, TILE, TileLattice } from '../components/design';
import { playMusic } from '../music';
import { playClick } from '../feedback';

const MENU_MUSIC = '/music/menu.mp3';

function BigLogo() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid" style={{ gridTemplateColumns: '28px 28px', gridTemplateRows: '28px 28px', gap: 5 }}>
        <div
          className="rounded-lg"
          style={{
            background: TILE.pink,
            boxShadow: `0 6px 22px color-mix(in oklab, ${TILE.pink}   35%, transparent)`,
          }}
        />
        <div
          className="rounded-lg"
          style={{
            background: TILE.amber,
            boxShadow: `0 6px 22px color-mix(in oklab, ${TILE.amber}  30%, transparent)`,
          }}
        />
        <div
          className="rounded-lg"
          style={{
            background: TILE.teal,
            boxShadow: `0 6px 22px color-mix(in oklab, ${TILE.teal}   30%, transparent)`,
          }}
        />
        <div
          className="rounded-lg"
          style={{
            background: TILE.violet,
            boxShadow: `0 6px 22px color-mix(in oklab, ${TILE.violet} 35%, transparent)`,
          }}
        />
      </div>
      <div
        className="font-outfit font-extrabold leading-none text-fg"
        style={{ fontSize: 96, letterSpacing: '-0.04em' }}
      >
        KIMPLY
      </div>
    </div>
  );
}

export function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    playMusic(MENU_MUSIC);
  }, []);

  return (
    <div
      onClick={() => { playClick(); navigate('/play'); }}
      className="relative flex h-full w-full cursor-pointer flex-col overflow-hidden bg-bg text-fg"
    >
      <TileLattice opacity={0.09} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at center, ${BG} 0%, ${BG} 22%, transparent 70%)` }}
      />

      {/* top bar */}
      <div className="relative flex shrink-0 justify-between px-7 py-5">
        <span className="font-outfit text-2xl font-extrabold tracking-tight text-fg">KIMPLY</span>
      </div>

      {/* hero */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-4">
          <BigLogo />
        </div>
        <p className="mb-3 font-outfit text-lg font-semibold uppercase tracking-[0.12em] text-fg2">
          Multiplayer · Memory · Challenge
        </p>
        <p className="max-w-md font-manrope text-[17px] leading-snug text-fg3">
          Test your memory. Compete with friends.
        </p>
      </div>

      {/* CTA pill */}
      <div className="relative flex justify-center pb-14">
        <div
          className="inline-flex items-center gap-3 rounded-full px-6 py-3.5 font-outfit text-[13px] font-bold uppercase tracking-[0.18em]"
          style={{
            background: `color-mix(in oklab, ${PRIMARY} 14%, transparent)`,
            border: `1px solid color-mix(in oklab, ${PRIMARY} 50%, transparent)`,
            color: PRIMARY,
          }}
        >
          <span
            className="h-2 w-2 animate-kimply-pulse rounded-full"
            style={{
              background: PRIMARY,
              boxShadow: `0 0 0 4px color-mix(in oklab, ${PRIMARY} 30%, transparent)`,
            }}
          />
          Click anywhere to play
        </div>
      </div>
    </div>
  );
}
