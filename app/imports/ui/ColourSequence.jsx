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
  soundEnabled = true,
  reduceMotion = false,
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
    // Audio is optional so players can use the visual pattern without sound.
    if (!soundEnabled) return;

    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;

    const audioContext = new AudioCtor();
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
    }, reduceMotion ? 0 : 200);

    onColourClick(colourId);
  };
  useEffect(() => {
    const shortcuts = { r: 'red', y: 'yellow', g: 'green', b: 'blue' };

    const handleShortcut = (event) => {
      if (!playerCanInput || event.metaKey || event.ctrlKey || event.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;

      const colourId = shortcuts[event.key.toLowerCase()];
      if (!colourId) return;

      event.preventDefault();
      handleTileClick(colourId);
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [playerCanInput, soundEnabled, reduceMotion, onColourClick]);
  return (
    <section aria-label="Sequence controls">
      <p
        role="status"
        aria-live="polite"
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
        role="group"
        aria-label={isPlaying ? 'Watch the colour sequence' : 'Choose the colour sequence'}
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
              aria-keyshortcuts={colourId[0]}
              aria-label={`${colourId} tile${playerCanInput ? `. Press ${colourId[0].toUpperCase()} to select it` : ', unavailable while the sequence plays'}`}
              style={{
                width: 'calc(min(360px, 90vw) / 2 - 3px)',
                height: 'calc(min(360px, 90vw) / 2 - 3px)',
                position: 'relative',
                backgroundColor: bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '16px',
                transition: reduceMotion ? 'none' : 'all 0.15s ease',
                boxShadow: isActive
                  ? `0 0 60px ${COLOURS[colourId].active}, 0 0 20px ${COLOURS[colourId].active}`
                  : 'none',
                border: `3px solid ${isActive ? COLOURS[colourId].active : 'rgba(255,255,255,0.08)'}`,
                cursor: playerCanInput ? 'pointer' : 'not-allowed',
                opacity: playerCanInput || isPlaying ? 1 : 0.7,
                transform: reduceMotion ? 'none' : isActive ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              <svg width="64" height="64" viewBox="0 0 64 64">
                <ShapeIcon />
              </svg>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  padding: '3px 6px',
                  borderRadius: '5px',
                  background: 'rgba(0,0,0,0.28)',
                  color: 'white',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                }}
              >
                {colourId[0].toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
