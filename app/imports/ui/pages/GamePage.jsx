import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { RoundsCollection } from '../../api/rounds';
import { PlayersCollection } from '../../api/players';
import { ColourSequence } from '../ColourSequence.jsx';
import { Leaderboard } from '../Leaderboard.jsx';
import { EndLeaderboard } from '../EndLeaderboard.jsx';
import { useLocation } from 'react-router-dom';
import { TileLattice, BG } from '../components/design';
import { RoomsCollection } from '../../api/rooms';
export const GamePage = () => {
  const [playerId, setPlayerId] = useState(null);
  const [playerCanInput, setPlayerCanInput] = useState(false);
  const [attemptedSequence, setAttemptedSequence] = useState([]);
  const [message, setMessage] = useState('');
  const [shake, setShake] = useState(false);
  const [correctGlow, setCorrectGlow] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(true);
  const location = useLocation();
  const playerNameFromLobby = location.state?.playerName || 'Demo Player';
  const gameMode = location.state?.gameMode || 'standard';
  const isBattleRoyale = gameMode === 'battle_royale';
  const roomPin = location.state?.pin;
  const lobbyPlayerId = location.state?.playerId;
  // No 'demo' fallback: the publications are scoped by gameId, so a placeholder
  // would subscribe to a game that does not exist and hang on LOADING forever.
  const gameId = roomPin || null;
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
    return () => {
      roundsSub.stop();
      playersSub.stop();
      roomSub.stop();
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
    //in battle royale follow the player's specific round
    if (player?.roundId) {
      return RoundsCollection.findOne(player.roundId);
    }
    return RoundsCollection.findOne({ gameId, isCurrent: true });
  }, [gameId, player?.roundId]);
 const totalLives =
  room?.gameMode === 'custom'
    ? (room.customSettings?.startingLives ?? 3)
    : isBattleRoyale
      ? 1  // Battle Royale gives each player only 1 life.
// Other game modes keep their existing life settings.
      : 3;
        useEffect(() => {
    if (!round?._id || playerId) return;
    // get game mode
    const gameMode = location.state?.gameMode || 'standard';
    const isBattleRoyale = gameMode === 'battle_royale';
    Meteor.call(
      'players.join',
      round._id,
      playerNameFromLobby,
      gameId,
      lobbyPlayerId,
      isBattleRoyale,
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
  }, [round?._id, playerId, gameId, playerNameFromLobby, lobbyPlayerId]);
  useEffect(() => {
    setPlayerCanInput(false);
    setAttemptedSequence([]);
    setMessage('');
    setCompletedRoundId(null);
    setReplayKey((prev) => prev + 1); //play sequence flash for new round
  }, [player?.roundId]); //watch sequence of player's specific roundId
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
        overflowX: 'hidden',
        overflowY: 'auto',
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
      <div className="relative flex shrink-0 justify-between px-7 py-5" style={{ width: '100%' }}>
        <span
          style={{
            fontSize: '2vw',
            fontWeight: 800,
            color: 'white',
            letterSpacing: '-0.02em',
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          KIMPLY
        </span>
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-start md:justify-center">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
       {/* Battle Royale mode indicator */}
{isBattleRoyale && (
  <div
    style={{
      marginBottom: '1vh',
      padding: '0.8vh 1.5vw',
      borderRadius: '8px',
      backgroundColor: '#222',
      border: '1px solid #ffd369',
      color: '#ffd369',
      fontWeight: 'bold',
      fontSize: '1.2vw',
      textAlign: 'center',
      width: 'fit-content',
    }}
  >
    BATTLE ROYALE • 1 LIFE ONLY
  </div>
)}
        {/* Lives display */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '1vw', marginBottom: '2vh' }}>
          {/* Display the player's lives based on the current game mode.
    Battle Royale displays only 1 life. */}
      {Array.from({ length: totalLives }, (_, i) => i + 1).map((heart) => (
      
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
                {/* Show a warning when a Battle Royale player is on their final life */}
        {isBattleRoyale && player?.lives === 1 && (
          <div
            style={{
              marginTop: '1vh',
              marginBottom: '2vh',
              padding: '1vh 1.5vw',
              borderRadius: '8px',
              backgroundColor: '#3a1f1f',
              border: '1px solid #e03030',
              color: '#ff6b6b',
              fontWeight: 'bold',
              fontSize: '1.2vw',
              textAlign: 'center',
              width: 'fit-content',
            }}
          >
            FINAL LIFE
          </div>
        )}

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
            LEVEL {round.roundNumber ?? round.lengthOfSequence - 3}
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
            flashingSpeed={room?.customSettings?.flashingSpeed || 'medium'}
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
                cursor:
                  playerCanInput && attemptedSequence.length === round.sequence.length ? 'pointer' : 'not-allowed',
                letterSpacing: '1px',
              }}
            >
              SUBMIT
            </button>
          </div>
        </div>
      </div>
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
        className={`relative z-30 mx-auto mt-6 w-full max-w-[calc(100vw-2rem)] px-4 pb-8 transition-all duration-300 ease-in-out md:fixed md:right-6 md:top-20 md:mx-0 md:mt-0 md:w-[28rem] md:max-w-[calc(100vw-3rem)] md:px-0 md:pb-0 md:transition-transform ${
          isLeaderboardOpen ? 'block md:translate-x-0' : 'hidden md:block md:translate-x-full'
        }`}
      >
        <Leaderboard gameId={gameId} currentPlayerId={playerId} />
      </aside>
  </div>
  );
};
