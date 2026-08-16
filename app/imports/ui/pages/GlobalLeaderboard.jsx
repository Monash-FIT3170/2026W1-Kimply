import { useNavigate } from 'react-router-dom';
import { useSubscribe, useTracker } from 'meteor/react-meteor-data';
import { GlobalLeaderboardCollection } from '/imports/api/globalLeaderboard';
import { MEDAL } from '../EndLeaderboard';
import {
  HAIRLINE,
  TileLattice,
  Avatar,
  avatarColor,
  TopBar,
  RainbowBar,
} from '../components/design';

const RANK_ACCENT = {
  1: MEDAL[0].color,
  2: MEDAL[1].color,
  3: MEDAL[2].color,
};

function RankBadge({ rank }) {
  const accent = RANK_ACCENT[rank];
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-outfit text-[13px] font-extrabold"
      style={{
        background: accent ? `color-mix(in oklab, ${accent} 18%, transparent)` : 'transparent',
        border: `1px solid ${accent ? `color-mix(in oklab, ${accent} 45%, transparent)` : HAIRLINE}`,
        color: accent || 'oklch(0.55 0.015 270)',
      }}
    >
      {rank}
    </div>
  );
}

function LeaderboardRow({ entry, rank }) {
  const accent = RANK_ACCENT[rank];
  return (
    <div
      className="grid items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors"
      style={{
        gridTemplateColumns: '40px 1fr 72px 72px',
        borderColor: accent ? `color-mix(in oklab, ${accent} 30%, transparent)` : HAIRLINE,
        background: accent ? `color-mix(in oklab, ${accent} 7%, transparent)` : 'oklch(0.20 0.02 270)',
      }}
    >
      <RankBadge rank={rank} />

      <div className="flex min-w-0 items-center gap-3">
        <Avatar letter={entry.displayName[0]?.toUpperCase()} color={avatarColor(entry.displayName)} size={32} />
        <div className="min-w-0">
          <div className="truncate font-outfit text-sm font-semibold text-fg">{entry.displayName}</div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-fg3">
            {entry.gamesPlayed} {entry.gamesPlayed === 1 ? 'game' : 'games'}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="font-outfit text-base font-extrabold text-fg">{entry.bestRound}</div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-fg3">Level</div>
      </div>

      <div className="text-right">
        <div className="font-outfit text-base font-extrabold text-fg">{entry.wins}</div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-fg3">Wins</div>
      </div>
    </div>
  );
}

export function GlobalLeaderboard() {
  const navigate = useNavigate();

  const isLoading = useSubscribe('globalLeaderboard')();
  const entries = useTracker(
    () => GlobalLeaderboardCollection.find({}, { sort: { bestRound: -1, achievedAt: 1 }, limit: 50 }).fetch(),
    []
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.05} />

      <TopBar onBack={() => navigate('/play')} />

      <div className="relative flex flex-1 flex-col items-center overflow-y-auto px-7 pb-14">
        <div className="w-full max-w-xl">
          <div className="mb-7 text-center">
            <h1 className="font-outfit text-5xl font-extrabold tracking-tight text-fg">Global Leaderboard</h1>
            <p className="mt-2 font-manrope text-2sm text-fg3">Top 50 players, ranked by highest round reached.</p>
          </div>

          <div className="rounded-[22px] border border-hairline bg-surface p-4">
            <RainbowBar className="mb-4 h-1 rounded-full" />

            {isLoading ? (
              <p className="py-10 text-center font-manrope text-sm text-fg3">Loading leaderboard...</p>
            ) : entries.length === 0 ? (
              <p className="py-10 text-center font-manrope text-sm text-fg3">
                No players on the leaderboard yet — sign in and play a game to claim a spot.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {entries.map((entry, index) => (
                  <LeaderboardRow key={entry._id} entry={entry} rank={index + 1} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
