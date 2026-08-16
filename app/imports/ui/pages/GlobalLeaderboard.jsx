import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { useSubscribe, useTracker } from 'meteor/react-meteor-data';
import { GlobalLeaderboardCollection } from '/imports/api/globalLeaderboard';
import { MEDAL } from '../EndLeaderboard';
import {
  PRIMARY,
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

function LeaderboardRow({ entry, rank, isYou }) {
  const accent = RANK_ACCENT[rank];
  return (
    <div
      className="grid items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors"
      style={{
        gridTemplateColumns: '40px 1fr 72px 72px',
        background: accent
          ? `color-mix(in oklab, ${accent} 7%, transparent)`
          : isYou
            ? `color-mix(in oklab, ${PRIMARY} 10%, transparent)`
            : 'oklch(0.20 0.02 270)',
        borderColor: isYou
          ? `color-mix(in oklab, ${PRIMARY} 48%, transparent)`
          : accent
            ? `color-mix(in oklab, ${accent} 30%, transparent)`
            : HAIRLINE,
        boxShadow: isYou ? `0 0 22px color-mix(in oklab, ${PRIMARY} 18%, transparent)` : 'none',
        animation: isYou ? 'scoreboardRowIn 0.6s cubic-bezier(0.22,1,0.36,1) both' : 'none',
      }}
    >
      <RankBadge rank={rank} />

      <div className="flex min-w-0 items-center gap-3">
        <Avatar letter={entry.displayName[0]?.toUpperCase()} color={avatarColor(entry.displayName)} size={32} />
        <div className="min-w-0">
          <div className="truncate font-outfit text-sm font-semibold text-fg">
            {entry.displayName}
            {isYou && (
              <span
                className="ml-2 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest"
                style={{
                  color: PRIMARY,
                  background: `color-mix(in oklab, ${PRIMARY} 16%, transparent)`,
                  border: `1px solid color-mix(in oklab, ${PRIMARY} 38%, transparent)`,
                }}
              >
                You
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-fg3">
            {entry.gamesPlayed} {entry.gamesPlayed === 1 ? 'game' : 'games'}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="font-outfit text-base font-extrabold text-fg">{entry.bestRound}</div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-fg3">Level</div>
      </div>

      <div className="text-right">
        <div className="font-outfit text-base font-extrabold text-fg">{entry.wins}</div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-fg3">Wins</div>
      </div>
    </div>
  );
}

export function GlobalLeaderboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const myAccountId = location.state?.playerAccount?._id || null;

  const isLoading = useSubscribe('globalLeaderboard')();
  const entries = useTracker(
    () => GlobalLeaderboardCollection.find({}, { sort: { bestRound: -1, achievedAt: 1 }, limit: 50 }).fetch(),
    []
  );

  const myIndex = myAccountId ? entries.findIndex((entry) => entry.accountId === myAccountId) : -1;
  const myRankInTop50 = myIndex >= 0 ? myIndex + 1 : null;

  const [myStanding, setMyStanding] = useState(null);

  useEffect(() => {
    if (isLoading || !myAccountId || myRankInTop50) {
      setMyStanding(null);
      return;
    }
    Meteor.call('globalLeaderboard.myStanding', myAccountId, (err, result) => {
      if (!err) setMyStanding(result);
    });
  }, [isLoading, myAccountId, myRankInTop50]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.05} />

      <TopBar onBack={() => navigate(-1)} />

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
                  <LeaderboardRow
                    key={entry._id}
                    entry={entry}
                    rank={index + 1}
                    isYou={myAccountId != null && entry.accountId === myAccountId}
                  />
                ))}

                {myStanding && (
                  <>
                    <div className="my-1 flex items-center gap-2" aria-hidden="true">
                      <div className="h-px flex-1" style={{ background: HAIRLINE }} />
                      <span className="font-mono text-[13px] uppercase tracking-widest text-fg3">Your ranking</span>
                      <div className="h-px flex-1" style={{ background: HAIRLINE }} />
                    </div>
                    <LeaderboardRow
                      entry={{
                        accountId: myAccountId,
                        displayName: myStanding.displayName,
                        bestRound: myStanding.bestRound,
                        gamesPlayed: myStanding.gamesPlayed,
                        wins: myStanding.wins,
                      }}
                      rank="–"
                      isYou
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
