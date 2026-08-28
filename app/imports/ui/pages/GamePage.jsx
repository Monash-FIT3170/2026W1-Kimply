import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { RoundsCollection } from '../../api/rounds';
import { PlayersCollection } from '../../api/players';
import { GameEventsCollection } from '../../api/gameEvents';
import { ColourSequence } from '../ColourSequence.jsx';
import { Leaderboard } from '../Leaderboard.jsx';
import { EndLeaderboard } from '../EndLeaderboard.jsx';
import { useLocation } from 'react-router-dom';
import { TileLattice, BG } from '../components/design';
export const GamePage = () => {
  const [playerId, setPlayerId] = useState(null);
  const [playerCanInput, setPlayerCanInput] = useState(false);
  const [attemptedSequence, setAttemptedSequence] = useState([]);
  const [message, setMessage] = useState('');
  const [levelUpNotices, setLevelUpNotices] = useState([]);
  const [shake, setShake] = useState(false);
  const [correctGlow, setCorrectGlow] = useState(false);
  const [completedRoundId, setCompletedRoundId] = useState(null);
  const [replayKey, setReplayKey] = useState(0);
  const location = useLocation();
  const playerNameFromLobby = location.state?.playerName || 'Demo Player';
  const roomPin = location.state?.pin;
  const gameId = roomPin || 'demo';
  const accountId = location.state?.playerAccount?._id || null;
  useEffect(() => {
    const roundsSub = Meteor.subscribe('rounds');
    const playersSub = Meteor.subscribe('players');
    return () => {
      roundsSub.stop();
      playersSub.stop();
    };
  }, []);
  const round = useTracker(() => {
    return RoundsCollection.findOne({ gameId, isCurrent: true });
  }, [gameId]);
  const player = useTracker(() => {
    if (!playerId) return null;
    return PlayersCollection.findOne(playerId);
  }, [playerId]);
  useEffect(() => {
    const eventsSub = Meteor.subscribe('gameEvents', gameId);
    return () => {
      eventsSub.stop();
    };
  }, [gameId]);
  const levelUpEvents = useTracker(() => {
    if (!gameId) return [];
    return GameEventsCollection.find({ gameId, type: 'level-up' }, { sort: { createdAt: -1 } }).fetch();
  }, [gameId]);
  useEffect(() => {
    if (!round?._id || playerId) return;
    Meteor.call('players.join', round._id, playerNameFromLobby, gameId, accountId, (error, result) => {
      if (error) {
        console.error(error);
        setMessage('Could not join the game.');
        return;
      }
      setPlayerId(result);
    });
  }, [round?._id, playerId]);
  useEffect(() => {
    setPlayerCanInput(false);
    setAttemptedSequence([]);
    setMessage('');
    setCompletedRoundId(null);
  }, [round?._id]);
  useEffect(() => {
    if (levelUpEvents.length === 0) return;

    const newest = [...levelUpEvents]
      .reverse()
      .slice(0, 4)
      .map((event) => ({
        key: event._id,
        text: `${event.playerName} has reached level ${event.level}`,
      }));

    setLevelUpNotices(newest);
  }, [levelUpEvents]);
  const handleColourClick = (colour) => {
    if (!playerCanInput) return;
    if (!round?.sequence) return;
    if (attemptedSequence.length >= round.sequence.length) return;
    setAttemptedSequence([...attemptedSequence, colour]);
  };
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
        setMessage('Correct sequence! Please wait for other players to finish.');
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
          setPlayerCanInput(true);
          setReplayKey((prev) => prev + 1);
        }
      }
    });
  };
  const handleClear = () => {
    setAttemptedSequence([]);
    setMessage('Try again. Repeat the flashed sequence.');
  };
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
  if (player?.gameFinished) {
    return <EndLeaderboard gameId={player.gameId} currentPlayerId={player._id} />;
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
      </div>
    );
  }
  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '2vh 2vw',
        transform: shake ? 'translateX(-6px)' : 'translateX(0)',
        transition: 'transform 0.1s ease',
        boxShadow: correctGlow ? 'inset 0 0 80px #00aaff' : 'none',
      }}
    >
      <TileLattice opacity={0.06} />
      <div
        style={{
          position: 'fixed',
          top: '18px',
          right: '18px',
          zIndex: 50,
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
      <div className="relative flex shrink-0 justify-between px-7 py-5" style={{ width: '100%' }}>
        <span style={{ fontSize: '2vw', fontWeight: 800, color: 'white', letterSpacing: '-0.02em', fontFamily: 'Outfit, sans-serif' }}>KIMPLY</span>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        {/* Lives display */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '1vw', marginBottom: '2vh' }}>
          {[1, 2, 3].map((heart) => (
            <div
              key={heart}
              style={{
                width: '4vw',
                height: '4vw',
                backgroundColor: heart <= (player?.lives ?? 3) ? '#e03030' : '#333',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2vw',
                boxShadow: heart <= (player?.lives ?? 3) ? '0 0 10px #e0303088' : 'none',
                transition: 'all 0.3s ease',
              }}
            >
              {'\u2764'}
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              color: 'white',
              marginBottom: '1vh',
              fontWeight: 'bold',
              letterSpacing: '2px',
              fontSize: '1.2vw',
            }}
          >
            LEVEL {round.lengthOfSequence - 3}
          </p>
          <p
            style={{
              color: '#ccc',
              marginBottom: '1vh',
              fontSize: '0.9vw',
            }}
          ></p>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.5vw',
              marginBottom: '2vh',
            }}
          >
            {(round.sequence || []).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '1vw',
                  height: '1vw',
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
            playerCanInput={playerCanInput}
            onSequenceComplete={() => {
              setPlayerCanInput(true);
              setMessage('Your turn. Repeat the sequence.');
            }}
            onColourClick={handleColourClick}
          />
          <p
            style={{
              color: 'white',
              marginTop: '1.5vh',
              minHeight: '2vh',
              fontSize: '1vw',
            }}
          >
            Selected: {attemptedSequence.length}/{round.sequence.length}
          </p>
          <p
            style={{
              color: '#ffd369',
              marginTop: '0.8vh',
              minHeight: '2vh',
              fontSize: '1vw',
            }}
          >
            {message}
          </p>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '1vw',
              marginTop: '2vh',
            }}
          >
            <button
              onClick={handleClear}
              disabled={!playerCanInput || attemptedSequence.length === 0}
              style={{
                width: '8vw',
                padding: '1vw',
                backgroundColor: playerCanInput && attemptedSequence.length > 0 ? '#444' : '#222',
                color: playerCanInput && attemptedSequence.length > 0 ? 'white' : '#555',
                fontWeight: 'bold',
                fontSize: '0.9vw',
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
                width: '9vw',
                padding: '1vw',
                backgroundColor:
                  playerCanInput && attemptedSequence.length === round.sequence.length ? '#666' : '#2a2a3a',
                color: playerCanInput && attemptedSequence.length === round.sequence.length ? 'white' : '#444',
                fontWeight: 'bold',
                fontSize: '0.9vw',
                border: 'none',
                borderRadius: '8px',
                cursor: playerCanInput && attemptedSequence.length === round.sequence.length ? 'pointer' : 'not-allowed',
                letterSpacing: '1px',
              }}
            >
              SUBMIT
            </button>
          </div>
          {completedRoundId && <Leaderboard roundId={completedRoundId} />}
        </div>
      </div>
    </div>
  );
};
