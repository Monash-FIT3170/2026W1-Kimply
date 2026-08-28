import { isSoundOn } from './audio';

const COLOUR_FREQUENCIES = {
  red: 523.25,    // C5
  yellow: 659.25, // E5
  green: 783.99,  // G5
  blue: 1046.5,   // C6
};

let sharedContext = null;

const getContext = () => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  if (sharedContext.state === 'suspended') sharedContext.resume().catch(() => {});
  return sharedContext;
};

const blip = (
  targetFreq,
  { duration = 0.13, gain = 0.16, type = 'square', chirpFrom = null, sweepTo = null, when = 0 } = {},
) => {
  if (!isSoundOn()) return;
  const ctx = getContext();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;

  const startFreq = chirpFrom ?? targetFreq;
  osc.frequency.setValueAtTime(startFreq, t0);
  if (chirpFrom !== null) {
    osc.frequency.exponentialRampToValueAtTime(targetFreq, t0 + 0.018);
  }
  if (sweepTo !== null) {
    osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);
  }

  // Instant attack — no ramp, no "muffled" first frame
  g.gain.setValueAtTime(gain, t0);
  g.gain.setValueAtTime(gain, t0 + duration * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0005, t0 + duration);

  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
};

export const playColourTone = (colour) => {
  const freq = COLOUR_FREQUENCIES[colour];
  if (!freq) return;
  blip(freq, { duration: 0.13, gain: 0.16, chirpFrom: freq * 0.75 });
};

export const playSuccess = () => {
  // Sonic-ring-style ascending arpeggio, sample-accurate scheduling
  [523.25, 783.99, 1046.5, 1568.0].forEach((f, i) => {
    blip(f, { duration: 0.1, gain: 0.17, when: i * 0.055 });
  });
};

export const playFailure = () => {
  // Genesis damage: harsh downward pitch bend, layered square + saw
  blip(320, { duration: 0.38, gain: 0.18, type: 'square', sweepTo: 55 });
  blip(160, { duration: 0.32, gain: 0.12, type: 'sawtooth', sweepTo: 45, when: 0.015 });
};

export const playClick = () => {
  blip(880, { duration: 0.06, gain: 0.09, type: 'triangle', chirpFrom: 660 });
};

export const vibrate = (pattern) => {
  if (!isSoundOn()) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
};
