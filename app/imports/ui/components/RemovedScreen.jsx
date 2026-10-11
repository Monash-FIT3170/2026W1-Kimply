import { TileLattice } from './design';
import { banMessage } from '../browserSession';

// Shown when this browser is removed for automated play, or when a later request
// is refused by a room block. A session block lasts for the room. An address block
// names the time it stops applying.
export function RemovedScreen({ error, onLeave }) {
  const sessionBlocked = error?.details?.reason !== 'address';
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#1a0533] to-[#0d1b4b] px-6 py-10 text-center">
      <TileLattice opacity={0.06} />
      <main className="relative z-10 flex w-full max-w-lg flex-col items-center gap-5">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-fg3">Removed from the room</p>
        <h1 className="font-outfit text-3xl font-extrabold text-fg sm:text-4xl">You were removed for automated play</h1>
        <p className="max-w-md font-manrope text-sm leading-6 text-fg2">
          {sessionBlocked
            ? 'This browser stays blocked from this room for as long as the room exists.'
            : banMessage(error)}
        </p>
        {sessionBlocked && error?.details?.expiresAt && (
          <p className="max-w-md font-manrope text-sm leading-6 text-fg2">
            {banMessage({ details: { reason: 'address', expiresAt: error.details.expiresAt } })}
          </p>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="min-h-11 rounded-[10px] border border-hairline bg-surface px-5 py-3 font-outfit text-xs font-semibold uppercase tracking-[0.1em] text-fg2 transition-colors hover:bg-surface2 hover:text-fg"
        >
          Back to play
        </button>
      </main>
    </div>
  );
}
