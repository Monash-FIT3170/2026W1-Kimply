import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { TILE } from '../components/design';

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
