import React, { useEffect, useRef, useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { PlayersCollection } from '../api/players';
import { ELIMINATION_FEED_MS as DISPLAY_MS, MAX_LIVE_FEED_ITEMS } from '../constants';

export const EliminationFeed = ({ gameId }) => {
  const eliminations = useTracker(() => {
    const sub = Meteor.subscribe('eliminations', gameId);

    if (!sub.ready() || !gameId) {
      return [];
    }

    return PlayersCollection.find({ gameId, eliminated: true }, { sort: { eliminatedAt: -1 } }).fetch();
  }, [gameId]);

  const [visible, setVisible] = useState([]);
  const seenIds = useRef(new Set());
  const timers = useRef({});

  useEffect(() => {
    // The cursor is newest-first; replay oldest-first so the cap keeps the newest.
    [...eliminations].reverse().forEach((entry) => {
      if (seenIds.current.has(entry._id)) return;
      seenIds.current.add(entry._id);

      // Cap the stack: a big lobby eliminates players faster than the toasts expire,
      // and on a phone an uncapped column covers the whole board.
      setVisible((prev) => [...prev, entry].slice(-MAX_LIVE_FEED_ITEMS));

      timers.current[entry._id] = setTimeout(() => {
        setVisible((prev) => prev.filter((e) => e._id !== entry._id));
        delete timers.current[entry._id];
      }, DISPLAY_MS);
    });
  }, [eliminations]);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      Object.values(activeTimers).forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        left: '20px',
        width: 'min(260px, calc(100vw - 40px))',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {visible.map((entry) => (
        <div
          key={entry._id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
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
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <strong>{entry.name}</strong>
          </span>
          <span style={{ color: '#ff9c9c', fontSize: '0.75rem' }}>eliminated · Lv {entry.eliminatedRound}</span>
        </div>
      ))}
    </div>
  );
};
