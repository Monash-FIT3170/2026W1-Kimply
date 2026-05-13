import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { RoundsCollection } from '../../api/rounds';
import { PlayersCollection } from '../../api/players';
import { ColourSequence } from '../ColourSequence.jsx';

export const GamePage = () => {
    const [playerId, setPlayerId] = useState(null);
    const [playerCanInput, setPlayerCanInput] = useState(false);
    const [attemptedSequence, setAttemptedSequence] = useState([]);
    const [message, setMessage] = useState('');

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

        Meteor.call('players.join', round._id, 'Demo Player', (error, result) => {
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

        if (result) {
            setMessage('Correct sequence! Please wait for other players to finish.');
            setPlayerCanInput(false);
        } else {
            setMessage('Wrong sequence. Try again.');
            setAttemptedSequence([]);
            setPlayerCanInput(true);
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
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
            }}
        >
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
                    Lives: {player?.lives ?? 3}
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
            </div>
        </div>
    );
};