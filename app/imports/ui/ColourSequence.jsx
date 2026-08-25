import React, { useState, useEffect } from 'react';

const SHAPE_ICONS = {
  red: () => <rect x="18" y="18" width="28" height="28" rx="4" fill="none" stroke="white" strokeWidth="3" />,
  yellow: () => <polygon points="32,14 50,50 14,50" fill="none" stroke="white" strokeWidth="3" />,
  green: () => <circle cx="32" cy="32" r="16" fill="none" stroke="white" strokeWidth="3" />,
  blue: () => (
    <g>
      <line x1="18" y1="18" x2="46" y2="46" stroke="white" strokeWidth="3" />
      <line x1="46" y1="18" x2="18" y2="46" stroke="white" strokeWidth="3" />
    </g>
  ),
};

const COLOURS = {
  red:    { active: '#ff2d55', dim: '#c0203e' },
  yellow: { active: '#ffd60a', dim: '#b89800' },
  green:  { active: '#30d158', dim: '#1e8a3a' },
  blue:   { active: '#0a84ff', dim: '#0a5ab5' },
};

const TILE_ORDER = ['red', 'yellow', 'green', 'blue'];

export const ColourSequence = ({
  roundId,
  sequence = [],
  replayKey,
  onSequenceComplete,
  playerCanInput,
  onColourClick,
}) => {
  const [activeColour, setActiveColour] = useState(null);
  const [clickedColour, setClickedColour] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!sequence || sequence.length === 0) return;

    let i = 0;
    let cancelled = false;

    setIsPlaying(true);
    setIsDone(false);
    setActiveColour(null);

    const showNext = () => {
      if (cancelled) return;

      if (i >= sequence.length) {
        setActiveColour(null);
        setIsPlaying(false);
        setIsDone(true);

        if (onSequenceComplete) {
          onSequenceComplete();
        }

        return;
      }

      const colour = sequence[i];
      setActiveColour(colour);

      setTimeout(() => {
        setActiveColour(null);
        i++;
        setTimeout(showNext, 250);
      }, 600);
    };

    const startDelay = setTimeout(showNext, 800);

    return () => {
      cancelled = true;
      clearTimeout(startDelay);
    };
  }, [roundId, replayKey]);
  const playClickSound = () => {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 450;
    gainNode.gain.value = 0.08;

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.08);
  };

  const handleTileClick = (colourId) => {
    if (!playerCanInput) return;

    setClickedColour(colourId);
    playClickSound();

    setTimeout(() => {
      setClickedColour(null);
    }, 200);

    onColourClick(colourId);
  };
  return (
    <div>
      <p
        style={{
          color: 'white',
          textAlign: 'center',
          marginBottom: '16px',
          fontWeight: 'bold',
          letterSpacing: '2px',
          minHeight: '24px',
          fontSize: '0.9rem',
        }}
      >
        {isPlaying && 'WATCH THE SEQUENCE'}
        {isDone && 'YOUR TURN! CLICK THE COLOURS'}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          width: 'min(360px, 90vw)',
          margin: '0 auto',
        }}
      >
        {TILE_ORDER.map((colourId) => {
          const ShapeIcon = SHAPE_ICONS[colourId];
          const isActive = activeColour === colourId || clickedColour === colourId;
          const bg = isActive ? COLOURS[colourId].active : COLOURS[colourId].dim;

          return (
            <button
              key={colourId}
              data-testid={`colour-tile-${colourId}`}
              disabled={!playerCanInput}
              onClick={() => handleTileClick(colourId)}
              style={{
                width: 'calc(min(360px, 90vw) / 2 - 3px)',
                height: 'calc(min(360px, 90vw) / 2 - 3px)',
                backgroundColor: bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '16px',
                transition: 'all 0.15s ease',
                boxShadow: isActive
                  ? `0 0 60px ${COLOURS[colourId].active}, 0 0 20px ${COLOURS[colourId].active}`
                  : 'none',
                border: `3px solid ${isActive ? COLOURS[colourId].active : 'rgba(255,255,255,0.08)'}`,
                cursor: playerCanInput ? 'pointer' : 'not-allowed',
                opacity: playerCanInput || isPlaying ? 1 : 0.7,
                transform: isActive ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              <svg width="64" height="64" viewBox="0 0 64 64">
                <ShapeIcon />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
};
