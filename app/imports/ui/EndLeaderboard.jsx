import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { PlayersCollection } from '../api/players';
import { useNavigate } from 'react-router-dom';
import { BG, PRIMARY, FG2, TileLattice, Avatar, TopBar, ArrowIcon, avatarColor } from './components/design';

const MEDAL = [
  { color: 'oklch(0.83 0.16 80)', label: '1st' },
  { color: 'oklch(0.72 0.01 270)', label: '2nd' },
  { color: 'oklch(0.72 0.14 55)', label: '3rd' },
];

export const EndLeaderboard = ({ gameId }) => {
  const navigate = useNavigate();

  const players = useTracker(() => {
    const sub = Meteor.subscribe('players');

    if (!sub.ready()) {
      return [];
    }

    return PlayersCollection.find(gameId ? { gameId } : {})
      .fetch()
      .map((player) => ({
        id: player._id,
        name: player.name,
        eliminatedRound: player.eliminatedRound ?? null,
        longestStreak: player.longestStreak ?? 0,
        isWinner: !!player.winner,
      }));
  }, [gameId]);

  const sorted = [...players].sort((a, b) => {
    if (a.isWinner && !b.isWinner) return -1;
    if (!a.isWinner && b.isWinner) return 1;
    return (b.eliminatedRound ?? 0) - (a.eliminatedRound ?? 0);
  });

  const rankKey = (player) => (player.isWinner ? 'winner' : player.eliminatedRound);
  const uniqueRanks = [...new Set(sorted.map(rankKey))];
  const ranks = sorted.map((player) => uniqueRanks.indexOf(rankKey(player)));

  // Group top-3 ranks into podium blocks, displayed as 2nd | 1st | 3rd
  const byRank = [0, 1, 2].map((rank) => sorted.filter((p) => ranks[sorted.indexOf(p)] === rank));
  const podiumOrder = [byRank[1], byRank[0], byRank[2]];
  const podiumHeights = [90, 120, 72];
  const winnerGroup = byRank[0] ?? [];
  const highestEliminatedRound = Math.max(0, ...players.map((player) => player.eliminatedRound ?? 0));

  const playerScore = (player) => {
    if (player.isWinner) return Math.max(highestEliminatedRound, player.eliminatedRound ?? 0);
    return player.eliminatedRound ?? 0;
  };

  if (players.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-fg">
        <p className="font-mono text-sm uppercase tracking-widest">No leaderboard results yet</p>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen w-full flex-col"
      style={{ background: BG, color: 'oklch(0.93 0.01 270)' }}
    >
      <div className="pointer-events-none fixed inset-0" style={{ zIndex: 0 }}>
        <TileLattice opacity={0.09} />
      </div>
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: `radial-gradient(ellipse at center, ${BG} 0%, ${BG} 22%, transparent 70%)`, zIndex: 0 }}
      />

      <div className="relative z-10">
        <TopBar onBack={() => navigate('/')} />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center px-6 pb-12">
        <div
          className="mb-7 flex flex-col items-center text-center"
          style={{ animation: 'leaderboardTitleIn 0.7s ease both' }}
        >
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: PRIMARY }}>
            Final Results
          </p>
          <h1 className="font-outfit text-5xl font-extrabold tracking-tight">Leaderboard</h1>
          {winnerGroup.length > 0 && (
            <div
              className="mt-4 rounded-full px-4 py-2 font-outfit text-sm font-extrabold"
              style={{
                color: BG,
                background: `linear-gradient(135deg, ${MEDAL[0].color}, ${PRIMARY})`,
                boxShadow: `0 0 34px color-mix(in oklab, ${MEDAL[0].color} 28%, transparent)`,
                animation: 'winnerCrown 1.1s cubic-bezier(0.22,1,0.36,1) 0.35s both',
              }}
            >
              Winner: {winnerGroup.map((player) => player.name).join(' & ')}
            </div>
          )}
        </div>

        {/* Podium */}
        <div className="mb-10 flex w-full max-w-md items-end justify-center gap-3">
          {podiumOrder.map((group, i) => {
            const medalIndex = i === 0 ? 1 : i === 1 ? 0 : 2;
            const medal = MEDAL[medalIndex];
            // 3rd rises first (i=2, delay 0s), 2nd next (i=0, delay 0.5s), 1st last (i=1, delay 1s)
            const riseDelay = i === 2 ? 0 : i === 0 ? 0.5 : 1;
            const avatarDelay = riseDelay + 0.35;
            if (group.length === 0) return <div key={i} className="flex-1" />;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="flex items-end gap-1"
                  style={{ animation: `avatarPop 0.5s cubic-bezier(0.34,1.56,0.64,1) ${avatarDelay}s both` }}
                >
                  {group.length === 2 ? (
                    <>
                      <Avatar letter={group[0].name[0]} color={avatarColor(group[0].name)} size={40} />
                      <Avatar letter={group[1].name[0]} color={avatarColor(group[1].name)} size={40} />
                    </>
                  ) : (
                    <>
                      <Avatar letter={group[0].name[0]} color={avatarColor(group[0].name)} size={44} />
                      {group.length > 1 && (
                        <div
                          className="-ml-2 mb-0.5 flex items-center justify-center rounded-full font-outfit text-[11px] font-extrabold"
                          style={{ width: 22, height: 22, background: medal.color, color: 'oklch(0.18 0.02 270)' }}
                        >
                          +{group.length - 1}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <span
                  className="text-center font-outfit text-sm font-bold"
                  style={{
                    color: medal.color,
                    animation: `avatarPop 0.4s cubic-bezier(0.34,1.56,0.64,1) ${avatarDelay + 0.05}s both`,
                  }}
                >
                  {group.length === 2
                    ? `${group[0].name} & ${group[1].name}`
                    : `${group[0].name}${group.length > 1 ? ` +${group.length - 1}` : ''}`}
                </span>
                <span
                  className="rounded-full px-2 py-1 text-center font-mono text-[10px] uppercase tracking-widest"
                  style={{
                    color: medal.color,
                    background: `color-mix(in oklab, ${medal.color} ${medalIndex === 0 ? 22 : medalIndex === 1 ? 14 : 18}%, transparent)`,
                    border: `1px solid color-mix(in oklab, ${medal.color} ${medalIndex === 0 ? 45 : medalIndex === 1 ? 28 : 36}%, transparent)`,
                    boxShadow:
                      medalIndex === 0 ? `0 0 18px color-mix(in oklab, ${medal.color} 24%, transparent)` : 'none',
                    animation: `avatarPop 0.4s cubic-bezier(0.34,1.56,0.64,1) ${avatarDelay + 0.1}s both`,
                  }}
                >
                  {group[0].isWinner
                    ? 'Winner · Last Standing'
                    : medalIndex === 1
                      ? `Runner-up · Rd ${group[0].eliminatedRound}`
                      : medalIndex === 2
                        ? `Third · Rd ${group[0].eliminatedRound}`
                        : `Rd ${group[0].eliminatedRound}`}
                </span>
                <div
                  className="flex w-full items-center justify-center rounded-t-xl font-outfit text-lg font-extrabold"
                  style={{
                    height: podiumHeights[i],
                    background: `color-mix(in oklab, ${medal.color} 15%, transparent)`,
                    border: `1px solid color-mix(in oklab, ${medal.color} 35%, transparent)`,
                    borderBottom: 'none',
                    color: medal.color,
                    boxShadow:
                      medalIndex === 0
                        ? `0 -16px 34px -22px color-mix(in oklab, ${medal.color} 60%, transparent)`
                        : 'none',
                    animation: `podiumRise 0.75s cubic-bezier(0.22,1,0.36,1) ${riseDelay}s both`,
                  }}
                >
                  {group.length > 1 ? `=${medalIndex + 1}` : medalIndex + 1}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex w-full max-w-md flex-col gap-2">
          {/* header */}
          <div className="mb-1 flex px-3" style={{ animation: 'rowSlideIn 0.45s ease 1.35s both' }}>
            <span className="w-12 font-mono text-[10px] uppercase tracking-widest" style={{ color: FG2 }}>
              Rank
            </span>
            <span className="flex-1 font-mono text-[10px] uppercase tracking-widest" style={{ color: FG2 }}>
              Player
            </span>
            <span className="w-24 text-right font-mono text-[10px] uppercase tracking-widest" style={{ color: FG2 }}>
              Score
            </span>
            <span className="w-24 text-right font-mono text-[10px] uppercase tracking-widest" style={{ color: FG2 }}>
              Streak
            </span>
          </div>

          {sorted.map((player, index) => {
            const rank = uniqueRanks.indexOf(rankKey(player));
            const tied = sorted.filter((p) => rankKey(p) === rankKey(player)).length > 1;
            const medal = MEDAL[rank];
            const rowColor = medal ? medal.color : 'oklch(0.93 0.01 270)';
            const rowDelay = 1.5 + index * 0.04;

            return (
              <div
                key={player.name}
                className="flex items-center gap-3 rounded-xl px-3 py-3"
                style={{
                  animation: `scoreboardRowIn 0.55s cubic-bezier(0.22,1,0.36,1) ${rowDelay}s both`,
                  background: medal
                    ? `color-mix(in oklab, ${medal.color} 12%, transparent)`
                    : 'color-mix(in oklab, white 4%, transparent)',
                  border: `1px solid ${
                    medal
                      ? `color-mix(in oklab, ${medal.color} 30%, transparent)`
                      : `color-mix(in oklab, white 8%, transparent)`
                  }`,
                }}
              >
                <span className="w-12 shrink-0 font-outfit text-sm font-extrabold" style={{ color: rowColor }}>
                  {tied ? '=' : ''}
                  {rank + 1}
                </span>

                <Avatar letter={player.name[0]} color={avatarColor(player.name)} size={32} />

                <span className="flex-1 font-outfit text-[15px] font-semibold" style={{ color: rowColor }}>
                  {player.name}
                  {rank === 0 && (
                    <span
                      className="ml-2 font-mono text-[10px] uppercase tracking-widest"
                      style={{ color: PRIMARY, animation: 'winnerPulse 1.5s ease-in-out infinite' }}
                    >
                      Winner
                    </span>
                  )}
                </span>

                <span className="w-24 text-right font-mono text-sm" style={{ color: FG2 }}>
                  {player.isWinner ? `Won Rd ${playerScore(player)}` : `Rd ${playerScore(player)}`}
                </span>

                <span className="w-24 text-right font-mono text-sm" style={{ color: FG2 }}>
                  {player.longestStreak}
                </span>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => navigate('/play')}
          className="mt-8 inline-flex items-center gap-2 rounded-full px-5 py-3 font-outfit text-[13px] font-extrabold uppercase tracking-[0.16em] transition-transform hover:scale-[1.02]"
          style={{
            background: `color-mix(in oklab, ${PRIMARY} 16%, transparent)`,
            border: `1px solid color-mix(in oklab, ${PRIMARY} 48%, transparent)`,
            color: PRIMARY,
            animation: 'homeButtonIn 0.55s ease 1.8s both',
          }}
        >
          New Game
          <ArrowIcon size={14} stroke={PRIMARY} />
        </button>
      </div>
    </div>
  );
};
