import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { BG, PRIMARY, SURFACE, HAIRLINE, TileLattice, Wordmark } from '../components/design';

export function CustomGameSettings() {
  const navigate = useNavigate();
  const { pin } = useParams();
  const { state } = useLocation();

  const [flashSpeed, setFlashSpeed] = useState(500);
  const [numLives, setNumLives] = useState(3);
  const [startingSequenceLength, setStartingSequenceLength] = useState(4);

  const handleConfirm = () => {
    navigate(`/play/${pin}`, {
      state: {
        ...state,
        gameMode: 'custom',
        customSettings: {
          flashSpeed,
          numLives,
          startingSequenceLength,
        },
      },
    });
  };

  const handleBack = () => {
    navigate(`/play/modes/${pin}`, {
      state: state,
    });
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.05} />

      {/* top bar */}
      <div className="relative flex shrink-0 items-center justify-between px-7 py-5">
        <Wordmark />
        <span className="font-mono text-[11px] uppercase tracking-widest text-fg3">v1.0.0</span>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 overflow-y-auto px-7 pb-14">
        {/* title */}
        <div className="w-full max-w-md text-center">
          <h1 className="font-outfit text-3xl font-extrabold leading-tight tracking-tight">Custom Settings</h1>
          <p className="mt-2 font-manrope text-[14px] text-fg3">Fine-tune your game experience</p>
        </div>

        {/* settings panel */}
        <div className="w-full max-w-md rounded-[18px] border border-hairline bg-surface p-6">
          {/* Flash Speed */}
          <div className="mb-7">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg3">Flash Speed (ms)</label>
              <span className="font-outfit text-lg font-bold text-fg">{flashSpeed}</span>
            </div>
            <p className="mt-1 font-manrope text-[12px] text-fg3">How fast tiles flash (200-1000)</p>
            <input
              type="range"
              min="200"
              max="1000"
              value={flashSpeed}
              onChange={(e) => setFlashSpeed(Number(e.target.value))}
              className="mt-3 w-full cursor-pointer"
              style={{
                accentColor: PRIMARY,
              }}
            />
          </div>

          {/* Number of Lives */}
          <div className="mb-7">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg3">Number of Lives</label>
              <span className="font-outfit text-lg font-bold text-fg">{numLives}</span>
            </div>
            <p className="mt-1 font-manrope text-[12px] text-fg3">Lives before elimination (1-10)</p>
            <input
              type="range"
              min="1"
              max="10"
              value={numLives}
              onChange={(e) => setNumLives(Number(e.target.value))}
              className="mt-3 w-full cursor-pointer"
              style={{
                accentColor: PRIMARY,
              }}
            />
          </div>

          {/* Starting Sequence Length */}
          <div className="mb-7">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg3">Starting Sequence</label>
              <span className="font-outfit text-lg font-bold text-fg">{startingSequenceLength}</span>
            </div>
            <p className="mt-1 font-manrope text-[12px] text-fg3">Initial sequence length (2-10)</p>
            <input
              type="range"
              min="2"
              max="10"
              value={startingSequenceLength}
              onChange={(e) => setStartingSequenceLength(Number(e.target.value))}
              className="mt-3 w-full cursor-pointer"
              style={{
                accentColor: PRIMARY,
              }}
            />
          </div>
        </div>

        {/* buttons */}
        <div className="flex w-full max-w-md gap-3">
          <button
            onClick={handleBack}
            className="flex-1 rounded-full border border-hairline px-5 py-3 font-outfit text-[13px] font-bold uppercase tracking-[0.16em] text-fg2 transition-colors hover:text-fg"
            style={{ background: 'color-mix(in oklab, oklch(0.20 0.02 270) 72%, transparent)' }}
          >
            Back
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-full px-5 py-3 font-outfit text-[13px] font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
            style={{
              background: PRIMARY,
              color: BG,
              border: 'none',
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
