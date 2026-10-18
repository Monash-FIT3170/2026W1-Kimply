import React, { useEffect, useRef } from 'react';
import { BG, TILE } from '../components/design';
import { ABILITIES } from '../../api/abilityRules';
import { ABILITY_ACCENTS, abilityTags } from './abilityFeed';

// Modal shell shared by the draft and by playing a held card. The game behind it keeps
// running (its timer included), it just stops taking input while this is open.
export function AbilityDialog({
  labelledBy,
  eyebrow,
  title,
  aside,
  children,
  footer,
  widthClass = 'max-w-2xl',
  titleClass = 'text-[22px]',
}) {
  const panelRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog.showModal();
    panelRef.current?.focus();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-modal="true"
      onCancel={(event) => event.preventDefault()}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 bg-transparent p-0 backdrop:bg-transparent"
    >
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center px-6 py-6"
        style={{ background: `color-mix(in oklab, ${BG} 82%, transparent)`, backdropFilter: 'blur(6px)' }}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className={`flex max-h-full w-full ${widthClass} flex-col gap-5 overflow-y-auto rounded-xl3 border border-hairline bg-surface p-5 text-fg outline-none xs:p-6`}
          style={{ boxShadow: '0 6px 18px -10px rgba(0,0,0,0.5)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-fg3">{eyebrow}</p>
              <h2 id={labelledBy} className={`font-outfit ${titleClass} font-bold tracking-[-0.01em]`}>
                {title}
              </h2>
            </div>
            {aside}
          </div>
          {children}
          {footer}
        </div>
      </div>
    </dialog>
  );
}

// A seconds-left readout for a deadline, shown as a pulse-meta chip.
export function Countdown({ seconds }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
      style={{ color: seconds <= 3 ? TILE.pink : TILE.amber }}
      aria-live="off"
    >
      <span
        className="h-1.5 w-1.5 animate-kimply-pulse rounded-full"
        style={{ background: seconds <= 3 ? TILE.pink : TILE.amber }}
      />
      {seconds}s
    </span>
  );
}

export function KeyHint({ children }) {
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-hairline px-1.5 font-mono text-[11px] font-semibold text-fg2">
      {children}
    </span>
  );
}

// One ability as a pickable card, or a read-only one (the lobby's guide) without onClick.
export function AbilityCard({ type, keyHint, onClick, disabled = false, compact = false }) {
  const ability = ABILITIES[type];
  const accent = TILE[ABILITY_ACCENTS[type]] ?? TILE.amber;
  const Card = onClick ? 'button' : 'div';
  return (
    <Card
      {...(onClick ? { type: 'button', onClick, disabled } : {})}
      className={`relative flex min-h-11 w-full flex-col gap-2 overflow-hidden rounded-xl2 border border-hairline bg-surface2 p-4 pt-5 text-left ${
        onClick
          ? 'transition-[border-color,transform] duration-[120ms] hover:-translate-y-0.5 hover:border-[color:var(--accent)] focus-visible:-translate-y-0.5 focus-visible:border-[color:var(--accent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-hairline'
          : ''
      }`}
      style={{ '--accent': accent }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <span className="flex items-center justify-between gap-2">
        <span className="font-outfit text-lg font-bold leading-tight">{ability.label}</span>
        {keyHint && <KeyHint>{keyHint}</KeyHint>}
      </span>
      {!compact && (
        <span className="font-manrope text-[13px] font-medium leading-snug text-fg2">{ability.description}</span>
      )}
      <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1">
        {abilityTags(type).map((tag) => (
          <span
            key={tag}
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: accent }}
          >
            {tag}
          </span>
        ))}
      </span>
    </Card>
  );
}
