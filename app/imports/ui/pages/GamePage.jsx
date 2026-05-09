import React, { useState } from 'react';
import { generateSequence } from '../../api/sequence';
import { ColourSequence } from '../ColourSequence.jsx';

export const GamePage = () => {
    const [level, setLevel] = useState(1);
    const [sequence, setSequence] = useState(() => generateSequence(4));
    const [playerCanInput, setPlayerCanInput] = useState(false);

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
                    LEVEL 1
                </p>
                {/* Sequence progress dots*/}
                <div style={{ display: 'flex', justfyContent: 'center', gap: '6px', marginBottom: '20px' }}>
                    {sequence.map((_, i) => (
                        <div key={i} style={{
                            width: '12px', height: '12px', borderRadius: '50%',
                            backgroundColour: '#556',
                        }} />
                    ))}
                </div>

                {/*Colour sequence tiles with flashing*/}
                <ColourSequence 
                sequence={sequence} 
                onSequenceComplete={() => setPlayerCanInput(true)}
                />

                {/*DONE button disabled until sequence finishes*/}
                <button
                    disabled={!playerCanInput}
                    style={{
                        marginTop: '28px',
                        width: '260px',
                        padding: '16px',
                        backgroundColour: playerCanInput ? '##666' : '##2a2a3a',
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