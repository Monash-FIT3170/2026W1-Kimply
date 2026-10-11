import { useEffect, useRef } from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { GameEventsCollection } from '../../api/gameEvents';
import { describeAbilityEvent, isInFeed } from './abilityFeed';

// Tolerates a little clock skew between this device and the server.
const STALE_MS = 5000;

// Turns new ability events involving the viewer into notices for GamePage's toast stack,
// so a player notices being targeted even with the live feed closed.
// Events from before the page loaded (a refresh) are not replayed.
export function useAbilityNotices({ gameId, viewerId, onNotice }) {
  const events = useTracker(() => {
    if (!gameId || !viewerId) return [];
    return GameEventsCollection.find({ gameId, type: 'ability' }, { sort: { createdAt: 1 } }).fetch();
  }, [gameId, viewerId]);

  const seen = useRef(new Set());
  const mountedAt = useRef(Date.now());
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  useEffect(() => {
    if (!viewerId) return;
    events.forEach((event) => {
      if (seen.current.has(event._id)) return;
      seen.current.add(event._id);
      if (event.createdAt.getTime() < mountedAt.current - STALE_MS) return;
      // Only cards involving this player pop up; everything else waits in the live feed.
      if (!isInFeed('me', viewerId, event)) return;
      onNoticeRef.current({
        key: event._id,
        text: describeAbilityEvent(event, viewerId),
        personal: true,
      });
    });
  }, [events, viewerId]);
}
