import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { RoundsCollection } from '../../api/rounds';
import { PlayersCollection } from '../../api/players';
import { ColourSequence } from '../ColourSequence.jsx';
import { Leaderboard } from '../Leaderboard.jsx';
import { useLocation } from 'react-router-dom';

export const GamePage = () => {
    const [playerId, setPlayerId] = useState(null);
    const [playerCanInput, setPlayerCanInput] = useState(false);
    const [attemptedSequence, setAttemptedSequence] = useState([]);
    const [message, setMessage] = useState('');
    const [shake, setShake] = useState(false);
    const [correctGlow, setCorrectGlow] = useState(false);
    const [completedRoundId, setCompletedRoundId] = useState(null);
    const [replayKey, setReplayKey] = useState(0);
    const location = useLocation();
    const playerNameFromLobby = location.state?.playerName || 'Demo Player';
    const roomPin = location.state?.pin;


    useEffect(() => {
        const roundsSub = Meteor.subscribe('rounds');
        const playersSub = Meteor.subscribe('players');
        return () => {
            roundsSub.stop();
            playersSub.stop();
        };
    }, []);

    const round = useTracker(() => {
        return RoundsCollection.findOne({ isCurrent: true });
    });

    const player = useTracker(() => {
        if (!playerId) return null;
        return PlayersCollection.findOne(playerId);
    }, [playerId]);

    useEffect(() => {
        if (!round?._id || playerId) return;
        Meteor.call('players.join', round._id, playerNameFromLobby, (error, result) => {
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
                    setReplayKey(prev => prev + 1);
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

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            transform: shake ? 'translateX(-6px)' : 'translateX(0)',
            transition: 'transform 0.1s ease',
            boxShadow: correctGlow ? 'inset 0 0 80px #00aaff' : 'none',
        }}>
            {/* Lives display */}
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '8px', marginBottom: '16px' }}>
                {[1, 2, 3].map((heart) => (
                    <div key={heart} style={{
                        width: '44px',
                        height: '44px',
                        backgroundColor: heart <= (player?.lives ?? 3) ? '#e03030' : '#333',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        boxShadow: heart <= (player?.lives ?? 3) ? '0 0 10px #e0303088' : 'none',
                        transition: 'all 0.3s ease',
                    }}>
                        {'\u2764'}
                    </div>
                ))}
            </div>

            <div style={{ textAlign: 'center' }}>
                <p
                    style={{
                        color: 'white',
                        marginBottom: '12px',
                        fontWeight: 'bold',
                        letterSpacing: '2px',
                    }}
                >
                    LEVEL {round.lengthOfSequence - 3}
                </p>
                <p
                    style={{
                        color: '#ccc',
                        marginBottom: '12px',
                        fontSize: '0.9rem',
                    }}
                >
                </p>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '6px',
                        marginBottom: '20px',
                    }}
                >
                    {(round.sequence || []).map((_, i) => (
                        <div
                            key={i}
                            style={{
                                width: '12px',
                                height: '12px',
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
                        marginTop: '18px',
                        minHeight: '24px',
                        fontSize: '0.9rem',
                    }}
                >
                    Selected: {attemptedSequence.length}/{round.sequence.length}
                </p>
                <p
                    style={{
                        color: '#ffd369',
                        marginTop: '8px',
                        minHeight: '24px',
                        fontSize: '0.9rem',
                    }}
                >
                    {message}
                </p>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '12px',
                        marginTop: '24px',
                    }}
                >
                    <button
                        onClick={handleClear}
                        disabled={!playerCanInput || attemptedSequence.length === 0}
                        style={{
                            width: '120px',
                            padding: '14px',
                            backgroundColor:
                                playerCanInput && attemptedSequence.length > 0 ? '#444' : '#222',
                            color:
                                playerCanInput && attemptedSequence.length > 0 ? 'white' : '#555',
                            fontWeight: 'bold',
                            fontSize: '0.9rem',
                            border: 'none',
                            borderRadius: '8px',
                            cursor:
                                playerCanInput && attemptedSequence.length > 0
                                    ? 'pointer'
                                    : 'not-allowed',
                            letterSpacing: '1px',
                        }}
                    >
                        CLEAR
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={
                            !playerCanInput ||
                            attemptedSequence.length !== round.sequence.length
                        }
                        style={{
                            width: '140px',
                            padding: '14px',
                            backgroundColor:
                                playerCanInput &&
                                attemptedSequence.length === round.sequence.length
                                    ? '#666'
                                    : '#2a2a3a',
                            color:
                                playerCanInput &&
                                attemptedSequence.length === round.sequence.length
                                    ? 'white'
                                    : '#444',
                            fontWeight: 'bold',
                            fontSize: '0.9rem',
                            border: 'none',
                            borderRadius: '8px',
                            cursor:
                                playerCanInput &&
                                attemptedSequence.length === round.sequence.length
                                    ? 'pointer'
                                    : 'not-allowed',
                            letterSpacing: '1px',
                        }}
                    >
                        SUBMIT
                    </button>
                </div>
                {completedRoundId && (
                    <Leaderboard roundId={completedRoundId} />
                )}
            </div>
        </div>
    );
};