
import { Meteor } from "meteor/meteor";
import {getCorrectAnswer} from "../api/system.js";

Meteor.methods({
    "game.checkAnswer"(gameId, playerId, submittedAnswer) {
        // TODO: update with actual answer structure
        const correctAnswer = getCorrectAnswer(gameId);

        const isCorrect = correctAnswer.length === submittedAnswer.length && correctAnswer.every((item, i) => item === submittedAnswer[i]);

        if (!isCorrect) {
            return {eliminated: true};
        }

        return {eliminated: false};
    }
});