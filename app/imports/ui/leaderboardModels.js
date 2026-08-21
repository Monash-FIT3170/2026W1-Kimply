export function getPlayerStatus(player) {
  if (player.winner) return 'Winner';
  if (player.eliminated) return 'Eliminated';
  if (player.completeRound) return 'Completed';
  return 'Playing';
}

export function createLiveLeaderboardRows(players, currentRound) {
  const currentLevel = currentRound ? currentRound.lengthOfSequence - 3 : 0;

  return players
    .map((player) => ({
      id: player._id,
      name: player.name,
      lives: player.lives ?? 0,
      level: player.eliminated ? player.eliminatedRound ?? currentLevel : currentLevel,
      status: getPlayerStatus(player),
    }))
    .sort((a, b) => {
      const statusOrder = {
        Playing: 0,
        Completed: 1,
        Winner: 2,
        Eliminated: 3,
      };

      return (
        statusOrder[a.status] - statusOrder[b.status] ||
        b.level - a.level ||
        b.lives - a.lives ||
        a.name.localeCompare(b.name)
      );
    });
}