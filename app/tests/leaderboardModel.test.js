import assert from 'assert';
import { createLiveLeaderboardRows, getPlayerStatus } from '../imports/ui/leaderboardModels.js';

describe('live leaderboard model', function () {
  it('returns the correct status for each player', function () {
    assert.strictEqual(getPlayerStatus({ winner: true }), 'Winner');
    assert.strictEqual(getPlayerStatus({ eliminated: true }), 'Eliminated');
    assert.strictEqual(getPlayerStatus({ completeRound: true }), 'Correct');
    assert.strictEqual(getPlayerStatus({}), 'Playing');
  });

  it('uses the public live round status when the server has supplied one', function () {
    assert.strictEqual(getPlayerStatus({ roundStatus: 'Submitted' }), 'Submitted');
    assert.strictEqual(getPlayerStatus({ roundStatus: 'Correct' }), 'Correct');
    assert.strictEqual(getPlayerStatus({ roundStatus: 'Eliminated' }), 'Eliminated');
  });

  it('shows the current level for active players', function () {
    const rows = createLiveLeaderboardRows(
      [
        {
          _id: 'player-1',
          name: 'Zeji',
          lives: 3,
          eliminated: false,
          completeRound: false,
        },
      ],
      { lengthOfSequence: 7 }
    );

    assert.strictEqual(rows[0].level, 4);
    assert.strictEqual(rows[0].status, 'Playing');
  });

  it('uses roundNumber for Easy mode instead of producing a negative level', function () {
    const rows = createLiveLeaderboardRows(
      [
        {
          _id: 'easy-player',
          name: 'Easy Player',
          lives: 3,
          eliminated: false,
          completeRound: false,
        },
      ],
      { lengthOfSequence: 1, roundNumber: 1 }
    );

    assert.strictEqual(rows[0].level, 1);
  });

  it('uses eliminatedRound as the level for eliminated players', function () {
    const rows = createLiveLeaderboardRows(
      [
        {
          _id: 'player-1',
          name: 'Zeji',
          lives: 0,
          eliminated: true,
          eliminatedRound: 3,
        },
      ],
      { lengthOfSequence: 7 }
    );

    assert.strictEqual(rows[0].level, 3);
    assert.strictEqual(rows[0].status, 'Eliminated');
  });

  it('sorts playing players before correct and eliminated players', function () {
    const rows = createLiveLeaderboardRows(
      [
        {
          _id: 'eliminated',
          name: 'Chris',
          lives: 0,
          eliminated: true,
          eliminatedRound: 2,
        },
        {
          _id: 'completed',
          name: 'Alex',
          lives: 3,
          completeRound: true,
        },
        {
          _id: 'playing',
          name: 'Zeji',
          lives: 2,
          completeRound: false,
        },
      ],
      { lengthOfSequence: 6 }
    );

    assert.deepStrictEqual(
      rows.map((player) => player.name),
      ['Zeji', 'Alex', 'Chris']
    );
  });
});
