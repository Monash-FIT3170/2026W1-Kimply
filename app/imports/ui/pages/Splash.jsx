import { useNavigate } from 'react-router-dom';
import { BG, PRIMARY, TILE, TileLattice } from '../components/design';

function BigLogo() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid" style={{ gridTemplateColumns:'28px 28px', gridTemplateRows:'28px 28px', gap:5 }}>
        <div className="rounded-lg" style={{ background: TILE.pink,   boxShadow:`0 6px 22px color-mix(in oklab, ${TILE.pink}   35%, transparent)` }} />
        <div className="rounded-lg" style={{ background: TILE.amber,  boxShadow:`0 6px 22px color-mix(in oklab, ${TILE.amber}  30%, transparent)` }} />
        <div className="rounded-lg" style={{ background: TILE.teal,   boxShadow:`0 6px 22px color-mix(in oklab, ${TILE.teal}   30%, transparent)` }} />
        <div className="rounded-lg" style={{ background: TILE.violet, boxShadow:`0 6px 22px color-mix(in oklab, ${TILE.violet} 35%, transparent)` }} />
      </div>
      <div className="font-outfit font-extrabold text-fg leading-none" style={{ fontSize:96, letterSpacing:'-0.04em' }}>
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
      className="relative w-full h-full bg-bg text-fg overflow-hidden flex flex-col cursor-pointer"
    >
      <TileLattice opacity={0.09} />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background:`radial-gradient(ellipse at center, ${BG} 0%, ${BG} 22%, transparent 70%)` }}
      />

      {/* top bar */}
      <div className="relative flex justify-between px-7 py-5 shrink-0">
        <span className="font-outfit font-extrabold text-2xl text-fg tracking-tight">KIMPLY</span>
        <span className="font-mono text-[11px] text-fg3 uppercase tracking-widest">v1.0.0</span>
      </div>

      {/* hero */}
      <div className="relative flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="mb-4"><BigLogo /></div>
        <p className="font-outfit font-semibold text-lg text-fg2 uppercase tracking-[0.12em] mb-3">
          Multiplayer · Memory · Challenge
        </p>
        <p className="font-manrope text-[17px] text-fg3 max-w-md leading-snug">
          Test your memory. Compete with friends.
        </p>
      </div>

      {/* CTA pill */}
      <div className="relative flex justify-center pb-14">
        <div
          className="inline-flex items-center gap-3 px-6 py-3.5 rounded-full font-outfit font-bold text-[13px] uppercase tracking-[0.18em]"
          style={{
            background:`color-mix(in oklab, ${PRIMARY} 14%, transparent)`,
            border:`1px solid color-mix(in oklab, ${PRIMARY} 50%, transparent)`,
            color: PRIMARY,
          }}
        >
          <span
            className="w-2 h-2 rounded-full animate-kimply-pulse"
            style={{ background: PRIMARY, boxShadow:`0 0 0 4px color-mix(in oklab, ${PRIMARY} 30%, transparent)` }}
          />
          Click anywhere to play
        </div>
      </div>
    </div>
  );
}
