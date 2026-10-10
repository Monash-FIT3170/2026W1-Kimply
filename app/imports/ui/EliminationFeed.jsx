import React, { useEffect, useRef, useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { PlayersCollection } from '../api/players';
import { ELIMINATION_FEED_MS as DISPLAY_MS } from '../constants';

const MAX_VISIBLE = 3;

export const EliminationFeed = ({ gameId }) => {
  const { ready, eliminations } = useTracker(() => {
    if (!gameId) return { ready: false, eliminations: [] };
    const sub = Meteor.subscribe('eliminations', gameId);
    if (!sub.ready()) return { ready: false, eliminations: [] };
    return {
      ready: true,
      eliminations: PlayersCollection.find({ gameId, eliminated: true }, { sort: { eliminatedAt: 1 } }).fetch(),
    };
  }, [gameId]);

  const [visible, setVisible] = useState([]);
  const [overflow, setOverflow] = useState(0);
  const visibleRef = useRef([]);
  const seenIds = useRef(new Set());
  const baselined = useRef(false);
  const timers = useRef({});
  const overflowTimer = useRef(null);

  useEffect(() => {
    if (!ready) return;

    if (!baselined.current) {
      eliminations.forEach((e) => seenIds.current.add(e._id));
      baselined.current = true;
      return;
    }

    const fresh = eliminations.filter((e) => !seenIds.current.has(e._id));
    if (fresh.length === 0) return;
    fresh.forEach((e) => seenIds.current.add(e._id));

    // Show the most recent few; count the rest.
    const shown = fresh.slice(-MAX_VISIBLE);
    let hidden = fresh.length - shown.length;

    const combined = [...visibleRef.current, ...shown];
    const evicted = Math.max(0, combined.length - MAX_VISIBLE);
    hidden += evicted;
    visibleRef.current = combined.slice(-MAX_VISIBLE);
    setVisible(visibleRef.current);

    shown.forEach((entry) => {
      timers.current[entry._id] = setTimeout(() => {
        visibleRef.current = visibleRef.current.filter((e) => e._id !== entry._id);
        setVisible(visibleRef.current);
        delete timers.current[entry._id];
      }, DISPLAY_MS);
    });

    if (hidden > 0) {
      setOverflow((n) => n + hidden);
      clearTimeout(overflowTimer.current);
      overflowTimer.current = setTimeout(() => setOverflow(0), DISPLAY_MS);
    }
  }, [ready, eliminations]);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      Object.values(activeTimers).forEach(clearTimeout);
      clearTimeout(overflowTimer.current);
    };
  }, []);

  return (
    <div className="kill-feed" aria-live="polite">
      {visible.map((entry) => (
        <div
          key={entry._id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            border: '1px solid rgba(224, 48, 48, 0.35)',
            backdropFilter: 'blur(4px)',
            color: 'white',
            fontSize: '0.85rem',
            animation: `killFeedPop ${DISPLAY_MS}ms ease forwards`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#e03030',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</strong>
          </span>
          <span style={{ color: '#ff9c9c', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            eliminated · Lv {entry.eliminatedRound}
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            border: '1px solid rgba(224, 48, 48, 0.25)',
            color: '#ff9c9c',
            fontSize: '0.75rem',
            textAlign: 'center',
          }}
        >
          +{overflow} more eliminated
        </div>
      )}
    </div>
  );
};
