export function getPlayerStatus(player) {
  if (player.winner) return 'Winner';
  if (player.roundStatus) return player.roundStatus;
  if (player.eliminated) return 'Eliminated';
  if (player.completeRound) return 'Correct';
  return 'Playing';
}

export function createLiveLeaderboardRows(players, currentRound) {
  const currentLevel = currentRound ? (currentRound.roundNumber ?? currentRound.lengthOfSequence - 3) : 0;

  return players
    .map((player) => {
      // Battle Royale players advance independently; currentLevel is their
      // sequence length, with length 4 displayed as level 1.
      const playerLevel =
        player.isBattleRoyale && typeof player.currentLevel === 'number' ? player.currentLevel - 3 : currentLevel;

      return {
        id: player._id,
        name: player.name,
        lives: player.lives ?? 0,
        level: player.eliminated ? (player.eliminatedRound ?? playerLevel) : playerLevel,
        status: getPlayerStatus(player),
      };
    })
    .sort((a, b) => {
      const statusOrder = {
        Playing: 0,
        Submitted: 1,
        Correct: 2,
        Passed: 2, // cleared with a Free Pass
        Winner: 3,
        Eliminated: 4,
      };

      return (
        statusOrder[a.status] - statusOrder[b.status] ||
        b.level - a.level ||
        b.lives - a.lives ||
        a.name.localeCompare(b.name)
      );
    });
}
