import React, { useState, useEffect, useRef } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { RoundsCollection } from '../../api/rounds';
import { PlayersCollection } from '../../api/players';
import { RoomsCollection } from '../../api/rooms';
import { GameEventsCollection } from '../../api/gameEvents';
import { ColourSequence } from '../ColourSequence.jsx';
import { Leaderboard } from '../Leaderboard.jsx';
import { EndLeaderboard } from '../EndLeaderboard.jsx';
import { EliminationFeed } from '../EliminationFeed.jsx';
import { useLocation } from 'react-router-dom';
import { TileLattice } from '../components/design';
import { useSessionResuming, useSignedInAccount } from '../accountSession';
import {
  ROUND_TIMER_SECONDS as ROUND_SECONDS,
  LEVEL_UP_TOAST_MS,
  DEFAULT_STARTING_LIVES,
  MAX_LIVE_FEED_ITEMS,
  STARTING_REPLAYS,
  REPLAY_BONUS_STREAK,
} from '../../constants';

const seqSeenKey = (gameId, roundId) => `seqSeen:${gameId}:${roundId}`;

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
  const [levelUpNotices, setLevelUpNotices] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [shake, setShake] = useState(false);
  const [correctGlow, setCorrectGlow] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [showPowerupPopup, setShowPowerupPopup] = useState(false);
  const [completedRoundId, setCompletedRoundId] = useState(null);

  const location = useLocation();
  const playerNameFromLobby = location.state?.playerName || 'Demo Player';
  const routeGameMode = location.state?.gameMode;
  const roomPin = location.state?.pin;
  const lobbyPlayerId = location.state?.playerId;
  const accountId = useSignedInAccount()?._id || null;
  const sessionResuming = useSessionResuming();
  // No 'demo' fallback: the publications are scoped by gameId, so a placeholder
  // would subscribe to a game that does not exist and hang on LOADING forever.
  const gameId = roomPin || null;

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
    if (!gameId || lobbyPlayerId) return;
    const savedPlayerId = localStorage.getItem(`gamePlayerId:${gameId}`);
    if (savedPlayerId) setPlayerId(savedPlayerId);
  }, [gameId, lobbyPlayerId]);

  useEffect(() => {
    if (!gameId) return undefined;
    const roundsSub = Meteor.subscribe('rounds', gameId);
    const playersSub = Meteor.subscribe('players', gameId);
    const roomSub = Meteor.subscribe('rooms.lobby', gameId);
    const eventsSub = Meteor.subscribe('gameEvents', gameId);
    return () => {
      roundsSub.stop();
      playersSub.stop();
      roomSub.stop();
      eventsSub.stop();
    };
  }, [gameId]);

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
  const canReplay = !isBattleRoyale && replaysRemaining > 0 && playerCanInput;

  const round = useTracker(() => {
    if (!gameId) return null;
    // in battle royale follow the player's specific round
    if (player?.roundId) {
      return RoundsCollection.findOne(player.roundId);
    }
    return RoundsCollection.findOne({ gameId, isCurrent: true });
  }, [gameId, player?.roundId]);

  // startingLives is copied into customSettings for every preset mode (easy=5, hard=1, ...),
  // not just 'custom', so size the lives track off customSettings regardless of gameMode.
  const totalLives = room?.customSettings?.startingLives ?? DEFAULT_STARTING_LIVES;
  const levelUpEvents = useTracker(() => {
    if (!gameId) return [];
    return GameEventsCollection.find({ gameId, type: 'level-up' }, { sort: { createdAt: -1 } }).fetch();
  }, [gameId]);

  useEffect(() => {
    // Wait for a stored session to resume, or the player would join without their account.
    if (!round?._id || playerId || sessionResuming) return;
    Meteor.call(
      'players.join',
      round._id,
      playerNameFromLobby,
      gameId,
      lobbyPlayerId,
      isBattleRoyale,
      accountId,
      (error, result) => {
        if (error) {
          console.error(error);
          setMessage('Could not join the game.');
          return;
        }
        setPlayerId(result);
        localStorage.setItem(`gamePlayerId:${gameId}`, result);
      }
    );
  }, [round?._id, playerId, gameId, playerNameFromLobby, lobbyPlayerId, isBattleRoyale, accountId, sessionResuming]);

  useEffect(() => {
    if (!player?.roundId) return;
    setAttemptedSequence([]);
    setMessage('');
    setSecondsLeft(30);
    setCompletedRoundId(null);
    if (gameId && localStorage.getItem(seqSeenKey(gameId, player.roundId))) {
      // already watched this round (e.g. refresh): skip the replay
      setPlayerCanInput(true);
      setReplayKey((prev) => prev + 1);
    } else {
      setPlayerCanInput(false);
      setReplayKey((prev) => prev + 1);
    }
  }, [player?.roundId, gameId]);

  //replay bonus
  const prevStreakRef = useRef(0);
  useEffect(() => {
    const streak = player?.currentStreak ?? 0;
    const prev = prevStreakRef.current;
    prevStreakRef.current = streak;

    if (streak > 0 && streak % REPLAY_BONUS_STREAK === 0 && streak !== prev) {
      setReplaysRemaining((r) => r + 1);
      const notice = {
        key: `replay-bonus-${Date.now()}`,
        text:
          REPLAY_BONUS_STREAK === 1
            ? 'Correct! Extra replay earned 🎉'
            : `${REPLAY_BONUS_STREAK} correct in a row 🎉 extra replay earned!`,
      };
      setLevelUpNotices((prev) => [...prev, notice]);
      //setTimeout(() => setMessage(''), 2500);
      setTimeout(() => setLevelUpNotices((prev) => prev.filter((n) => n.key !== notice.key)), 5000);
    }
  }, [player?.currentStreak]);

  // Show the slow-motion powerup popup whenever the player picks it up
  useEffect(() => {
    setShowPowerupPopup(!!player?.slowMotionActive);
  }, [player?.slowMotionActive]);

  const handleReplay = () => {
    if (!canReplay) return;
    setReplaysRemaining((prev) => prev - 1);
    setPlayerCanInput(false);
    setAttemptedSequence([]);
    setReplayKey((prev) => prev + 1);
  };

  const seenLevelUpIds = useRef(new Set());
  useEffect(() => {
    // The cursor is newest-first; replay oldest-first so the cap below keeps the newest.
    [...levelUpEvents].reverse().forEach((event) => {
      if (seenLevelUpIds.current.has(event._id)) return;
      seenLevelUpIds.current.add(event._id);
      const notice = {
        key: event._id,
        text:
          event.playerId === playerId
            ? `You have leveled up to level ${event.level}`
            : `${event.playerName} has reached level ${event.level}`,
      };
      setLevelUpNotices((prev) => [...prev, notice].slice(-MAX_LIVE_FEED_ITEMS));
      // auto-dismiss like the elimination feed
      setTimeout(() => setLevelUpNotices((prev) => prev.filter((n) => n.key !== notice.key)), LEVEL_UP_TOAST_MS);
    });
  }, [levelUpEvents]);

  const handleColourClick = (colour) => {
    if (!playerCanInput) return;
    if (!round?.sequence) return;
    if (attemptedSequence.length >= round.sequence.length) return;
    setAttemptedSequence((prev) => [...prev, colour]);
  };

  useEffect(() => {
    if (isBattleRoyale) return undefined; // battle royale is a free-for-all: no timer
    if (!round?._id || !playerId) return undefined;
    if (player?.eliminated || player?.gameFinished) return undefined;
    if (completedRoundId === round._id) return undefined; // already finished this round

    // One timer for the whole round; wrong guesses and lost lives do not reset it.
    // If it runs out the player is eliminated so the game can continue.
    setSecondsLeft(ROUND_SECONDS);

    const timeoutId = window.setTimeout(() => {
      setMessage('Time is up! You have been eliminated.');
      setPlayerCanInput(false);
      Meteor.call('players.timeoutRound', playerId, (error) => {
        if (error) console.error(error);
      });
    }, ROUND_SECONDS * 1000);

    const intervalId = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [round?._id, playerId, isBattleRoyale, player?.eliminated, player?.gameFinished, completedRoundId]);

  const handleSubmit = () => {
    if (!playerId) {
      setMessage('Player is not ready yet.');
      return;
    }
    if (attemptedSequence.length !== round.sequence.length) {
      setMessage(`Choose ${round.sequence.length} colours before submitting.`);
      return;
    }
    Meteor.call('players.submitSequence', playerId, attemptedSequence, (error, result) => {
      if (error) {
        console.error(error);
        setMessage('Something went wrong while submitting.');
        return;
      }
      if (result.success) {
        if (isBattleRoyale) {
          setMessage('Correct! Moving to next round...');
        } else {
          setMessage('Correct sequence! Please wait for other players to finish.');
        }
        setCompletedRoundId(round._id);
        setCorrectGlow(true);
        setTimeout(() => setCorrectGlow(false), 800);
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
          setReplayKey((prev) => prev + 1);
        }
      }
    });
  };

  const handleClear = () => {
    setAttemptedSequence([]);
    setMessage('Try again. Repeat the flashed sequence.');
  };

  const handleUndo = () => {
    setAttemptedSequence((prev) => prev.slice(0, -1));
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        // Without this, Enter also "clicks" whichever control button last had focus.
        event.preventDefault();

        if (playerCanInput && attemptedSequence.length === round.sequence.length) {
          handleSubmit();
        }
      }

      if (event.key === 'Backspace') {
        event.preventDefault();

        if (playerCanInput && attemptedSequence.length > 0) {
          handleUndo();
        }
      }

      if (event.code === 'Space') {
        event.preventDefault();

        if (playerCanInput && attemptedSequence.length > 0) {
          handleClear();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playerCanInput, attemptedSequence, round]);

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

  if (!player) return null;

  if (player.gameFinished) {
    return (
      <>
        <EliminationFeed gameId={gameId} />
        <EndLeaderboard gameId={player.gameId} currentPlayerId={player._id} />
      </>
    );
  }

  if (player?.eliminated) {
    const longestStreak = player.longestStreak ?? 0;
    const totalGuesses = player.totalGuesses ?? 0;
    const correctGuesses = player.correctGuesses ?? 0;
    const accuracy = totalGuesses > 0 ? Math.round((correctGuesses / totalGuesses) * 100) : 0;
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#000',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '24px',
        }}
      >
        <h1
          style={{
            fontSize: '3rem',
            marginBottom: '18px',
            color: isBattleRoyale ? '#ff6b6b' : 'white',
            fontWeight: '900',
            letterSpacing: '4px',
            textTransform: 'uppercase',
          }}
        >
          {isBattleRoyale ? 'ELIMINATED' : 'GAME OVER'}
        </h1>
        {isBattleRoyale && (
          <div
            style={{
              border: '1px solid #e03030',
              borderRadius: '10px',
              padding: '12px 24px',
              marginBottom: '24px',
              background: 'rgba(224, 48, 48, 0.12)',
              color: '#ff6b6b',
              fontWeight: 'bold',
              letterSpacing: '1px',
            }}
          >
            You lost your final life.
          </div>
        )}
        <div
          style={{
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '14px',
            padding: '18px 24px',
            background: 'rgba(255,255,255,0.08)',
            minWidth: '220px',
          }}
        >
          <p
            style={{
              color: '#aaa',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              letterSpacing: '3px',
              marginBottom: '8px',
              textTransform: 'uppercase',
            }}
          >
            Longest Streak
          </p>
          <p style={{ color: '#ffd369', fontSize: '3rem', fontWeight: 'bold', lineHeight: 1 }}>{longestStreak}</p>
          <p style={{ color: '#ccc', fontSize: '0.9rem', marginTop: '8px' }}>
            {longestStreak === 1 ? 'round correct in a row' : 'rounds correct in a row'}
          </p>
          <div
            style={{
              height: '1px',
              background: 'rgba(255,255,255,0.12)',
              margin: '16px 0 14px',
            }}
          />
          <p
            style={{
              color: '#aaa',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              letterSpacing: '3px',
              marginBottom: '8px',
              textTransform: 'uppercase',
            }}
          >
            Accuracy
          </p>
          <p style={{ color: '#9ce8ff', fontSize: '2rem', fontWeight: 'bold', lineHeight: 1 }}>{accuracy}%</p>
          <p style={{ color: '#ccc', fontSize: '0.9rem', marginTop: '8px' }}>
            {correctGuesses}/{totalGuesses} correct guesses
          </p>
        </div>
        <a
          href="/play"
          style={{
            marginTop: '24px',
            padding: '12px 28px',
            borderRadius: '999px',
            border: '1px solid rgba(124,255,178,0.5)',
            background: 'rgba(124,255,178,0.12)',
            color: '#7CFFB2',
            fontWeight: 'bold',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            fontSize: '0.85rem',
            textDecoration: 'none',
          }}
        >
          New Game
        </a>
        <EliminationFeed gameId={gameId} />
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
      {showPowerupPopup && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0a84ff',
            color: 'white',
            padding: '14px 28px',
            borderRadius: '12px',
            fontWeight: 'bold',
            zIndex: 1000,
          }}
        >
          Powerup Gained: Slow Motion for one round!
        </div>
      )}
      {/* Level-up announcements are hidden under sm: in a full lobby (~100 players) they
          fire constantly, and on a phone the stack buries the header and the game itself.
          Phone players still get the same information on demand from the leaderboard. */}
      <div
        className="hidden sm:flex"
        style={{
          position: 'fixed',
          top: '18px',
          left: '18px',
          zIndex: 40,
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none',
          maxWidth: 'min(320px, calc(100vw - 36px))',
        }}
      >
        {levelUpNotices.map((notice) => (
          <div
            key={notice.key}
            style={{
              padding: '12px 14px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.18)',
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
            {notice.text}
          </div>
        ))}
      </div>
      <div
        className="relative flex shrink-0 justify-between"
        style={{ width: '100%', padding: 'clamp(12px, 2dvh, 20px) clamp(24px, 5vw, 28px)' }}
      >
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
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto px-6 pb-6 md:justify-center">
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
            BATTLE ROYALE • 1 LIFE ONLY
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
            gap: 'clamp(8px, 2.5vw, 16px)',
            marginBottom: 'clamp(16px, 2.5dvh, 24px)',
          }}
        >
          {Array.from({ length: totalLives }, (_, i) => i + 1).map((heart) => (
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
                transition: 'all 0.3s ease',
              }}
            >
              {'❤'}
            </div>
          ))}
        </div>
        {/* Show a warning when a Battle Royale player is on their final life */}
        {isBattleRoyale && player?.lives === 1 && (
          <div
            style={{
              marginBottom: '1dvh',
              padding: 'clamp(3px, 0.7dvh, 8px) clamp(10px, 1.5vw, 18px)',
              borderRadius: '8px',
              backgroundColor: '#3a1f1f',
              border: '1px solid #e03030',
              color: '#ff6b6b',
              fontWeight: 'bold',
              fontSize: 'clamp(11px, 1.2vw, 18px)',
              letterSpacing: '1px',
              textAlign: 'center',
            }}
          >
            FINAL LIFE
          </div>
        )}
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
            {(round.sequence || []).map((_, i) => (
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
            sequence={round.sequence}
            replayKey={replayKey}
            autoPlay={!(gameId && player?.roundId && localStorage.getItem(seqSeenKey(gameId, player.roundId)))}
            playerCanInput={playerCanInput}
            onSequenceComplete={() => {
              playTurnStartSound();
              setPlayerCanInput(true);
              setMessage('Your turn. Repeat the sequence.');
              if (gameId && player?.roundId) localStorage.setItem(seqSeenKey(gameId, player.roundId), '1');
            }}
            onColourClick={handleColourClick}
            flashingSpeed={
              player?.slowMotionActive
                ? 'slow'
                : room?.gameMode === 'custom'
                  ? room.customSettings?.flashingSpeed
                  : 'medium'
            }
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
            Selected: {attemptedSequence.length}/{round.sequence.length}
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
              {playerCanInput ? `Time left: ${secondsLeft}s` : ''}
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
              enabled={playerCanInput && attemptedSequence.length > 0}
              enabledBackground="#444"
              disabledBackground="#222"
              disabledColour="#555"
            />
            <ControlButton
              label="UNDO"
              keyHint="Backspace"
              onClick={handleUndo}
              enabled={playerCanInput && attemptedSequence.length > 0}
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
              enabled={playerCanInput && attemptedSequence.length === round.sequence.length}
              enabledBackground="#666"
              disabledBackground="#2a2a3a"
              disabledColour="#444"
            />
          </div>
        </div>
        <EliminationFeed gameId={gameId} />
      </div>
      <button
        type="button"
        onClick={() => setIsLeaderboardOpen((open) => !open)}
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
