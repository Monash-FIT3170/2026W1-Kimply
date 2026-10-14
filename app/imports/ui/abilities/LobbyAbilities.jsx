import React, { useEffect, useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { CloseIcon, GhostButton, TILE } from '../components/design';
import { AbilityCard, AbilityDialog } from './AbilityDialog.jsx';
import { abilityGuide } from './abilityFeed';

// Host control in the lobby: turn the ability draft on or off for this game.
export function AbilitiesSwitch({ pin, enabled }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const toggle = () => {
    setPending(true);
    setError('');
    Meteor.call('rooms.setAbilities', pin, !enabled, (err) => {
      setPending(false);
      if (err) setError(err.reason || 'Could not change abilities. Try again.');
    });
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        onClick={toggle}
        className="inline-flex min-h-11 items-center gap-3 rounded-full border border-hairline bg-surface2 py-1.5 pl-4 pr-2 transition-colors duration-[120ms] hover:border-fg3 disabled:cursor-wait"
      >
        <span className="flex flex-col items-start">
          <span className="font-outfit text-[11px] font-bold uppercase tracking-[0.12em] text-fg">Abilities</span>
          {/* Hidden on phones so the switch fits beside the game mode badge in the lobby. */}
          <span className="hidden font-manrope text-[11px] text-fg3 xs:block">
            {enabled ? 'Pick a card before each round' : 'Pure memory, no cards'}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="relative h-6 w-10 shrink-0 rounded-full transition-colors duration-[240ms]"
          style={{ background: enabled ? TILE.teal : 'oklch(0.32 0.02 270)' }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-fg transition-[left] duration-[240ms]"
            style={{ left: enabled ? 18 : 2, transitionTimingFunction: 'cubic-bezier(.34,1.56,.64,1)' }}
          />
        </span>
      </button>
      {error && (
        <p role="alert" className="font-manrope text-[12px] text-tile-pink">
          {error}
        </p>
      )}
    </div>
  );
}

// What joined players see: whether this game deals abilities.
export function AbilitiesChip({ enabled }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-2 font-outfit text-[11px] font-semibold uppercase tracking-[0.12em] text-fg2">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: enabled ? TILE.teal : 'oklch(0.55 0.015 270)' }}
      />
      {enabled ? 'Abilities on' : 'Abilities off'}
    </span>
  );
}

// Opens the card guide from the lobby, so players learn the cards before the first draft.
// `slim` draws a 36px pill to sit level with the joined view's chips; the hit target
// stays 44px either way.
export function AbilityGuideButton({ gameMode, startingLives, slim = false }) {
  const [open, setOpen] = useState(false);
  const guide = abilityGuide({ isBattleRoyale: gameMode === 'battle_royale', startingLives });
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="group inline-flex min-h-11 items-center rounded-full focus-visible:outline-none"
      >
        <span
          className={`inline-flex items-center gap-2 rounded-full border border-hairline bg-surface2 px-4 font-outfit text-[11px] font-bold uppercase tracking-[0.12em] text-fg transition-colors duration-[120ms] group-hover:border-fg3 group-focus-visible:border-fg ${
            slim ? 'h-9' : 'h-11'
          }`}
        >
          See the cards
          <span className="font-mono text-[11px] font-semibold text-fg3">{guide.count}</span>
        </span>
      </button>
      {open && <AbilityGuide guide={guide} onClose={() => setOpen(false)} />}
    </>
  );
}

function AbilityGuide({ guide, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <AbilityDialog
      labelledBy="ability-guide-title"
      eyebrow={`Abilities · ${guide.count} cards`}
      title="Know your cards"
      aside={
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the card guide"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-hairline text-fg2 transition-colors duration-[120ms] hover:bg-surface2 hover:text-fg"
        >
          <CloseIcon size={14} />
        </button>
      }
      footer={
        <div className="flex">
          <GhostButton onClick={onClose}>Close · Esc</GhostButton>
        </div>
      }
    >
      {/* Only the cards scroll, so the header's close button and the footer stay in reach. */}
      <div className="-mr-3 flex min-h-0 flex-col gap-5 overflow-y-auto pr-3">
        <p className="font-manrope text-[14px] font-medium leading-snug text-fg2">{guide.intro}</p>
        {guide.sections.map((section) => (
          <section key={section.key} aria-labelledby={`ability-guide-${section.key}`} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3
                id={`ability-guide-${section.key}`}
                className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-fg3"
              >
                {section.title}
              </h3>
              <p className="font-manrope text-[13px] font-medium leading-snug text-fg2">{section.note}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
              {section.types.map((type) => (
                <AbilityCard key={type} type={type} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AbilityDialog>
  );
}
