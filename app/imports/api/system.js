
// TODO: intergrate with database

const games = {};

let nextGameId = 1;

export function createGame() {
    const gameId = nextGameId++;
    games[gameId] = {
        currentRound: 0,
        correctAnswers: [[0, 1, 2]],
        players: []
    };
    return gameId;
}

export function getCorrectAnswer(gameId) {
    const game = games[gameId];
    return game.correctAnswers[game.currentRound];
}