import React, { useState, useEffect } from 'react';

const SHAPE_ICONS = {
    red: () => <rect x="18" y="18" width="28" height="28" rx="4" fill="none" stroke="black" strokeWidth="3"/>,
    yellow: () => <polygon points="32,14 50,50 14,50" fill="none" stroke="black" strokeWidth="3"/>,
    green: () => <circle cx="32" cy="32" r="16" fill="none" stroke="black" strokeWidth="3"/>,
    blue: () => <g><line x1="18" y1="18" x2="46" y2="46" stroke="black" strokeWidth="3"/><line x1="46" y1="18" x2="18" y2="46" stroke="black" strokeWidth="3"/></g>,
};

const COLOURS = {
    red: { active: '#CC0000', dim: '#FF9999' },
    yellow: { active: '#CCCC00', dim: '#FFF599' },
    green: { active: '#00AA00', dim: '#99DD99' },
    blue: { active: '#2222CC', dim: '#99AAEE' },
};

const TILE_ORDER = ['red', 'yellow', 'green', 'blue'];

export const ColourSequence = ({ roundId, sequence =[], onSequenceComplete }) => {
    const [activeColour, setActiveColour] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isDone, setIsDone] = useState(false);

    useEffect(() => {
        if (!sequence || sequence.length === 0) return;

        let i = 0;
        let cancelled = false;

        // UI state: we are now showing the sequence
        setIsPlaying(true);
        setIsDone(false);

        // This function plays each colour one by one
        const showNext = () => {
            if (cancelled) return;

            // If we've shown all colours, end the sequence
            if (i >= sequence.length) {
                setActiveColour(null); 
                setIsPlaying(false);   
                setIsDone(true);

                // notify parent component that sequence finished
                if (onSequenceComplete) onSequenceComplete();
                return;
            }

            // current colour in the sequence
            const colour = sequence[i];

            // highlight current colour
            setActiveColour(colour);

            // after 600ms, turn it off and move to next
            setTimeout(() => {
                setActiveColour(null);
                i++;
                // small pause between flashes (250ms)
                setTimeout(showNext, 250);
            }, 600);
        };

        // small delay before starting sequence playback
        const startDelay = setTimeout(showNext, 800);
        return () => {
            cancelled = true;
            clearTimeout(startDelay);
        };
    }, [roundId]);

    //text telling player to watch sequence and then to play
    return (
        <div>
            {/*Status text*/}
            <p style={{
                color: 'white',
                textAlign: 'center',
                marginBottom: '16px',
                fontWeight: 'bold',
                letterSpacing: '2px',
                minHeight: '24px',
                fontSize: '0.9rem',
            }}>
                {isPlaying && 'WATCH THE SEQUENCE'}
                {isDone && 'YOUR TURN!'}
            </p>

            {/*2x2 colour tile grid*/}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
                width: '280px',
                margin: '0 auto',
            }}>
                {TILE_ORDER.map((colourId) => {
                    const ShapeIcon = SHAPE_ICONS[colourId];
                    const isActive = activeColour === colourId;
                    const bg = isActive ? COLOURS[colourId].active: COLOURS[colourId].dim;

                    return (
                        <div
                        key={colourId}
                        data-testid={`colour-tile-${colourId}`}
                        style={{
                            width: '136px',
                            height: '136px',
                            backgroundColor: bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            transition: 'all 0.15s ease',
                            boxShadow: isActive ? `0 0 40px ${COLOURS[colourId].active}99`: 'none',
                            border: '2px solid rgba(255,255,255,0.15)',
                            cursor: 'pointer',
                        }}
                        >
                            <svg width="64" height="64" viewBox="0 0 64 64">
                                <ShapeIcon />
                            </svg>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};