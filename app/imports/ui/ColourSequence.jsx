import React, { useState, useEffect, useRef } from 'react';
import { BG, TILE } from './components/design';
import { lightsOutFlashes, playbackTiming } from '../api/abilityRules';
import { LIGHTS_OUT_FADE_MS } from '../constants';
import { playbackDecision } from './sequencePlayback';

// What Slo-Mo, 2x Speed and Lights Out show the player they have been hit with.
const EFFECT_LABELS = { slow: 'Slo-mo', fast: '2x speed', lightsOut: 'Lights out' };

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
  red: { active: '#ff2d55', dim: '#c0203e' },
  yellow: { active: '#ffd60a', dim: '#b89800' },
  green: { active: '#30d158', dim: '#1e8a3a' },
  blue: { active: '#0a84ff', dim: '#0a5ab5' },
};

const TILE_ORDER = ['red', 'yellow', 'green', 'blue'];

const KEY_LABELS = {
  red: 'W',
  yellow: 'A',
  green: 'S',
  blue: 'D',
};

export const ColourSequence = ({
  roundId,
  sequence = [],
  replayKey,
  onSequenceComplete,
  playerCanInput,
  onColourClick,
  flashingSpeed = 'medium',
  speed = null,
  lightsOut = false,
  autoPlay = true,
}) => {
  const [activeColour, setActiveColour] = useState(null);
  const [clickedColour, setClickedColour] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDone, setIsDone] = useState(false);
  // Lights Out: whether the board is dark for the flash being shown (or about to be).
  const [dark, setDark] = useState(false);
  // The replayKey this board last acted on, to tell a request to play from the sequence
  // merely turning up (see playbackDecision).
  const lastReplayKeyRef = useRef(replayKey);
  const effects = [speed, lightsOut && 'lightsOut'].filter(Boolean);
  // Read on every flash rather than once per playback: a Slo-Mo or 2x Speed reaches the
  // client over DDP and can land a beat after the round opens.
  const timingRef = useRef(playbackTiming(flashingSpeed, speed));
  timingRef.current = playbackTiming(flashingSpeed, speed);
  // Lights Out can land late in the same way, so it is read during playback too.
  const lightsOutRef = useRef(lightsOut);
  lightsOutRef.current = lightsOut;

  const hasSequence = Boolean(sequence && sequence.length > 0);

  useEffect(() => {
    const requested = replayKey !== lastReplayKeyRef.current;
    const action = playbackDecision({ hasSequence, requested, autoPlay });
    if (action === 'wait') return;
    lastReplayKeyRef.current = replayKey;
    if (action === 'skip') {
      // already watched (refresh, reconnect): go straight to input
      setIsPlaying(false);
      setIsDone(true);
      return;
    }

    let i = 0;
    let cancelled = false;
    let timer = null;
    // Drawn once per playback, the first time Lights Out is in effect, so each replay
    // hides a different few and an effect arriving mid-playback still applies.
    let hidden = null;
    const isHidden = (index) => {
      if (!lightsOutRef.current) return false;
      if (!hidden) hidden = new Set(lightsOutFlashes(sequence.length));
      return hidden.has(index);
    };

    setIsPlaying(true);
    setIsDone(false);
    setActiveColour(null);
    setDark(false);

    const showNext = () => {
      if (cancelled) return;
      const { flash, gap } = timingRef.current;

      if (i >= sequence.length) {
        setActiveColour(null);
        setDark(false);
        setIsPlaying(false);
        setIsDone(true);

        if (onSequenceComplete) {
          onSequenceComplete();
        }

        return;
      }

      const colour = sequence[i];
      setActiveColour(colour);

      timer = setTimeout(() => {
        setActiveColour(null);
        i++;
        // Go dark during the gap before a hidden flash, and come back during the next one.
        setDark(i < sequence.length && isHidden(i));
        timer = setTimeout(showNext, gap);
      }, flash);
    };

    timer = setTimeout(showNext, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [roundId, replayKey, hasSequence]);
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

    onColourClick(colourId, performance.now());
  };

  useEffect(() => {
    const keyMap = {
      w: 'red',
      a: 'yellow',
      s: 'green',
      d: 'blue',
    };

    const handleKeyDown = (event) => {
      const colourId = keyMap[event.key.toLowerCase()];

      if (!colourId || !playerCanInput) return;

      setClickedColour(colourId);
      playClickSound();

      setTimeout(() => {
        setClickedColour(null);
      }, 200);

      onColourClick(colourId, performance.now());
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playerCanInput, onColourClick]);

  return (
    <div style={{ '--tile-grid': 'min(360px, calc(100vw - 48px), 38dvh)' }}>
      <p
        style={{
          color: 'white',
          textAlign: 'center',
          marginBottom: 'clamp(8px, 1.6dvh, 16px)',
          fontWeight: 'bold',
          letterSpacing: '2px',
          minHeight: '1.6em',
          lineHeight: 1.6,
          fontSize: 'clamp(0.78rem, 2.6vw, 0.9rem)',
        }}
      >
        {isPlaying && 'WATCH THE SEQUENCE'}
        {isDone && 'YOUR TURN! CLICK THE COLOURS'}
        {effects.length > 0 && (
          // Its own centred line on phones, where it would not fit beside the instruction.
          <span
            className={`flex justify-center gap-3 align-middle xs:inline-flex ${isPlaying || isDone ? 'xs:ml-3' : ''}`}
          >
            {effects.map((effect) => (
              <span
                key={effect}
                data-testid={`playback-effect-${effect}`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: TILE.violet }}
              >
                <span className="h-1.5 w-1.5 animate-kimply-pulse rounded-full" style={{ background: TILE.violet }} />
                {EFFECT_LABELS[effect]}
              </span>
            ))}
          </span>
        )}
      </p>

      <div className="relative mx-auto" style={{ width: 'var(--tile-grid)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            width: 'var(--tile-grid)',
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
                  width: 'calc(var(--tile-grid) / 2 - 4px)',
                  height: 'calc(var(--tile-grid) / 2 - 4px)',
                  backgroundColor: bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '16px',
                  transition: 'all 0.15s ease',
                  // No glow on a hidden flash: it would spill out past the darkened board.
                  boxShadow:
                    isActive && !dark
                      ? `0 0 60px ${COLOURS[colourId].active}, 0 0 20px ${COLOURS[colourId].active}`
                      : 'none',
                  border: `3px solid ${isActive ? COLOURS[colourId].active : 'rgba(255,255,255,0.08)'}`,
                  cursor: playerCanInput ? 'pointer' : 'not-allowed',
                  opacity: playerCanInput || isPlaying ? 1 : 0.7,
                  transform: isActive ? 'scale(0.95)' : 'scale(1)',
                  position: 'relative',
                }}
              >
                <svg width="36%" height="36%" viewBox="0 0 64 64">
                  <ShapeIcon />
                </svg>

                <span
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '10px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: 'rgba(255,255,255,0.8)',
                    letterSpacing: '1px',
                  }}
                >
                  {KEY_LABELS[colourId]}
                </span>
              </button>
            );
          })}
        </div>
        {lightsOut && (
          // Covers the board with the page background for the flashes Lights Out hides,
          // fading in and out within the gap around each one. Lets clicks through.
          <div
            aria-hidden="true"
            data-testid="lights-out"
            data-dark={dark}
            className="pointer-events-none absolute -inset-1 rounded-[20px]"
            style={{
              background: BG,
              opacity: dark ? 0.97 : 0,
              transition: `opacity ${Math.min(timingRef.current.gap, LIGHTS_OUT_FADE_MS)}ms ease-in-out`,
            }}
          />
        )}
      </div>
    </div>
  );
};
