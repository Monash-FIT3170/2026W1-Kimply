import React, { useState, useEffect, useRef } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { RoundsCollection } from '../../api/rounds';
import { PlayersCollection } from '../../api/players';
import { RoomsCollection } from '../../api/rooms';
import { ColourSequence } from '../ColourSequence.jsx';
import { Leaderboard } from '../Leaderboard.jsx';
import { EndLeaderboard } from '../EndLeaderboard.jsx';
import { EliminationFeed } from '../EliminationFeed.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { TILE, TileLattice } from '../components/design';
import { ConfirmationPopup } from '../components/ConfirmationPopup.jsx';
import { RemovedScreen } from '../components/RemovedScreen.jsx';
import { useSessionResuming, useSignedInAccount } from '../accountSession';
import { playableHand, playbackFor } from '../../api/abilityRules';
import { useFeedScope } from '../abilities/FeedScopeToggle.jsx';
import { LiveFeedPanel, useLiveFeed } from '../abilities/LiveFeed.jsx';
import { DraftOverlay } from '../abilities/DraftOverlay.jsx';
import { HandDialog } from '../abilities/HandDialog.jsx';
import { KeyHint } from '../abilities/AbilityDialog.jsx';
import { useAbilityNotices } from '../abilities/useAbilityNotices';
import { gameReconnectToken, forgetGameReconnectToken } from '../gameReconnect';
import { secondsUntil, syncServerClock } from '../serverClock';
import { hasSeenSequence, markSequenceSeen } from '../sequencePlayback';
import {
  ROUND_TIMER_SECONDS as ROUND_SECONDS,
  LEVEL_UP_TOAST_MS,
  DEFAULT_STARTING_LIVES,
  MAX_LIVE_FEED_ITEMS,
  STARTING_REPLAYS,
  REPLAY_BONUS_STREAK,
  STREAK_BONUS_LIFE_THRESHOLD,
} from '../../constants';

// How long to wait before asking the server again to close a draft whose clock ran out.
const CLOSE_DRAFT_RETRY_MS = 2000;

// Below Tailwind's `xs` breakpoint (481px) the leaderboard is a bottom sheet that
// covers the tiles and buttons, so it starts closed on phones and open elsewhere.
const leaderboardOpenByDefault = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 481px)').matches;
// The live feed sits on the left. Only from 1280px is there room for it beside the play
// area, so narrower screens start with it closed behind the Feed button.
const feedOpenByDefault = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches;
// Phones show the feed and the leaderboard as bottom sheets in the same place, so only one opens at a time.
const isPhone = () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 481px)').matches;

// A game control with a small hint under the label: the keyboard key that triggers it,
// matching the key letters on the colour tiles, or another short note such as replays left.
const ControlButton = ({
  label,
  keyHint,
  hint = keyHint?.toUpperCase(),
  ariaLabel = label,
  onClick,
  enabled,
  enabledBackground,
  disabledBackground,
  enabledColour = 'white',
  disabledColour,
  enabledBorder = '1px solid transparent',
  disabledBorder = '1px solid transparent',
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!enabled}
    aria-label={ariaLabel}
    aria-keyshortcuts={keyHint}
    style={{
      flex: '1 1 0',
      maxWidth: 160,
      minHeight: 44,
      height: 'clamp(48px, 6.5dvh, 68px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      backgroundColor: enabled ? enabledBackground : disabledBackground,
      color: enabled ? enabledColour : disabledColour,
      fontWeight: 'bold',
      fontSize: 'clamp(12px, 3vw, 20px)',
      border: enabled ? enabledBorder : disabledBorder,
      borderRadius: '8px',
      cursor: enabled ? 'pointer' : 'not-allowed',
      letterSpacing: '1px',
    }}
  >
    <span>{label}</span>
    <span className="font-mono" style={{ fontSize: 'clamp(9px, 2.2vw, 11px)', letterSpacing: '1px', opacity: 0.7 }}>
      {hint}
    </span>
  </button>
);

export const GamePage = () => {
  const [playerId, setPlayerId] = useState(null);
  const [playerCanInput, setPlayerCanInput] = useState(false);
  const [replaysRemaining, setReplaysRemaining] = useState(STARTING_REPLAYS);
  const [attemptedSequence, setAttemptedSequence] = useState([]);
  const [message, setMessage] = useState('');
  const [notices, setNotices] = useState([]);
  const [lifeFlash, setLifeFlash] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [timeUp, setTimeUp] = useState(false);
  const [clockSyncedAt, setClockSyncedAt] = useState(0);
  const [shake, setShake] = useState(false);
  const [correctGlow, setCorrectGlow] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(leaderboardOpenByDefault);
  const [isFeedOpen, setIsFeedOpen] = useState(feedOpenByDefault);
  const [feedSeenAt, setFeedSeenAt] = useState(() => new Date());
  const [completedRoundId, setCompletedRoundId] = useState(null);
  const [handOpen, setHandOpen] = useState(false);
  const [expiredDraftKey, setExpiredDraftKey] = useState(null);
  const [feedScope, setFeedScope] = useFeedScope();
  const [showLeavePopup, setShowLeavePopup] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [removal, setRemoval] = useState(null);
  const attemptRef = useRef({ offsets: [], attemptId: null, t0: null });
  const seenPlayerRef = useRef(false);

  const location = useLocation();
  const navigate = useNavigate();
  const playerNameFromLobby = location.state?.playerName || 'Demo Player';
  const routeGameMode = location.state?.gameMode;
  const roomPin = location.state?.pin;
  const lobbyPlayerId = location.state?.playerId;
  const playerAccount = useSignedInAccount();
  const accountId = playerAccount?._id || null;
  const sessionResuming = useSessionResuming();
  // No 'demo' fallback: the publications are scoped by gameId, so a placeholder
  // would subscribe to a game that does not exist and hang on LOADING forever.
  const gameId = roomPin || null;

  const resetAttempt = () => {
    attemptRef.current = { offsets: [], attemptId: null, t0: null };
  };

  const noteRemoval = (error) => {
    localStorage.removeItem(`gamePlayerId:${gameId}`);
    localStorage.removeItem('reconnectData');
    setPlayerCanInput(false);
    setRemoval(
      error?.error === 'banned' || error?.error === 'removed-automation'
        ? error
        : { error: 'removed-automation', details: { reason: 'session' } }
    );
  };

  const handleLeaveGame = () => {
    Meteor.call('players.leaveGame', playerId, (error) => {
      if (error) {
        setLeaveError('Could not leave the game. Please try again.');
        return;
      }

      localStorage.removeItem(`gamePlayerId:${gameId}`);
      forgetGameReconnectToken(gameId, lobbyPlayerId);
      localStorage.removeItem('reconnectData');
      navigate('/play', { replace: true, state: playerAccount ? { playerAccount } : undefined });
    });
  };

  const playTurnStartSound = () => {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;

    const audioContext = new AudioCtor();
    const gainNode = audioContext.createGain();
    const oscillator = audioContext.createOscillator();

    oscillator.type = 'sine';
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.24);

    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(659.25, audioContext.currentTime + 0.18);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.24);
  };

  useEffect(() => {
    if (!gameId) return undefined;
    const roundsSub = Meteor.subscribe('rounds', gameId);
    const playersSub = Meteor.subscribe('players', gameId);
    // This player's own sequence, draft and hand. Never sent to anyone else.
    const secretSub = Meteor.subscribe('players.secret', gameId);
    const roomSub = Meteor.subscribe('rooms.lobby', gameId);
    return () => {
      roundsSub.stop();
      playersSub.stop();
      secretSub.stop();
      roomSub.stop();
    };
  }, [gameId]);

  // A DDP reconnect opens a new connection. Point the player at it, or the server
  // treats them as gone and removes them after the disconnect grace period.
  const connected = useTracker(() => Meteor.status().connected, []);
  const wasConnectedRef = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnectedRef.current && playerId) {
      Meteor.call('players.rebind', playerId, gameReconnectToken(gameId, lobbyPlayerId), (error) => {
        if (error?.error === 'banned' || error?.error === 'removed-automation') {
          noteRemoval(error);
          return;
        }
        if (error) setMessage('Lost track of your game after reconnecting. Refresh to rejoin.');
      });
    }
    wasConnectedRef.current = connected;
  }, [connected, playerId, gameId, lobbyPlayerId]);

  const player = useTracker(() => {
    if (!playerId) return null;
    return PlayersCollection.findOne(playerId);
  }, [playerId]);

  const room = useTracker(() => {
    if (!gameId) return null;
    return RoomsCollection.findOne({ pin: gameId });
  }, [gameId]);
  const gameMode = room?.gameMode || routeGameMode || 'default';
  const isBattleRoyale = gameMode === 'battle_royale';

  const round = useTracker(() => {
    if (!gameId) return null;
    // Eliminated players stay on their original round in the database. Follow
    // the active round instead so their spectator view remains live after the
    // remaining players advance.
    if (player?.eliminated) {
      return RoundsCollection.findOne({ gameId, isCurrent: true }) || RoundsCollection.findOne(player.roundId);
    }
    // in battle royale follow the player's specific round
    if (player?.roundId) {
      return RoundsCollection.findOne(player.roundId);
    }
    return RoundsCollection.findOne({ gameId, isCurrent: true });
  }, [gameId, player?.roundId]);

  // The sequence this player repeats arrives privately on their own player document.
  const ownSequence = player?.secret?.sequence;
  const sequenceReady = Boolean(ownSequence && round && ownSequence.roundId === round._id);
  const sequence = sequenceReady ? ownSequence.colours : [];
  const sequenceVersion = sequenceReady ? ownSequence.version : null;
  // Slo-Mo, 2x Speed or Lights Out someone has aimed at this player for this round.
  const playback = playbackFor(player);

  // Standard rounds open with a shared draft on the round. Battle Royale deals each
  // player their own when they level up.
  const myDraft = player?.secret?.draft && player.secret.draft.roundId === player.roundId ? player.secret.draft : null;
  const draftKey = isBattleRoyale ? player?.roundId : round?._id;
  const roundDraftOpen = !isBattleRoyale && Boolean(round?.draft) && !round.draft.resolved;
  const levelDraftOpen = isBattleRoyale && myDraft?.status === 'open' && expiredDraftKey !== draftKey;
  const playing = Boolean(player) && !player.eliminated && !player.completeRound && !player.gameFinished;
  const draftOpen = playing && (roundDraftOpen || levelDraftOpen);
  const hand = playing ? playableHand(player) : [];
  const canOpenHand = hand.length > 0 && !draftOpen;
  const dialogOpen = draftOpen || handOpen;
  // Once the round's deadline has passed no tile is live, however the input got re-enabled
  // (a replay finishing, a re-subscribe after a reconnect).
  const tilesLive = playerCanInput && !dialogOpen && !timeUp;
  const canReplay = !isBattleRoyale && replaysRemaining > 0 && tilesLive;

  useEffect(() => {
    if (!canOpenHand) setHandOpen(false);
  }, [canOpenHand]);

  // Who a Steal, Strike or Scramble can be aimed at.
  const targetCandidates = useTracker(() => {
    if (!gameId || !playerId) return [];
    const sharedLevel = round ? (round.roundNumber ?? round.lengthOfSequence - 3) : 0;
    return PlayersCollection.find({ gameId, eliminated: false, _id: { $ne: playerId } })
      .fetch()
      .map((p) => ({
        _id: p._id,
        name: p.name,
        lives: p.lives ?? 0,
        level: isBattleRoyale ? (p.currentLevel ?? 4) - 3 : sharedLevel,
        completeRound: Boolean(p.completeRound),
      }));
  }, [gameId, playerId, isBattleRoyale, round?._id]);

  // startingLives is copied into customSettings for every preset mode (easy=5, hard=1, ...),
  // not just 'custom', so size the lives track off customSettings regardless of gameMode.
  const totalLives = room?.customSettings?.startingLives ?? DEFAULT_STARTING_LIVES;
  // Battle royale streaks can bank lives above the starting count, so grow the track to fit.
  const heartCount = Math.max(totalLives, player?.lives ?? 0);
  // Every toast (cards involving this player, life awards, the replay bonus) shares one capped stack.
  const pushNotice = (notice, durationMs = LEVEL_UP_TOAST_MS) => {
    // Life awards are exempt from the cap, so a burst of other notices can not push them out.
    setNotices((prev) => {
      const lifeNotices = prev.filter((n) => n.kind === 'life');
      const others = [...prev.filter((n) => n.kind !== 'life'), notice].slice(-MAX_LIVE_FEED_ITEMS);
      return [...lifeNotices, ...others];
    });
    setTimeout(() => setNotices((prev) => prev.filter((n) => n.key !== notice.key)), durationMs);
  };

  useAbilityNotices({ gameId, viewerId: playerId, onNotice: (notice) => pushNotice(notice) });

  const feedRows = useLiveFeed({ gameId, viewerId: playerId, scope: feedScope });
  // While the feed is open everything in it counts as read; closed, new rows show as a badge.
  useEffect(() => {
    if (isFeedOpen) setFeedSeenAt(new Date());
  }, [isFeedOpen, feedRows.length]);
  const unreadRows = isFeedOpen ? [] : feedRows.filter((row) => new Date(row.at) > feedSeenAt);
  const unreadAimedAtMe = unreadRows.some((row) => row.aimedAtMe);

  const toggleFeed = () => {
    if (!isFeedOpen && isPhone()) setIsLeaderboardOpen(false);
    setIsFeedOpen((open) => !open);
  };
  const toggleLeaderboard = () => {
    if (!isLeaderboardOpen && isPhone()) setIsFeedOpen(false);
    setIsLeaderboardOpen((open) => !open);
  };

  useEffect(() => {
    // Wait for a stored session to resume, or the player would join without their account.
    if (!round?._id || playerId || sessionResuming) return;
    const savedPlayerId = !lobbyPlayerId && localStorage.getItem(`gamePlayerId:${gameId}`);
    if (savedPlayerId) {
      Meteor.call('players.rebind', savedPlayerId, gameReconnectToken(gameId, lobbyPlayerId), (error) => {
        if (error?.error === 'banned' || error?.error === 'removed-automation') noteRemoval(error);
        else if (error) setMessage('Could not reconnect to your game. Join a new room to play.');
        else setPlayerId(savedPlayerId);
      });
      return;
    }
    Meteor.call(
      'players.join',
      round._id,
      playerNameFromLobby,
      gameId,
      lobbyPlayerId,
      isBattleRoyale,
      accountId,
      gameReconnectToken(gameId, lobbyPlayerId),
      (error, result) => {
        if (error) {
          if (error.error === 'banned' || error.error === 'removed-automation') noteRemoval(error);
          else {
            console.error(error);
            setMessage('Could not join the game.');
          }
          return;
        }
        setPlayerId(result);
        localStorage.setItem(`gamePlayerId:${gameId}`, result);
      }
    );
  }, [round?._id, playerId, gameId, playerNameFromLobby, lobbyPlayerId, isBattleRoyale, accountId, sessionResuming]);

  // A new round, a new sequence (Reroll, Scramble) or the draft closing all restart
  // playback. Nothing plays while the draft is open.
  useEffect(() => {
    if (!player?.roundId) return;
    setAttemptedSequence([]);
    resetAttempt();
    setMessage('');
    setCompletedRoundId(null);
    setPlayerCanInput(false);
    if (draftOpen || sequenceVersion == null) return;
    if (hasSeenSequence(gameId, player.roundId, sequenceVersion)) {
      // Already watched this sequence (a refresh, or a reconnect re-publishing it): go
      // straight to input. No replayKey bump, because that is a request to play it again.
      setPlayerCanInput(true);
      return;
    }
    setReplayKey((prev) => prev + 1);
  }, [player?.roundId, gameId, sequenceVersion, draftOpen]);

  //replay bonus
  // null until the player's streak is first seen, so loading the page (a refresh, or the
  // end screen) does not count the streak the player already had as a new one.
  const prevStreakRef = useRef(null);
  useEffect(() => {
    if (!player) return;
    const streak = player.currentStreak ?? 0;
    const prev = prevStreakRef.current;
    prevStreakRef.current = streak;
    if (prev === null) return;

    if (streak > 0 && streak % REPLAY_BONUS_STREAK === 0 && streak !== prev) {
      setReplaysRemaining((r) => r + 1);
      const notice = {
        key: `replay-bonus-${Date.now()}`,
        text:
          REPLAY_BONUS_STREAK === 1
            ? 'Correct! Extra replay earned 🎉'
            : `${REPLAY_BONUS_STREAK} correct in a row 🎉 extra replay earned!`,
      };
      setNotices((prev) => [...prev, notice]);
      //setTimeout(() => setMessage(''), 2500);
      setTimeout(() => setNotices((prev) => prev.filter((n) => n.key !== notice.key)), 5000);
    }
  }, [player?.currentStreak]);

  const handleReplay = () => {
    if (!canReplay) return;
    setReplaysRemaining((prev) => prev - 1);
    setPlayerCanInput(false);
    setAttemptedSequence([]);
    resetAttempt();
    setReplayKey((prev) => prev + 1);
  };

  // The round the player is on now. A submit's result can arrive after the round it was
  // for has already advanced (the last answer is what advances it).
  const currentRoundIdRef = useRef(null);
  currentRoundIdRef.current = player?.roundId ?? null;
  const handleColourClick = (colour, at) => {
    if (!tilesLive) return;
    if (!sequenceReady) return;
    if (attemptedSequence.length >= sequence.length) return;
    const stamp = typeof at === 'number' ? at : performance.now();
    const current = attemptRef.current;
    if (current.offsets.length === 0) {
      current.t0 = stamp;
      current.offsets = [0];
      current.attemptId = new Promise((resolve, reject) => {
        Meteor.call('players.startAttempt', playerId, player.roundId, (error, result) => {
          if (error) reject(error);
          else resolve(result.attemptId);
        });
      });
    } else {
      current.offsets.push(stamp - current.t0);
    }
    setAttemptedSequence((prev) => [...prev, colour]);
  };

  // The round's deadline belongs to the server (round.deadlineAt) and is counted on the
  // server's clock. Every screen then agrees, and a phone that left the browser is on the
  // right time the moment it comes back, instead of restarting a timer of its own.
  // null means the clock has not started (round 1 waiting for the lobby, or the draft is
  // open), so the readout stays full. Battle Royale has no timer.
  const deadlineMs = !isBattleRoyale && round?.deadlineAt ? new Date(round.deadlineAt).getTime() : null;

  // Measure the offset to the server's clock, and again whenever the phone wakes or reconnects.
  useEffect(() => {
    const sync = () => syncServerClock(() => setClockSyncedAt(Date.now()));
    sync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [connected]);

  useEffect(() => {
    if (!deadlineMs) {
      setSecondsLeft(ROUND_SECONDS);
      setTimeUp(false);
      return undefined;
    }
    const tick = () => {
      const left = secondsUntil(deadlineMs);
      setSecondsLeft(left);
      setTimeUp(left === 0);
    };
    tick();
    const intervalId = window.setInterval(tick, 250);
    // Timers freeze while a phone is backgrounded; do not wait for the next one.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [deadlineMs, clockSyncedAt]);

  // At zero, ask the server to enforce the deadline. Any screen may ask, a finished player's
  // included, so a phone that stopped responding cannot hold the round. The server decides
  // (it allows a short grace for answers in flight), so keep asking until it has.
  const clockRoundId = round?._id;
  useEffect(() => {
    if (!timeUp || !clockRoundId) return undefined;
    let cancelled = false;
    let retryId;
    const attempt = () => {
      Meteor.call('rounds.expire', clockRoundId, () => {
        if (cancelled) return;
        const current = RoundsCollection.findOne(clockRoundId);
        if (current && !current.expiredAt) retryId = window.setTimeout(attempt, 1000);
      });
    };
    attempt();
    return () => {
      cancelled = true;
      window.clearTimeout(retryId);
    };
  }, [timeUp, clockRoundId]);

  useEffect(() => {
    if (timeUp && playing) setMessage('Time is up!');
  }, [timeUp, playing]);

  // The server closes a draft on its own timer. If that was lost (a restart), ask it
  // to close once this device's clock runs out, and keep asking until it does.
  const handleDraftExpire = () => {
    if (isBattleRoyale) {
      setExpiredDraftKey(draftKey);
      if (myDraft?.status === 'open') Meteor.call('abilities.skip', playerId, () => {});
      return;
    }
    const roundId = round?._id;
    const attempt = () => {
      Meteor.call('abilities.closeDraft', roundId, (error, closed) => {
        const current = RoundsCollection.findOne(roundId);
        if (!closed && current?.draft && !current.draft.resolved) setTimeout(attempt, CLOSE_DRAFT_RETRY_MS);
      });
    };
    if (roundId) attempt();
  };

  const pickAbility = (type, targetId, done) => Meteor.call('abilities.pick', playerId, type, targetId, done);
  const skipDraft = (done) => Meteor.call('abilities.skip', playerId, done);
  const playHandCard = (card, targetId, done) =>
    Meteor.call('abilities.use', playerId, card.id, targetId, (error) => {
      done(error);
      if (!error) setHandOpen(false);
    });

  const showLifeAward = ({ streak, bonusRound, lives }) => {
    const reason =
      streak && bonusRound
        ? 'Streak reward + bonus round!'
        : bonusRound
          ? 'Bonus round reward!'
          : `${STREAK_BONUS_LIFE_THRESHOLD} correct in a row!`;

    const notice = {
      key: `life-${Date.now()}`,
      kind: 'life',
      title: `+${streak && bonusRound ? 2 : 1} ${streak && bonusRound ? 'lives' : 'life'} ❤`,
      text: `${reason} You now have ${lives} ${lives === 1 ? 'life' : 'lives'}.`,
    };

    setNotices((prev) => [...prev, notice]);
    setLifeFlash(true);
    setTimeout(() => setLifeFlash(false), 1200);

    // remove the popup after 5 seconds
    setTimeout(() => setNotices((prev) => prev.filter((n) => n.key !== notice.key)), 5000);
  };

  const handleSubmit = () => {
    if (!playerId) {
      setMessage('Player is not ready yet.');
      return;
    }
    if (attemptedSequence.length !== sequence.length) {
      setMessage(`Choose ${sequence.length} colours before submitting.`);
      return;
    }
    const submittedRoundId = player?.roundId;
    const pending = attemptRef.current.attemptId;
    const offsets = attemptRef.current.offsets.slice();
    if (!pending) {
      setMessage('Enter the sequence before submitting.');
      return;
    }
    pending
      .then((attemptId) => {
        Meteor.call(
          'players.submitSequence',
          playerId,
          attemptedSequence,
          { attemptId, roundId: submittedRoundId, offsets },
          (error, result) => {
            if (error) {
              if (error.error === 'removed-automation' || error.error === 'banned') {
                noteRemoval(error);
                return;
              }
              if (error.error === 'round-expired' || error.error === 'not-playing') {
                setPlayerCanInput(false);
                setMessage('Time is up!');
                return;
              }
              if (error.error === 'stale-attempt' || error.error === 'duplicate-attempt') {
                resetAttempt();
                setAttemptedSequence([]);
                setMessage('That attempt expired. Enter the sequence again.');
                return;
              }
              console.error(error);
              setMessage('Something went wrong while submitting.');
              return;
            }
            if (result.success) {
              if (result.lifeAward) showLifeAward(result.lifeAward);
              setCorrectGlow(true);
              setTimeout(() => setCorrectGlow(false), 800);
              // Already on the next round (Battle Royale, or the answer that advanced the round):
              // its state is fresh, so leave it alone.
              if (currentRoundIdRef.current !== submittedRoundId) return;
              if (isBattleRoyale) {
                setMessage('Correct! Moving to next round...');
              } else {
                setMessage('Correct sequence! Please wait for other players to finish.');
              }
              setCompletedRoundId(round._id);
              setPlayerCanInput(false);
            } else {
              const remainingLives = result.remainingLives ?? (player?.lives ?? 3) - 1;
              if (remainingLives <= 0) {
                setMessage('No lives left. You have been eliminated!');
                setPlayerCanInput(false);
              } else {
                setMessage(`Wrong sequence! ${remainingLives} ${remainingLives === 1 ? 'life' : 'lives'} remaining.`);
                setShake(true);
                setTimeout(() => setShake(false), 400);
                setAttemptedSequence([]);

                // Keep input locked while the sequence replays, otherwise the tiles stay
                // clickable and the player can copy the answer as it lights up. The replay
                // (triggered by the replayKey bump) re-enables input via onSequenceComplete
                // once it finishes, exactly like a fresh round does.
                setPlayerCanInput(false);
                resetAttempt();
                setReplayKey((prev) => prev + 1);
              }
            }
          }
        );
      })
      .catch((error) => {
        if (error?.error === 'banned' || error?.error === 'removed-automation' || error?.error === 'draft-open') {
          if (error.error === 'draft-open') {
            setMessage('Wait for the card draft to finish.');
            return;
          }
          noteRemoval(error);
          return;
        }
        if (error?.error === 'round-expired' || error?.error === 'not-playing') {
          setPlayerCanInput(false);
          setMessage('Time is up!');
          return;
        }
        resetAttempt();
        setAttemptedSequence([]);
        setMessage('Could not start that attempt. Enter the sequence again.');
      });
  };

  const handleClear = () => {
    setAttemptedSequence([]);
    resetAttempt();
    setMessage('Try again. Repeat the flashed sequence.');
  };

  const handleUndo = () => {
    setAttemptedSequence((prev) => prev.slice(0, -1));
    attemptRef.current.offsets = attemptRef.current.offsets.slice(0, -1);
    if (attemptRef.current.offsets.length === 0) {
      attemptRef.current.attemptId = null;
      attemptRef.current.t0 = null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      // An open draft or hand owns the keyboard.
      if (dialogOpen) return;

      if (event.key.toLowerCase() === 'e' && canOpenHand) {
        event.preventDefault();
        setHandOpen(true);
        return;
      }

      if (event.key === 'Enter') {
        // Without this, Enter also "clicks" whichever control button last had focus.
        event.preventDefault();

        if (tilesLive && attemptedSequence.length === sequence.length) {
          handleSubmit();
        }
      }

      if (event.key === 'Backspace') {
        event.preventDefault();

        if (tilesLive && attemptedSequence.length > 0) {
          handleUndo();
        }
      }

      if (event.code === 'Space') {
        event.preventDefault();

        if (tilesLive && attemptedSequence.length > 0) {
          handleClear();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tilesLive, attemptedSequence, sequence, dialogOpen, canOpenHand]);

  const feedButton = (
    <button
      type="button"
      onClick={toggleFeed}
      aria-expanded={isFeedOpen}
      aria-controls="live-feed"
      className="relative inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-3 font-outfit text-xs font-bold text-fg shadow-lg xs:text-sm"
    >
      {isFeedOpen ? 'Hide feed' : 'Feed'}
      {unreadRows.length > 0 && (
        <span
          aria-label={`${unreadRows.length} new`}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-bold text-bg"
          style={{ background: unreadAimedAtMe ? TILE.pink : TILE.amber }}
        >
          {unreadRows.length > 99 ? '99+' : unreadRows.length}
        </span>
      )}
    </button>
  );

  // Mirrors the leaderboard: a bottom sheet on phones, a drawer from the left above that.
  const feedDrawer = (
    <aside
      id="live-feed"
      className={`fixed bottom-6 left-6 right-6 z-30 transition-transform duration-300 ease-in-out xs:bottom-auto xs:right-auto xs:top-20 xs:w-[calc(100vw-3rem)] xs:max-w-[22rem] ${
        isFeedOpen ? 'translate-y-0' : 'translate-y-[120%] xs:-translate-x-[120%] xs:translate-y-0'
      }`}
    >
      <LiveFeedPanel
        rows={feedRows}
        scope={feedScope}
        onScopeChange={setFeedScope}
        onClose={() => setIsFeedOpen(false)}
        className="max-h-[52vh] xs:max-h-[calc(100dvh-7rem)]"
      />
    </aside>
  );

  // One toast stack for every screen, centred under the top bar so it clears the live feed
  // on the left and the leaderboard on the right. It only carries things about this
  // player: cards played on or by them, life awards and the replay bonus. Everything
  // about other players lives in the live feed.
  const renderNoticeStack = (top) => (
    <div
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        pointerEvents: 'none',
        width: 'min(360px, calc(100vw - 48px))',
      }}
    >
      {notices.map((notice) => (
        <div
          key={notice.key}
          style={{
            padding: '12px 14px',
            borderRadius: '14px',
            background: notice.kind === 'life' ? 'rgba(224,48,48,0.28)' : 'rgba(255,255,255,0.12)',
            border: notice.kind === 'life' ? '1px solid rgba(255,120,120,0.6)' : '1px solid rgba(255,255,255,0.18)',
            color: 'white',
            boxShadow: '0 14px 36px rgba(0,0,0,0.28)',
            backdropFilter: 'blur(10px)',
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 700,
            fontSize: '0.9rem',
            lineHeight: 1.25,
            animation: 'levelUpToastIn 180ms ease-out',
          }}
        >
          {notice.title && <div style={{ fontSize: '1.05rem', marginBottom: '2px' }}>{notice.title}</div>}
          {notice.text}
        </div>
      ))}
    </div>
  );

  // Reached by loading /game directly, or after a refresh drops location.state.
  // Without a room PIN there is no game to subscribe to, so say so instead of
  // sitting on LOADING indefinitely.
  if (!gameId) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: 'white', letterSpacing: '4px', fontSize: '0.8rem', fontWeight: 'bold', opacity: 0.5 }}>
          NO GAME SELECTED
        </p>
        <a href="/play" style={{ color: '#7CFFB2', fontSize: '0.9rem' }}>
          Join or create a room
        </a>
      </div>
    );
  }

  if (player) seenPlayerRef.current = true;
  if (removal || (playerId && seenPlayerRef.current && !player)) {
    return <RemovedScreen error={removal} onLeave={() => navigate('/play', { replace: true })} />;
  }

  if (!player) {
    return message ? (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-bg px-6 text-center text-fg">
        <p role="alert" className="font-manrope text-sm">
          {message}
        </p>
        <a href="/play" className="font-outfit text-sm font-semibold text-primary">
          Join or create a room
        </a>
      </main>
    ) : null;
  }

  if (player.gameFinished) {
    return (
      <>
        <EliminationFeed gameId={gameId} scope={feedScope} viewerId={playerId} />
        {renderNoticeStack(18)}
        <EndLeaderboard gameId={player.gameId} currentPlayerId={player._id} />
      </>
    );
  }

  if (player.eliminated || player.completeRound) {
    const isEliminated = player.eliminated;
    return (
      <>
        <ConfirmationPopup
          isOpen={showLeavePopup}
          onConfirm={handleLeaveGame}
          onCancel={() => setShowLeavePopup(false)}
          title="Leave game?"
          message="You will stop spectating and return to the play screen. The remaining players can continue their round."
        />
        <div className="fixed left-6 top-5 z-50 xs:top-6">{feedButton}</div>
        {feedDrawer}
        <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#1a0533] to-[#0d1b4b] px-4 py-10 text-center">
          <TileLattice opacity={0.06} />
          <main className="relative z-10 flex w-full max-w-lg flex-col items-center gap-5">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-fg3">Live round activity</p>
            <h1 className="font-outfit text-3xl font-extrabold text-fg sm:text-4xl">
              {isEliminated ? 'You are spectating' : 'Round complete'}
            </h1>
            <p className="max-w-md font-manrope text-sm leading-6 text-fg2">
              {isEliminated
                ? 'You are out of this game, but you can still follow the remaining players.'
                : 'Nice work. Follow the remaining players until the next round begins.'}
            </p>
            {/* The round timer keeps running after a correct submit, so a finished player
                can see how long the others still have. */}
            {!isEliminated && !isBattleRoyale && (
              <p
                className="font-mono text-sm font-bold tracking-[0.1em]"
                style={{ color: secondsLeft <= 5 ? '#ff7a7a' : '#9ce8ff' }}
              >
                Time left: {secondsLeft}s
              </p>
            )}
            <Leaderboard gameId={gameId} currentPlayerId={playerId} />
            {leaveError && (
              <p role="alert" className="font-manrope text-sm text-red-300">
                {leaveError}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setLeaveError('');
                setShowLeavePopup(true);
              }}
              className="min-h-11 rounded-[10px] border border-hairline bg-surface px-5 py-3 font-outfit text-xs font-semibold uppercase tracking-[0.1em] text-fg2 transition-colors hover:bg-surface2 hover:text-fg"
            >
              Leave game
            </button>
          </main>
          {renderNoticeStack(76)}
        </div>
      </>
    );
  }

  if (!round) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p
          style={{
            color: 'white',
            letterSpacing: '4px',
            fontSize: '0.8rem',
            fontWeight: 'bold',
            opacity: 0.5,
          }}
        >
          LOADING...
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative"
      style={{
        height: '100dvh',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 100%)',
        display: 'flex',
        flexDirection: 'column',
        transform: shake ? 'translateX(-6px)' : 'translateX(0)',
        transition: 'transform 0.1s ease',
        boxShadow: correctGlow ? 'inset 0 0 80px #00aaff' : 'none',
      }}
    >
      <TileLattice opacity={0.06} />
      {draftOpen && (
        <DraftOverlay
          draft={myDraft}
          draftKey={draftKey}
          levelLabel={`Level ${round.roundNumber ?? round.lengthOfSequence - 3}`}
          candidates={targetCandidates}
          onPick={pickAbility}
          onSkip={skipDraft}
          onExpire={handleDraftExpire}
        />
      )}
      {handOpen && (
        <HandDialog
          cards={hand}
          candidates={targetCandidates}
          onPlay={playHandCard}
          onClose={() => setHandOpen(false)}
        />
      )}
      {renderNoticeStack(76)}
      <div
        className="relative flex shrink-0 justify-between"
        style={{ width: '100%', padding: 'clamp(12px, 2dvh, 20px) clamp(24px, 5vw, 28px)' }}
      >
        <div className="flex items-center gap-3">
          <span
            style={{
              fontSize: 'clamp(20px, 2vw, 40px)',
              fontWeight: 800,
              color: 'white',
              letterSpacing: '-0.02em',
              fontFamily: 'Outfit, sans-serif',
            }}
          >
            KIMPLY
          </span>
          {feedButton}
        </div>
      </div>
      {/* Centred with an auto margin rather than justify-center: when the column is taller
          than the screen (more hearts, a held card), justify-center pushes the overflow off
          the top where it can not be scrolled to. my-auto falls back to top-aligned scrolling. */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-6 pt-[5dvh] md:pt-0">
        <div className="flex w-full flex-col items-center md:my-auto">
          {isBattleRoyale && (
            <div
              style={{
                marginBottom: '1dvh',
                padding: 'clamp(3px, 0.7dvh, 8px) clamp(10px, 1.5vw, 18px)',
                borderRadius: '8px',
                backgroundColor: '#222',
                border: '1px solid #ffd369',
                color: '#ffd369',
                fontWeight: 'bold',
                fontSize: 'clamp(11px, 1.2vw, 18px)',
                letterSpacing: '1px',
                textAlign: 'center',
              }}
            >
              BATTLE ROYALE
            </div>
          )}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'flex-start',
              gap: 'clamp(8px, 2.5vw, 16px)',
              marginBottom: 'clamp(16px, 2.5dvh, 24px)',
            }}
          >
            {Array.from({ length: heartCount }, (_, i) => i + 1).map((heart) => (
              <div
                key={heart}
                style={{
                  width: 'clamp(32px, 6dvh, 76px)',
                  height: 'clamp(32px, 6dvh, 76px)',
                  backgroundColor: heart <= (player?.lives ?? totalLives) ? '#e03030' : '#333',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'clamp(14px, 3.2dvh, 32px)',
                  boxShadow: heart <= (player?.lives ?? totalLives) ? '0 0 10px #e0303088' : 'none',
                  transform: lifeFlash && heart === (player?.lives ?? totalLives) ? 'scale(1.35)' : 'scale(1)',
                  transition: 'all 0.3s ease',
                }}
              >
                {'❤'}
              </div>
            ))}
          </div>
          <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <p
              style={{
                color: 'white',
                marginBottom: '1dvh',
                fontWeight: 'bold',
                letterSpacing: '2px',
                fontSize: 'clamp(16px, 1.2vw, 22px)',
              }}
            >
              LEVEL {round.roundNumber ?? round.lengthOfSequence - 3}
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 'clamp(4px, 1.5vw, 10px)',
                marginBottom: 'clamp(16px, 2dvh, 24px)',
              }}
            >
              {sequence.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 'clamp(10px, 2.8vw, 50px)',
                    height: 'clamp(10px, 2.8vw, 50px)',
                    borderRadius: '50%',
                    backgroundColor: i < attemptedSequence.length ? '#fff' : '#556',
                  }}
                />
              ))}
            </div>
            <ColourSequence
              roundId={round._id}
              sequence={draftOpen ? [] : sequence}
              replayKey={replayKey}
              autoPlay={!hasSeenSequence(gameId, player?.roundId, sequenceVersion)}
              playerCanInput={tilesLive}
              onSequenceComplete={() => {
                playTurnStartSound();
                setPlayerCanInput(true);
                setMessage('Your turn. Repeat the sequence.');
                markSequenceSeen(gameId, player?.roundId, sequenceVersion);
              }}
              onColourClick={handleColourClick}
              flashingSpeed={room?.gameMode === 'custom' ? room.customSettings?.flashingSpeed : 'medium'}
              speed={playback.speed}
              lightsOut={playback.lightsOut}
            />
            <p
              style={{
                color: 'white',
                marginTop: '1.5dvh',
                minHeight: '1.25em',
                lineHeight: 1.25,
                fontSize: 'clamp(12px, 1.2vw, 24px)',
              }}
            >
              Selected: {attemptedSequence.length}/{sequence.length}
            </p>
            <p
              style={{
                color: '#ffd369',
                marginTop: '0.8dvh',
                minHeight: '1.25em',
                lineHeight: 1.25,
                fontSize: 'clamp(12px, 1.2vw, 20px)',
              }}
            >
              {message}
            </p>
            {!isBattleRoyale && (
              <p
                style={{
                  color: secondsLeft <= 5 ? '#ff7a7a' : '#9ce8ff',
                  marginTop: '0.8dvh',
                  minHeight: '1.25em',
                  lineHeight: 1.25,
                  fontSize: 'clamp(12px, 1.2vw, 20px)',
                  fontWeight: 'bold',
                  letterSpacing: '1px',
                }}
              >
                {`Time left: ${secondsLeft}s`}
              </p>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                width: 'min(100%, 520px)',
                marginInline: 'auto',
                gap: 'clamp(8px, 3vw, 16px)',
                marginTop: 'clamp(20px, 3dvh, 28px)',
              }}
            >
              <ControlButton
                label="CLEAR"
                keyHint="Space"
                onClick={handleClear}
                enabled={tilesLive && attemptedSequence.length > 0}
                enabledBackground="#444"
                disabledBackground="#222"
                disabledColour="#555"
              />
              <ControlButton
                label="UNDO"
                keyHint="Backspace"
                onClick={handleUndo}
                enabled={tilesLive && attemptedSequence.length > 0}
                enabledBackground="#444"
                disabledBackground="#222"
                disabledColour="#555"
              />
              {!isBattleRoyale && (
                <ControlButton
                  label="REPLAY"
                  hint={`${replaysRemaining} LEFT`}
                  ariaLabel={`Replay sequence, ${replaysRemaining} left`}
                  onClick={handleReplay}
                  enabled={canReplay}
                  enabledBackground="#1a3a5c"
                  disabledBackground="#222"
                  enabledColour="#7CFFB2"
                  disabledColour="#555"
                  enabledBorder="1px solid #7CFFB2"
                  disabledBorder="1px solid #333"
                />
              )}
              <ControlButton
                label="SUBMIT"
                keyHint="Enter"
                onClick={handleSubmit}
                enabled={tilesLive && attemptedSequence.length === sequence.length}
                enabledBackground="#666"
                disabledBackground="#2a2a3a"
                disabledColour="#444"
              />
            </div>
            {hand.length > 0 && (
              <button
                type="button"
                onClick={() => setHandOpen(true)}
                disabled={!canOpenHand}
                aria-keyshortcuts="E"
                className="mx-auto mt-4 inline-flex min-h-11 items-center gap-3 rounded-full border border-hairline bg-surface px-4 font-outfit text-xs font-bold uppercase tracking-[0.12em] text-fg transition-colors duration-[120ms] hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Play a card
                <span className="font-mono text-[11px] font-semibold text-fg3">{hand.length} held</span>
                <KeyHint>E</KeyHint>
              </button>
            )}
          </div>
        </div>
      </div>
      {feedDrawer}
      <button
        type="button"
        onClick={toggleLeaderboard}
        aria-expanded={isLeaderboardOpen}
        className="fixed right-6 top-5 z-50 min-h-11 rounded-full border border-hairline bg-surface px-4 py-3 font-outfit text-xs font-bold text-fg shadow-lg xs:top-6 xs:text-sm"
      >
        {isLeaderboardOpen ? 'Collapse leaderboard' : 'Leaderboard'}
      </button>
      <aside
        className={`fixed bottom-6 left-6 right-6 z-30 transition-transform duration-300 ease-in-out xs:bottom-auto xs:left-auto xs:top-20 xs:w-[calc(100vw-3rem)] xs:max-w-[28rem] ${
          isLeaderboardOpen ? 'translate-y-0' : 'translate-y-[120%] xs:translate-x-[120%] xs:translate-y-0'
        }`}
      >
        <Leaderboard gameId={gameId} currentPlayerId={playerId} className="max-h-[52vh] xs:max-h-[80vh]" />
      </aside>
    </div>
  );
};
