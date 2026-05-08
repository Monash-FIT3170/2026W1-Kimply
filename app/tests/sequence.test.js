import { generateSequence, COLOURS } from "../imports/api/sequence";

const VALID_IDS = COLOURS.map(c => c.id);

describe('generateSequence', () => {
    it('generates a sequence of 4 colours by default', () => {
        const seq = generateSequence();
        expect(seq).toHaveLength(4);
    });

    it('generates a sequence of a custom length', () => {
        const seq = generateSequence(6);
        expect(seq).toHaveLength(6);
    });

    it('only selects colours from the predefines set', () => {
        const seq = generateSequence(4);
        seq.forEach(colour => {
            expect(VALID_IDS).toContain(colour.id);
        });
    });

    it('each colour has id, label and hex properties', () => {
        const seq = generateSequence(4);
        seq.forEach(colour => {
            expect(colour).toHaveProperty('id');
            expect(colour).toHaveProperty('hex');
        });
    });
});