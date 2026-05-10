import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { RoundsCollection } from '../../api/rounds';
import { ColourSequence } from '../ColourSequence.jsx';

export const GamePage = () => {
    useEffect(() => {
        const sub = Meteor.subscribe('rounds');
        return () => sub.stop();
    }, []);

    const round = useTracker(() => {
        return RoundsCollection.findOne({ isCurrent: true });
    });
    const [playerCanInput, setPlayerCanInput] = useState(false);

    useEffect(() => {
        setPlayerCanInput(false);
    }, [round?._id]);

    if (!round) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <p style={{ color: 'white', letterSpacing: '4px', fontSize: '0.8rem', fontWeight: 'bold', opacity: 0.5 }}>
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
        }}>
            <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'white', marginBottom: '12px', fontWeight: 'bold', letterSpacing: '2px', }}>
                    LEVEL {round.lengthOfSequence - 3}
                </p>
                {/* Sequence progress dots*/}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '20px' }}>
                    {(round.sequence || []).map((_, i) => (
                        <div key={i} style={{
                            width: '12px', height: '12px', borderRadius: '50%',
                            backgroundColor: '#556',
                        }} />
                    ))}
                </div>

                {/*Colour sequence tiles with flashing*/}
                <ColourSequence 
                    roundId={round._id}
                    sequence={round.sequence} 
                    onSequenceComplete={() => setPlayerCanInput(true)}
                />

                {/*DONE button disabled until sequence finishes*/}
                <button
                    disabled={!playerCanInput}
                    style={{
                        marginTop: '28px',
                        width: '260px',
                        padding: '16px',
                        backgroundColor: playerCanInput ? '#666' : '#2a2a3a',
                        color: playerCanInput ? 'white' : '#444',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: playerCanInput ? 'pointer' : 'not-allowed',
                        letterSpacing: '2px',
                        transition: 'all 0.3s ease',
                    }}> DONE 
                </button>
            </div> 
        </div>
    );
};