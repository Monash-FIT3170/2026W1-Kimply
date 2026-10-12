import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { useSubscribe, useTracker } from 'meteor/react-meteor-data';
import { GlobalLeaderboardCollection } from '/imports/api/globalLeaderboard';
import { MEDAL } from '../EndLeaderboard';
import { useSignedInAccount } from '../accountSession';
import { PRIMARY, HAIRLINE, TileLattice, Avatar, avatarColor, TopBar, RainbowBar } from '../components/design';

const RANK_ACCENT = {
  1: MEDAL[0].color,
  2: MEDAL[1].color,
  3: MEDAL[2].color,
};

function rankAnnouncement(rank, name) {
  if (rank === 1) return { text: `👑 ${name}, you're the Kimply champion!`, color: MEDAL[0].color };
  if (rank === 2) return { text: `🥈 ${name}, you're Kimply's runner-up!`, color: MEDAL[1].color };
  if (rank === 3) return { text: `🥉 ${name}, you're on the Kimply podium!`, color: MEDAL[2].color };
  if (rank <= 5) return { text: `${name}, you're crushing the top 5!`, color: PRIMARY };
  if (rank <= 10) return { text: `${name}, you're officially top 10!`, color: PRIMARY };
  if (rank <= 20) return { text: `${name}, welcome to the Kimply top 20!`, color: PRIMARY };
  return { text: `${name}, you're climbing the Kimply leaderboard!`, color: PRIMARY };
}

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

// Shared by the header and every row so the columns line up. Avatars are dropped below
// `xs` so a phone has room for the player's name.
const ROW_GRID =
  'grid grid-cols-[32px_minmax(0,1fr)_repeat(3,40px)] gap-1.5 px-2.5 xs:grid-cols-[32px_minmax(0,1fr)_repeat(3,64px)] xs:gap-3 xs:px-3.5';
const STAT_CELL = 'flex items-center justify-center self-stretch border-l border-hairline';
const STATS = [
  { key: 'bestRound', label: 'Level' },
  { key: 'wins', label: 'Wins' },
  { key: 'gamesPlayed', label: 'Games' },
];

function LeaderboardHeader() {
  const label = 'font-mono text-[10px] uppercase tracking-wider text-fg3 xs:text-[11px] xs:tracking-widest';
  return (
    <div className={`${ROW_GRID} border border-transparent pb-1`}>
      <span className={`${label} text-center`}>#</span>
      <span className={label}>Player</span>
      {STATS.map((stat) => (
        <span key={stat.key} className={`${STAT_CELL} ${label}`}>
          {stat.label}
        </span>
      ))}
    </div>
  );
}

function LeaderboardRow({ entry, rank, isYou }) {
  const accent = RANK_ACCENT[rank];
  return (
    <div
      className={`${ROW_GRID} items-center rounded-xl border py-2.5 transition-colors xs:py-3`}
      style={{
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
        <div className="hidden xs:block">
          <Avatar letter={entry.displayName[0]?.toUpperCase()} color={avatarColor(entry.displayName)} size={32} />
        </div>
        <span className="truncate font-outfit text-sm font-semibold text-fg">{entry.displayName}</span>
        {isYou && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest"
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

      {STATS.map((stat) => (
        <div key={stat.key} className={`${STAT_CELL} font-outfit text-base font-extrabold text-fg`}>
          {entry[stat.key]}
        </div>
      ))}
    </div>
  );
}

export function GlobalLeaderboard() {
  const navigate = useNavigate();
  const myAccountId = useSignedInAccount()?._id || null;

  const isLoading = useSubscribe('globalLeaderboard')();
  const entries = useTracker(
    () => GlobalLeaderboardCollection.find({}, { sort: { bestRound: -1, wins: -1, achievedAt: 1 }, limit: 50 }).fetch(),
    []
  );

  const myIndex = myAccountId ? entries.findIndex((entry) => entry.accountId === myAccountId) : -1;
  const myRankInTop50 = myIndex >= 0 ? myIndex + 1 : null;
  const announcement = myRankInTop50 ? rankAnnouncement(myRankInTop50, entries[myIndex].displayName) : null;

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

      <div className="relative flex flex-1 flex-col items-center overflow-y-auto px-4 pb-10 xs:px-7 xs:pb-14">
        <div className="w-full max-w-xl">
          <div className="mb-7 text-center">
            <h1 className="font-outfit text-4xl font-extrabold tracking-tight text-fg xs:text-5xl">
              Global Leaderboard
            </h1>
            <p className="text-2sm mt-2 font-manrope text-fg3">Top 50 players, ranked by highest round reached.</p>

            {announcement && (
              <div
                className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 font-outfit text-sm font-extrabold"
                style={{
                  color: announcement.color,
                  background: `color-mix(in oklab, ${announcement.color} 16%, transparent)`,
                  border: `1px solid color-mix(in oklab, ${announcement.color} 42%, transparent)`,
                  animation: 'winnerCrown 1.1s cubic-bezier(0.22,1,0.36,1) both',
                }}
              >
                {announcement.text}
              </div>
            )}
          </div>

          <div className="rounded-[22px] border border-hairline bg-surface p-3 xs:p-4">
            <RainbowBar className="mb-4 h-1 rounded-full" />

            {isLoading ? (
              <p className="py-10 text-center font-manrope text-sm text-fg3">Loading leaderboard...</p>
            ) : entries.length === 0 ? (
              <p className="py-10 text-center font-manrope text-sm text-fg3">
                No players on the leaderboard yet — sign in and play a game to claim a spot.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <LeaderboardHeader />
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
