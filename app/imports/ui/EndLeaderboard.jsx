import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BG, PRIMARY, TILE, HAIRLINE, FG2, TileLattice, Avatar, TopBar, avatarColor } from "./components/design";

const MEDAL = [
    { color: 'oklch(0.83 0.16 80)',  label: '1st' },
    { color: 'oklch(0.72 0.01 270)', label: '2nd' },
    { color: 'oklch(0.72 0.14 55)',  label: '3rd' },
];

export const EndLeaderboard = () => {
    const navigate = useNavigate();

    const [players] = useState([
        { name: "Fred",    eliminatedRound: 8 },
        { name: "Gordon",  eliminatedRound: 7 },
        { name: "Hannah",  eliminatedRound: 7 },
        { name: "Zara",    eliminatedRound: 2 },
        { name: "Yusuf",   eliminatedRound: 2 },
        { name: "Mia",     eliminatedRound: 2 },
        { name: "Noah",    eliminatedRound: 1 },
        ...Array.from({ length: 100 }, (_, i) => ({ name: `Player${i + 1}`, eliminatedRound: 3 })),
    ]);

    const sorted = [...players].sort((a, b) => b.eliminatedRound - a.eliminatedRound);
    const uniqueRounds = [...new Set(sorted.map(p => p.eliminatedRound))].sort((a, b) => b - a);
    const ranks = sorted.map(player => uniqueRounds.indexOf(player.eliminatedRound));

    // Group top-3 ranks into podium blocks, displayed as 2nd | 1st | 3rd
    const byRank = [0, 1, 2].map(rank => sorted.filter(p => ranks[sorted.indexOf(p)] === rank));
    const podiumOrder = [byRank[1], byRank[0], byRank[2]];
    const podiumHeights = [72, 100, 56];

    return (
        <div className="relative w-full min-h-screen flex flex-col overflow-hidden" style={{ background: BG, color: 'oklch(0.93 0.01 270)' }}>
            <TileLattice opacity={0.09} />
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at center, ${BG} 0%, ${BG} 22%, transparent 70%)` }}
            />

            <TopBar onBack={() => navigate('/')} />

            <div className="relative flex-1 flex flex-col items-center px-6 pb-12">
                <h1 className="font-outfit font-extrabold text-3xl tracking-tight mb-1">Leaderboard</h1>
                <p className="font-mono text-[11px] uppercase tracking-widest mb-8" style={{ color: FG2 }}>Final Results</p>

                {/* Podium */}
                <div className="w-full max-w-md flex items-end justify-center gap-3 mb-10 overflow-hidden">
                    {podiumOrder.map((group, i) => {
                        const medalIndex = i === 0 ? 1 : i === 1 ? 0 : 2;
                        const medal = MEDAL[medalIndex];
                        // 3rd rises first (i=2, delay 0s), 2nd next (i=0, delay 0.5s), 1st last (i=1, delay 1s)
                        const riseDelay = i === 2 ? 0 : i === 0 ? 0.5 : 1;
                        const avatarDelay = riseDelay + 0.35;
                        if (group.length === 0) return <div key={i} className="flex-1" />;
                        return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-2">
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
                                                    className="rounded-full flex items-center justify-center font-outfit font-extrabold text-[11px] -ml-2 mb-0.5"
                                                    style={{ width: 22, height: 22, background: medal.color, color: 'oklch(0.18 0.02 270)' }}
                                                >
                                                    +{group.length - 1}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                <span
                                    className="font-outfit font-bold text-sm text-center"
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
                                    className="font-mono text-[10px] uppercase tracking-widest text-center"
                                    style={{
                                        color: FG2,
                                        animation: `avatarPop 0.4s cubic-bezier(0.34,1.56,0.64,1) ${avatarDelay + 0.1}s both`,
                                    }}
                                >
                                    {`Rd ${group[0].eliminatedRound}`}
                                </span>
                                <div
                                    className="w-full rounded-t-xl flex items-center justify-center font-outfit font-extrabold text-lg"
                                    style={{
                                        height: podiumHeights[i],
                                        background: `color-mix(in oklab, ${medal.color} 15%, transparent)`,
                                        border: `1px solid color-mix(in oklab, ${medal.color} 35%, transparent)`,
                                        borderBottom: 'none',
                                        color: medal.color,
                                        animation: `podiumRise 0.6s cubic-bezier(0.22,1,0.36,1) ${riseDelay}s both`,
                                    }}
                                >
                                    {group.length > 1 ? `=${medalIndex + 1}` : medalIndex + 1}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="w-full max-w-md flex flex-col gap-2">
                    {/* header */}
                    <div className="flex px-3 mb-1">
                        <span className="w-12 font-mono text-[10px] uppercase tracking-widest" style={{ color: FG2 }}>Rank</span>
                        <span className="flex-1 font-mono text-[10px] uppercase tracking-widest" style={{ color: FG2 }}>Player</span>
                        <span className="w-24 text-right font-mono text-[10px] uppercase tracking-widest" style={{ color: FG2 }}>Round</span>
                    </div>

                    {sorted.filter((player) => uniqueRounds.indexOf(player.eliminatedRound) > 2).map((player, index) => {
                        const rank = uniqueRounds.indexOf(player.eliminatedRound);
                        const tied = sorted.filter(p => p.eliminatedRound === player.eliminatedRound).length > 1;
                        const medal   = MEDAL[rank];
                        const rowColor = medal ? medal.color : 'oklch(0.93 0.01 270)';
                        const rowDelay = 1.5 + index * 0.04;

                        return (
                            <div
                                key={player.name}
                                className="flex items-center gap-3 px-3 py-3 rounded-xl"
                                style={{
                                    animation: `rowSlideIn 0.4s ease ${rowDelay}s both`,
                                    background: medal
                                        ? `color-mix(in oklab, ${medal.color} 12%, transparent)`
                                        : 'color-mix(in oklab, white 4%, transparent)',
                                    border: `1px solid ${medal
                                        ? `color-mix(in oklab, ${medal.color} 30%, transparent)`
                                        : `color-mix(in oklab, white 8%, transparent)`}`,
                                }}
                            >
                                <span
                                    className="w-12 font-outfit font-extrabold text-sm shrink-0"
                                    style={{ color: rowColor }}
                                >
                                    {tied ? '=' : ''}{rank + 1}
                                </span>

                                <Avatar
                                    letter={player.name[0]}
                                    color={avatarColor(player.name)}
                                    size={32}
                                />

                                <span className="flex-1 font-outfit font-semibold text-[15px]" style={{ color: rowColor }}>
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
                                    {rank === 0 ? '—' : `Rd ${player.eliminatedRound}`}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
