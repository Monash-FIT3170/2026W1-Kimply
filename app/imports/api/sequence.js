// Colours for sequence
export const COLOURS = [
    { id: 'red', label: 'Red', hex: '#FF0000' },
    { id: 'yellow', label: 'Yellow', hex: '#FFD700' },
    { id: 'green', label: 'Green', hex: '#00CC00' },
    { id: 'blue', label: 'Blue', hex: '#0000ff' },
];

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