import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, avatarColor } from '../components/design';
import { KeyHint } from './AbilityDialog.jsx';

// Choose another player. Type to filter; with an empty filter, 1-9 picks a numbered row.
// Arrows move the highlight and Enter takes it. Esc goes back.
export function TargetPicker({ players, onSelect, onBack }) {
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));
    return needle ? sorted.filter((p) => p.name.toLowerCase().includes(needle)) : sorted;
  }, [players, filter]);

  useEffect(() => setHighlight(0), [filter]);

  // Focusing the filter on a touch screen would open the keyboard over the list.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onBack();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setHighlight((h) => Math.min(Math.max(h + step, 0), Math.max(matches.length - 1, 0)));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (matches[highlight]) onSelect(matches[highlight]._id);
        return;
      }
      // Digits pick a row only while the filter is empty, so names with numbers stay typeable.
      if (/^[1-9]$/.test(event.key) && filter === '') {
        const row = matches[Number(event.key) - 1];
        if (row) {
          event.preventDefault();
          onSelect(row._id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [matches, highlight, filter, onSelect, onBack]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-fg3">
          Players ({players.length})
        </span>
        <input
          ref={inputRef}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Type a name to filter"
          aria-controls="target-list"
          className="min-h-11 w-full rounded-[10px] border border-hairline bg-bg px-4 py-3 font-outfit text-base font-semibold text-fg outline-none placeholder:text-fg3 focus:border-fg3"
        />
      </label>
      <ul id="target-list" className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto" aria-label="Players">
        {matches.length === 0 && (
          <li className="rounded-xl2 border border-dashed border-hairline px-4 py-3 font-manrope text-[13px] text-fg3">
            Nobody matches “{filter.trim()}”.
          </li>
        )}
        {matches.map((player, index) => (
          <li key={player._id}>
            <button
              type="button"
              onClick={() => onSelect(player._id)}
              onMouseEnter={() => setHighlight(index)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-left transition-colors duration-[120ms] ${
                index === highlight ? 'border-fg3 bg-surface2' : 'border-hairline bg-surface'
              }`}
            >
              <Avatar letter={player.name.charAt(0).toUpperCase()} color={avatarColor(player.name)} size={32} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-outfit text-sm font-semibold">{player.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-fg3">
                  Level {player.level} · {player.lives} {player.lives === 1 ? 'life' : 'lives'}
                </span>
              </span>
              {filter === '' && index < 9 && <KeyHint>{index + 1}</KeyHint>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
