import React, { useState, useEffect } from 'react';

const SHAPE_ICONS = {
  red: () => <rect x="18" y="18" width="28" height="28" rx="4" fill="none" stroke="black" strokeWidth="3" />,
  yellow: () => <polygon points="32,14 50,50 14,50" fill="none" stroke="black" strokeWidth="3" />,
  green: () => <circle cx="32" cy="32" r="16" fill="none" stroke="black" strokeWidth="3" />,
  blue: () => (
    <g>
      <line x1="18" y1="18" x2="46" y2="46" stroke="black" strokeWidth="3" />
      <line x1="46" y1="18" x2="18" y2="46" stroke="black" strokeWidth="3" />
    </g>
  ),
};

const COLOURS = {
  red: { active: '#CC0000', dim: '#FF9999' },
  yellow: { active: '#CCCC00', dim: '#FFF599' },
  green: { active: '#00AA00', dim: '#99DD99' },
  blue: { active: '#2222CC', dim: '#99AAEE' },
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
          width: '280px',
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
                width: '136px',
                height: '136px',
                backgroundColor: bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? `0 0 45px ${COLOURS[colourId].active}` : 'none',
                border: '2px solid rgba(255,255,255,0.15)',
                cursor: playerCanInput ? 'pointer' : 'not-allowed',
                opacity: playerCanInput || isPlaying ? 1 : 0.6,
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
