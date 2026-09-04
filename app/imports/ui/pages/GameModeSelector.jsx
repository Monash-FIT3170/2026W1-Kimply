import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { BG, PRIMARY, TILE, HAIRLINE, TileLattice, Wordmark, ArrowIcon } from '../components/design';

function ModeCard({ title, description, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative flex min-h-[140px] flex-col gap-2.5 overflow-hidden rounded-[18px] p-5 text-left transition-all hover:-translate-y-0.5"
      style={{
        background: color,
        color: BG,
        border: `2px solid ${color}`,
        cursor: 'pointer',
        boxShadow: `0 12px 40px -10px color-mix(in oklab, ${color} 70%, transparent), inset 0 0 0 1px color-mix(in oklab, ${color} 50%, transparent)`,
      }}
    >
      <div className="flex items-start">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-[10px]"
          style={{
            background: `color-mix(in oklab, ${BG} 12%, transparent)`,
          }}
        >
          <ArrowIcon size={18} stroke={BG} />
        </div>
      </div>

      <div className="mt-auto">
        <div className="font-outfit text-2xl font-extrabold leading-tight tracking-tight">{title}</div>
        <div
          className="mt-1.5 font-manrope text-[13px] font-medium leading-snug"
          style={{ color: `color-mix(in oklab, ${BG} 70%, transparent)` }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}

export function GameModeSelector() {
  const navigate = useNavigate();
  const { pin } = useParams();
  const { state } = useLocation();

  const gameModes = [
    {
      id: 'easy',
      title: 'Easy',
      description: 'Relaxed pace. Perfect for beginners.',
      color: 'oklch(0.75 0.20 120)',
    },
    {
      id: 'medium',
      title: 'Medium',
      description: 'Balanced challenge for all players.',
      color: 'oklch(0.70 0.22 70)',
    },
    {
      id: 'hard',
      title: 'Hard',
      description: 'Fast-paced and intense gameplay.',
      color: 'oklch(0.65 0.22 25)',
    },
    {
      id: 'custom',
      title: 'Custom',
      description: 'Configure your own settings.',
      color: 'oklch(0.60 0.20 270)',
    },
    {
      id: 'battle_royale',
      title: 'Battle Royale',
      description: 'Last player standing wins it all.',
      color: 'oklch(0.50 0.25 340)',
    },
  ];

  const handleSelectMode = async (modeId) => {
    if (modeId === 'custom') {
      navigate(`/play/custom/${pin}`, {
        state: state,
      });
    } else {
      await Meteor.callAsync('rooms.setGameMode', pin, modeId);
      navigate(`/play/${pin}`, {
        state: {
          ...state,
          gameMode: modeId,
        },
      });
    }
  };

  const handleBack = () => {
    navigate('/play');
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
        <div className="w-full max-w-4xl text-center">
          <h1 className="font-outfit text-4xl font-extrabold leading-tight tracking-tight">Select Game Mode</h1>
          <p className="mt-3 font-manrope text-[15px] text-fg3">Choose how you want to play</p>
        </div>

        {/* mode cards grid */}
        <div
          className="grid w-full max-w-4xl gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
        >
          {gameModes.map((mode) => (
            <ModeCard
              key={mode.id}
              title={mode.title}
              description={mode.description}
              color={mode.color}
              onClick={() => handleSelectMode(mode.id)}
            />
          ))}
        </div>

        <button
          onClick={handleBack}
          className="rounded-full border border-hairline px-5 py-3 font-outfit text-[13px] font-bold uppercase tracking-[0.16em] text-fg2 transition-colors hover:text-fg"
          style={{ background: 'color-mix(in oklab, oklch(0.20 0.02 270) 72%, transparent)' }}
        >
          Back
        </button>
      </div>
    </div>
  );
}
