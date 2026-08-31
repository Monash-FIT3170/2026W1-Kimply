import { useNavigate } from 'react-router-dom';
import { BG, PRIMARY, TILE, TileLattice } from '../components/design';

function BigLogo() {
  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4">
      <div className="grid" style={{ gridTemplateColumns: 'clamp(22px, 3.5vw, 28px) clamp(22px, 3.5vw, 28px)', gridTemplateRows: 'clamp(22px, 3.5vw, 28px) clamp(22px, 3.5vw, 28px)', gap: 5 }}>
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
        style={{ fontSize: 'clamp(3.5rem, 10vw, 6rem)', letterSpacing: '-0.04em' }}
      >
        KIMPLY
      </div>
    </div>
  );
}

export function Splash() {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate('/play')}
      className="relative flex min-h-full w-full cursor-pointer flex-col overflow-hidden bg-bg text-fg"
    >
      <TileLattice opacity={0.09} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at center, ${BG} 0%, ${BG} 22%, transparent 70%)` }}
      />

      {/* top bar */}
      <div className="relative flex shrink-0 justify-between px-6 py-4 sm:px-7 sm:py-5">
        <span className="font-outfit text-xl font-extrabold tracking-tight text-fg sm:text-2xl">KIMPLY</span>
      </div>

      {/* hero */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-4 text-center">
        <div className="mb-4 sm:mb-6">
          <BigLogo />
        </div>
        <p className="mb-3 font-outfit text-sm font-semibold uppercase tracking-[0.12em] text-fg2 sm:text-lg">
          Multiplayer · Memory · Challenge
        </p>
        <p className="max-w-md font-manrope text-sm leading-snug text-fg3 sm:text-[17px]">
          Test your memory. Compete with friends.
        </p>
      </div>

      {/* CTA pill */}
      <div className="relative flex justify-center px-6 pb-8 sm:pb-14">
        <div
          className="inline-flex max-w-full items-center gap-3 rounded-full px-5 py-3 text-center font-outfit text-[11px] font-bold uppercase tracking-[0.18em] sm:px-6 sm:py-3.5 sm:text-[13px]"
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
