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
import { ROUND_TIMER_SECONDS as ROUND_SECONDS, LEVEL_UP_TOAST_MS } from '../../constants';

const seqSeenKey = (gameId, roundId) => `seqSeen:${gameId}:${roundId}`;

export const GamePage = () => {
  const [playerId, setPlayerId] = useState(null);
  const [playerCanInput, setPlayerCanInput] = useState(false);
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
  const gameMode = location.state?.gameMode || 'standard';
  const isBattleRoyale = gameMode === 'battle_royale';
  const roomPin = location.state?.pin;
  const lobbyPlayerId = location.state?.playerId;
  const accountId = location.state?.playerAccount?._id || null;
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
  const totalLives = room?.customSettings?.startingLives ?? 3;
  const levelUpEvents = useTracker(() => {
    if (!gameId) return [];
    return GameEventsCollection.find({ gameId, type: 'level-up' }, { sort: { createdAt: -1 } }).fetch();
  }, [gameId]);

  useEffect(() => {
    if (!round?._id || playerId) return;
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
  }, [round?._id, playerId, gameId, playerNameFromLobby, lobbyPlayerId, isBattleRoyale, accountId]);

  useEffect(() => {
    if (!player?.roundId) return;
    setAttemptedSequence([]);
    setMessage('');
    setSecondsLeft(30);
    setCompletedRoundId(null);
    if (gameId && localStorage.getItem(seqSeenKey(gameId, player.roundId))) {
      // already watched this round (e.g. refresh): skip the replay
      setPlayerCanInput(true);
    } else {
      setPlayerCanInput(false);
      setReplayKey((prev) => prev + 1);
    }
  }, [player?.roundId, gameId]);

  // Show the slow-motion powerup popup whenever the player picks it up
  useEffect(() => {
    setShowPowerupPopup(!!player?.slowMotionActive);
  }, [player?.slowMotionActive]);

  const seenLevelUpIds = useRef(new Set());
  useEffect(() => {
    levelUpEvents.forEach((event) => {
      if (seenLevelUpIds.current.has(event._id)) return;
      seenLevelUpIds.current.add(event._id);
      const notice = {
        key: event._id,
        text:
          event.playerId === playerId
            ? `You have leveled up to level ${event.level}`
            : `${event.playerName} has reached level ${event.level}`,
      };
      setLevelUpNotices((prev) => [...prev, notice]);
      // auto-dismiss like the elimination feed
      setTimeout(() => setLevelUpNotices((prev) => prev.filter((n) => n.key !== notice.key)), LEVEL_UP_TOAST_MS);
    });
  }, [levelUpEvents]);

  const handleColourClick = (colour) => {
    if (!playerCanInput) return;
    if (!round?.sequence) return;
    if (attemptedSequence.length >= round.sequence.length) return;
    setAttemptedSequence([...attemptedSequence, colour]);
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
        <h1 style={{ fontSize: '3rem', marginBottom: '18px' }}>GAME OVER</h1>
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
      className='relative'
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
      <div
        style={{
          position: 'fixed',
          top: '18px',
          left: '18px',
          zIndex: 40,
          display: 'flex',
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
        style={{ width: '100%', padding: 'clamp(6px, 1.5dvh, 20px) clamp(16px, 2vw, 28px)' }}
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
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto md:justify-center">
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '1vw', marginBottom: '2dvh' }}>
          {Array.from({ length: totalLives }, (_, i) => i + 1).map((heart) => (
            <div
              key={heart}
              style={{
                width: 'clamp(26px, 6dvh, 76px)',
                height: 'clamp(26px, 6dvh, 76px)',
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
        <div style={{ textAlign: 'center' }}>
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
              gap: '0.5vw',
              marginBottom: '2dvh',
            }}
          >
            {(round.sequence || []).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 'clamp(10px, 1vw, 50px)',
                  height: 'clamp(10px, 1vw, 50px)',
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
              gap: '1vw',
              marginTop: '2dvh',
            }}
          >
            <button
              onClick={handleClear}
              disabled={!playerCanInput || attemptedSequence.length === 0}
              style={{
                width: 'clamp(100px, 8vw, 300px)',
                height: 'clamp(34px, 5.5dvh, 60px)',
                backgroundColor: playerCanInput && attemptedSequence.length > 0 ? '#444' : '#222',
                color: playerCanInput && attemptedSequence.length > 0 ? 'white' : '#555',
                fontWeight: 'bold',
                fontSize: 'clamp(10px, 1vw, 20px)',
                border: 'none',
                borderRadius: '8px',
                cursor: playerCanInput && attemptedSequence.length > 0 ? 'pointer' : 'not-allowed',
                letterSpacing: '1px',
              }}
            >
              CLEAR
            </button>
            <button
              onClick={handleSubmit}
              disabled={!playerCanInput || attemptedSequence.length !== round.sequence.length}
              style={{
                width: 'clamp(100px, 8vw, 300px)',
                height: 'clamp(34px, 5.5dvh, 60px)',
                backgroundColor:
                  playerCanInput && attemptedSequence.length === round.sequence.length ? '#666' : '#2a2a3a',
                color: playerCanInput && attemptedSequence.length === round.sequence.length ? 'white' : '#444',
                fontWeight: 'bold',
                fontSize: 'clamp(10px, 1vw, 20px)',
                border: 'none',
                borderRadius: '8px',
                cursor:
                  playerCanInput && attemptedSequence.length === round.sequence.length ? 'pointer' : 'not-allowed',
                letterSpacing: '1px',
              }}
            >
              SUBMIT
            </button>
          </div>
        </div>
        <EliminationFeed gameId={gameId} />
      </div>
      <button
        type="button"
        onClick={() => setIsLeaderboardOpen((open) => !open)}
        aria-expanded={isLeaderboardOpen}
        className="fixed right-4 top-4 z-50 rounded-full border border-hairline bg-surface px-4 py-3 font-outfit text-xs font-bold text-fg shadow-lg sm:right-6 sm:top-6 sm:text-sm"
      >
        {isLeaderboardOpen ? 'Collapse leaderboard' : 'Leaderboard'}
      </button>

      <aside
        className={`fixed right-4 top-20 z-30 w-[calc(100vw-2rem)] max-w-[28rem] transition-transform duration-300 ease-in-out ${
          isLeaderboardOpen ? 'translate-x-0' : 'translate-x-[120%]'
        }`}
      >
        <Leaderboard gameId={gameId} currentPlayerId={playerId} />
      </aside>
    </div>
  );
};
