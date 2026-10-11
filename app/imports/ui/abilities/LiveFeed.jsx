import React from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { GameEventsCollection } from '../../api/gameEvents';
import { PlayersCollection } from '../../api/players';
import { ABILITIES } from '../../api/abilityRules';
import { CloseIcon, TILE } from '../components/design';
import { ABILITY_ACCENTS, buildFeedRows } from './abilityFeed';
import { FeedScopeToggle } from './FeedScopeToggle.jsx';

const OUTCOME_LABELS = { hit: 'Hit', blocked: 'Blocked', failed: 'Missed', eliminated: 'Knockout', used: 'Played' };

// The live feed's rows for this viewer: every ability event and elimination in the game.
export function useLiveFeed({ gameId, viewerId, scope }) {
  return useTracker(() => {
    if (!gameId) return [];
    Meteor.subscribe('gameFeed', gameId);
    const abilityEvents = GameEventsCollection.find({ gameId, type: 'ability' }).fetch();
    const players = PlayersCollection.find({ gameId, eliminated: true }).fetch();
    return buildFeedRows({ abilityEvents, players, viewerId, scope });
  }, [gameId, viewerId, scope]);
}

function rowAccent(row) {
  if (row.kind === 'elimination') return TILE.pink;
  return TILE[ABILITY_ACCENTS[row.ability]] ?? TILE.amber;
}

function rowMeta(row) {
  const parts = [];
  if (row.round != null) parts.push(`Round ${row.round}`);
  if (row.kind === 'ability') {
    parts.push(ABILITIES[row.ability]?.label ?? row.ability);
    parts.push(OUTCOME_LABELS[row.outcome] ?? row.outcome);
  } else {
    parts.push('Eliminated');
  }
  return parts.join(' · ');
}

// Persistent, scrollable record of who did what to whom. Rows involving the viewer are
// highlighted, and the ones aimed at them carry a pink edge, so they can answer back.
export function LiveFeedPanel({ rows, scope, onScopeChange, onClose, className = '' }) {
  return (
    <section
      aria-label="Live feed"
      className={`flex w-full flex-col gap-3 rounded-2xl border border-hairline bg-[color:oklch(0.20_0.02_270_/_0.82)] p-4 text-fg shadow-xl backdrop-blur-md ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="font-outfit text-lg font-extrabold leading-tight">Live feed</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg3">
            {rows.length} {rows.length === 1 ? 'event' : 'events'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FeedScopeToggle scope={scope} onChange={onScopeChange} showLabel={false} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close live feed"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-hairline text-fg2 transition-colors duration-[120ms] hover:bg-surface2 hover:text-fg"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
      <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto" aria-live="polite">
        {rows.length === 0 && (
          <li className="rounded-[12px] border border-dashed border-hairline px-3 py-3 font-manrope text-[13px] text-fg3">
            {scope === 'me'
              ? 'Nothing involving you yet. Cards aimed at you show up here.'
              : 'No cards played yet. Every card played from round 2 shows up here.'}
          </li>
        )}
        {rows.map((row) => (
          <li
            key={row.key}
            className={`relative flex shrink-0 flex-col gap-1 overflow-hidden rounded-[12px] border py-2.5 pl-4 pr-3 text-left ${
              row.mine ? 'border-fg3 bg-surface2' : 'border-hairline bg-transparent'
            }`}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: row.aimedAtMe ? TILE.pink : rowAccent(row), opacity: row.mine ? 1 : 0.6 }}
            />
            <span
              className={`font-manrope text-[13px] leading-snug ${row.mine ? 'font-semibold text-fg' : 'text-fg2'}`}
            >
              {row.text}
            </span>
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg3">
              {rowMeta(row)}
              {row.mine && (
                <span className="rounded-full border border-hairline px-1.5 py-px text-[9px] text-fg2">
                  {row.aimedAtMe ? 'At you' : 'You'}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
