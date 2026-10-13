import React, { useCallback, useState } from 'react';
import { DEFAULT_FEED_SCOPE, normaliseFeedScope } from './abilityFeed';

const STORAGE_KEY = 'kimply.feedScope';

function readScope() {
  try {
    return normaliseFeedScope(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_FEED_SCOPE;
  }
}

// Which live events this device shows: only the ones involving the player, or everyone's.
// Defaults to 'me', because a full room fires events faster than anyone can read them.
export function useFeedScope() {
  const [scope, setScopeState] = useState(readScope);
  const setScope = useCallback((next) => {
    const value = normaliseFeedScope(next);
    setScopeState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage can be blocked (private mode). The choice still holds for this visit.
    }
  }, []);
  return [scope, setScope];
}

const OPTIONS = [
  { value: 'me', label: 'Me', title: 'Show only events involving you' },
  { value: 'everyone', label: 'All', title: "Show everyone's events" },
];

export function FeedScopeToggle({ scope, onChange, showLabel = true, className = '' }) {
  return (
    <div
      role="radiogroup"
      aria-label="Live feed"
      className={`inline-flex items-center rounded-full border border-hairline bg-surface ${className}`}
    >
      {showLabel && (
        <span
          aria-hidden="true"
          className="hidden pl-4 pr-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fg3 xs:inline"
        >
          Feed
        </span>
      )}
      {OPTIONS.map((option) => {
        const selected = scope === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`min-h-11 min-w-12 rounded-full px-3 font-outfit text-xs font-bold uppercase tracking-[0.12em] transition-colors duration-[120ms] ${
              selected ? 'bg-surface2 text-fg' : 'text-fg3 hover:text-fg2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
