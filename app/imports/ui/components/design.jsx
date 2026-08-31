import { useState } from "react";
// Shared Kimply design system — tokens and shared components.
// Raw color values are only used where Tailwind arbitrary values are unavoidable
// (e.g. color-mix(), dynamic gradients, box-shadows with oklch).

export const TILE = {
  pink: 'oklch(0.72 0.19 12)',
  amber: 'oklch(0.83 0.16 80)',
  teal: 'oklch(0.78 0.13 195)',
  violet: 'oklch(0.66 0.19 295)',
};
export const PRIMARY  = 'oklch(0.86 0.19 130)';
export const BG       = 'oklch(0.14 0.02 270)';
export const SURFACE  = 'oklch(0.18 0.02 270)';
export const HAIRLINE = 'oklch(0.32 0.02 270)';
export const FG       = "oklch(0.96 0.01 270)";
export const FG2      = 'oklch(0.72 0.01 270)';
export const FG3      = "oklch(0.50 0.01 270)";
export const DANGER   = 'oklch(0.68 0.22 22)';
export const ACCENT   = 'oklch(0.72 0.18 195)';
const TILE_COLORS = [TILE.pink, TILE.amber, TILE.teal, TILE.violet, PRIMARY];

export function avatarColor(name = '') {
  return TILE_COLORS[name.charCodeAt(0) % TILE_COLORS.length] ?? TILE.pink;
}

export function PencilIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="m3 13 .5-2.5L10 4l2 2-6.5 6.5L3 13Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m9 5 2 2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function TileLattice({ opacity = 0.07 }) {
  const cells = 7;
  const colors = [TILE.pink, TILE.amber, TILE.teal, TILE.violet];
  const pattern = [
    [0, 1, 2, 3, 0, 1, 2],
    [3, 0, 1, 2, 3, 0, 1],
    [2, 3, 0, 1, 2, 3, 0],
    [1, 2, 3, 0, 1, 2, 3],
    [0, 1, 2, 3, 0, 1, 2],
    [3, 0, 1, 2, 3, 0, 1],
    [2, 3, 0, 1, 2, 3, 0],
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        inset: '-10%',
        opacity,
        display: 'grid',
        gridTemplateColumns: `repeat(${cells}, 1fr)`,
        gridTemplateRows: `repeat(${cells}, 1fr)`,
        gap: '2.5%',
        transform: 'rotate(-8deg) scale(1.2)',
        filter: 'blur(0.3px)',
      }}
    >
      {Array.from({ length: cells * cells }).map((_, i) => {
        const r = Math.floor(i / cells),
          c = i % cells;
        return <div key={i} style={{ background: colors[pattern[r % 7][c % 7]], borderRadius: '14%' }} />;
      })}
    </div>
  );
}

export function RainbowBar({className = ""}){
  return(
    <div 
      className= {className}
      style={{
        background:`linear-gradient(90deg, ${TILE.pink}, ${TILE.amber}, ${TILE.teal}, ${TILE.violet})`, 
        flexShrink: 0,
      }} />
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span className="font-outfit text-2xl font-extrabold leading-none tracking-tight text-fg">KIMPLY</span>
    </div>
  );
}

export function Avatar({ letter, color, size = 32 }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-outfit font-extrabold"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, black 20%))`,
        fontSize: size * 0.45,
        color: 'oklch(0.18 0.02 270)',
        boxShadow: `0 4px 12px -4px color-mix(in oklab, ${color} 60%, transparent)`,
      }}
    >
      {letter}
    </div>
  );
}

export function ReadyChip({ ready }) {
  if (!ready)
    return (
      <span className="rounded-full border border-hairline px-2.5 py-1 font-outfit text-[11px] font-semibold uppercase tracking-wider text-fg3">
        Waiting
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-outfit text-[11px] font-bold uppercase tracking-wider"
      style={{
        background: `color-mix(in oklab, ${PRIMARY} 16%, transparent)`,
        color: PRIMARY,
        border: `1px solid color-mix(in oklab, ${PRIMARY} 40%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIMARY }} />
      Ready
    </span>
  );
}

export function ArrowIcon({ size = 14, stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BackChevron({ size = 14, stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M13 8H3M7 12l-4-4 4-4" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 11V3a1 1 0 0 1 1-1h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-hairline bg-surface text-fg2"
    >
      <BackChevron size={14} stroke={FG2} />
    </button>
  );
}

export function TopBar({ onBack, right }) {
  return (
    <div className="relative flex shrink-0 items-center justify-between px-7 py-5">
      <Wordmark />
      {onBack ? <BackButton onClick={onBack} /> : right}
    </div>
  );
}

export function CloseIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 3l10 10M13 3L3 13" stroke={FG2} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}


export function DangerButton({ children, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        padding: "11px 16px",
        borderRadius: 10,
        border: "none",
        background: hovered
          ? `color-mix(in oklab, ${DANGER} 90%, white 10%)`
          : DANGER,
        color: "oklch(0.12 0.02 270)",
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 800,
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
        boxShadow: hovered
          ? `0 6px 24px -4px color-mix(in oklab, ${DANGER} 55%, transparent)`
          : `0 4px 16px -4px color-mix(in oklab, ${DANGER} 40%, transparent)`,
        transform: hovered ? "translateY(-1px)" : "none",
        transition: "background 0.15s, box-shadow 0.15s, transform 0.12s",
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        padding: "11px 16px",
        borderRadius: 10,
        border: `1px solid ${hovered ? "oklch(0.40 0.02 270)" : HAIRLINE}`,
        background: hovered ? "oklch(0.22 0.02 270)" : SURFACE,
        color: hovered ? FG : FG3,
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

export function IconChip({ children, color }){
  return (
    <div
      className="mb-[18px] flex shrink-0 items-center justify-center rounded-[14px]"
      style={{
        width: 52, height: 52,
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 28%, transparent)`,
      }}
    >
      {children}
    </div>
  );
}