import { useState } from "react";

export const EndLeaderboard = () => {
    const [players, setPlayers] = useState([
        { name: "Alice", eliminatedRound: 3, },
        { name: "Charlie", eliminatedRound: 4, },
        { name: "Bob", eliminatedRound: 2, },
        { name: "Daniel", eliminatedRound: 5, },
        { name: "Erik", eliminatedRound: 7, },
        { name: "Fred", eliminatedRound: 8, },
        { name: "Gordon", eliminatedRound: 4, },
    ]);

    const sorted = [...players].sort((a, b) => b.eliminatedRound - a.eliminatedRound);

    const ranks = sorted.map((player, index) => 
        sorted.findIndex(p=>p.eliminatedRound == player.eliminatedRound)
    );

    const rankColors = ["from-yellow-300 via-yellow-400 to-yellow-600", "from-gray-200 via-gray-300 to-gray-400", "from-amber-400 via-amber-500 to-amber-700"];

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
                <h2 className="text-2xl font-bold text-center mb-6">Leaderboard</h2>
                <div className="flex">
                    <span className="w-1/6 text-left py-2 text-gray-500 font-medium">Rank</span>
                    <span className="w-3/6 text-left py-2 text-gray-500 font-medium">Name</span>
                    <span className="w-2/6 text-left py-2 text-gray-500 font-medium">Round Eliminated</span>
                </div>
                {sorted.map((player, index) => (
                    <div className={`flex rounded-lg mb-2 py-3 ${"bg-gradient-to-r " + rankColors[ranks[index]] || "bg-white"}`}>
                        <span className="w-1/6 pl-3">{ranks.filter((r)=>r==ranks[index]).length > 1 ? '=' : ''}{ranks[index]+1}</span>
                        <span className="w-3/6">{`${player.name} ${ranks[index] == 0 ? "- Winner" : ""}`}</span>
                        <span className="w-2/6">{player.eliminatedRound}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};