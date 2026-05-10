// Colours for sequence
export const COLOURS = ['red', 'blue', 'green', 'yellow'];

/**
 * Generate a random sequence of colours from the predefines set
 * @param {number} [length=4] number of colours in the sequence (default 4) TODO - changing to new round increases sequence
 * @returns {Array} array of colour objects
 */
export function generateSequence(length = 4) {
    return Array.from({ length }, () =>
        COLOURS[Math.floor(Math.random() * COLOURS.length)]
    );
}