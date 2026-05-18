// Shared Kimply design system — tokens and shared components.
// Raw color values are only used where Tailwind arbitrary values are unavoidable
// (e.g. color-mix(), dynamic gradients, box-shadows with oklch).

export const TILE = {
  pink:   'oklch(0.72 0.19 12)',
  amber:  'oklch(0.83 0.16 80)',
  teal:   'oklch(0.78 0.13 195)',
  violet: 'oklch(0.66 0.19 295)',
};
export const PRIMARY  = 'oklch(0.86 0.19 130)';
export const BG       = 'oklch(0.14 0.02 270)';
export const HAIRLINE = 'oklch(0.32 0.02 270)';
export const FG2      = 'oklch(0.72 0.01 270)';

const TILE_COLORS = [TILE.pink, TILE.amber, TILE.teal, TILE.violet, PRIMARY];

export function avatarColor(name = '') {
  return TILE_COLORS[name.charCodeAt(0) % TILE_COLORS.length] ?? TILE.pink;
}

export function TileLattice({ opacity = 0.07 }) {
  const cells = 7;
  const colors = [TILE.pink, TILE.amber, TILE.teal, TILE.violet];
  const pattern = [
    [0,1,2,3,0,1,2],[3,0,1,2,3,0,1],[2,3,0,1,2,3,0],[1,2,3,0,1,2,3],
    [0,1,2,3,0,1,2],[3,0,1,2,3,0,1],[2,3,0,1,2,3,0],
  ];
  return (
    <div
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        inset:'-10%', opacity,
        display:'grid',
        gridTemplateColumns:`repeat(${cells}, 1fr)`,
        gridTemplateRows:`repeat(${cells}, 1fr)`,
        gap:'2.5%', transform:'rotate(-8deg) scale(1.2)',
        filter:'blur(0.3px)',
      }}
    >
      {Array.from({ length: cells * cells }).map((_, i) => {
        const r = Math.floor(i / cells), c = i % cells;
        return (
          <div key={i} style={{ background: colors[pattern[r % 7][c % 7]], borderRadius:'14%' }} />
        );
      })}
    </div>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span className="font-outfit font-extrabold text-2xl text-fg tracking-tight leading-none">
        KIMPLY
      </span>
      <span className="grid self-start mt-0.5" style={{ gridTemplateColumns:'6px 6px', gridTemplateRows:'6px 6px', gap:2 }}>
        <span className="rounded-sm" style={{ background: TILE.pink }} />
        <span className="rounded-sm" style={{ background: TILE.amber }} />
        <span className="rounded-sm" style={{ background: TILE.teal }} />
        <span className="rounded-sm" style={{ background: TILE.violet }} />
      </span>
    </div>
  );
}

export function Avatar({ letter, color, size = 32 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-outfit font-extrabold shrink-0"
      style={{
        width: size, height: size,
        background:`linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, black 20%))`,
        fontSize: size * 0.45,
        color:'oklch(0.18 0.02 270)',
        boxShadow:`0 4px 12px -4px color-mix(in oklab, ${color} 60%, transparent)`,
      }}
    >
      {letter}
    </div>
  );
}

export function ReadyChip({ ready }) {
  if (!ready) return (
    <span className="font-outfit font-semibold text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full border border-hairline text-fg3">
      Waiting
    </span>
  );
  return (
    <span
      className="inline-flex items-center gap-1 font-outfit font-bold text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full"
      style={{
        background:`color-mix(in oklab, ${PRIMARY} 16%, transparent)`,
        color: PRIMARY,
        border:`1px solid color-mix(in oklab, ${PRIMARY} 40%, transparent)`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIMARY }} />
      Ready
    </span>
  );
}

export function ArrowIcon({ size = 14, stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function BackChevron({ size = 14, stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M13 8H3M7 12l-4-4 4-4" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function CopyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 11V3a1 1 0 0 1 1-1h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-9 h-9 rounded-[10px] bg-surface border border-hairline inline-flex items-center justify-center cursor-pointer text-fg2"
    >
      <BackChevron size={14} stroke={FG2} />
    </button>
  );
}

export function TopBar({ onBack, right }) {
  return (
    <div className="relative flex justify-between items-center px-7 py-5 shrink-0">
      <Wordmark />
      {onBack ? <BackButton onClick={onBack} /> : right}
    </div>
  );
}
