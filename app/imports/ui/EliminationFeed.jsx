import React, { useEffect, useRef, useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { PlayersCollection } from '../api/players';

const DISPLAY_MS = 4000;

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
    eliminations.forEach((entry) => {
      if (seenIds.current.has(entry._id)) return;
      seenIds.current.add(entry._id);

      setVisible((prev) => [...prev, entry]);

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
        bottom: '20px',
        left: '20px',
        width: '260px',
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
