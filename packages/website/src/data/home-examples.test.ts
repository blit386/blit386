/**
 * Covers `src/data/home-examples.ts`: the metadata next to each example game is validated at build time, and the
 * strip caption is generated from it, never typed by hand.
 */

import { describe, expect, it } from 'vitest';
import { HOME_EXAMPLES, parseExamples } from './home-examples';

const ROCKS = {
    name: 'Rocks',
    idea: 'asteroids, but the rocks split',
    app: 'ChatGPT',
    plan: 'free plan',
    model: 'GPT-5',
    date: '2026-11-27',
    promptVersion: '1.9.2',
    promptCommit: '35a94d86c0ffee0000000000000000000000000a',
    fill: '#000000',
};

const PATH = '../../../demos/public/examples/rocks.json';

describe('parseExamples', () => {
    it('takes the slug from the file name and orders by it', () => {
        const examples = parseExamples({ '../examples/zap.json': ROCKS, [PATH]: ROCKS }, '1.9.2');

        expect(examples.map((example) => example.slug)).toEqual(['rocks', 'zap']);
        expect(examples[0]?.earlierPrompt).toBe(false);
    });

    it('marks a run made with an older prompt', () => {
        expect(parseExamples({ [PATH]: ROCKS }, '1.10.0')[0]?.earlierPrompt).toBe(true);
    });

    it('rejects a file name that is not a kebab-case slug', () => {
        expect(() => parseExamples({ '../examples/Rocks Game.json': ROCKS }, '1.9.2')).toThrow(/kebab-case/u);
    });

    it('rejects metadata with a bad fill, a missing field, or an extra one', () => {
        expect(() => parseExamples({ [PATH]: { ...ROCKS, fill: 'red;x' } }, '1.9.2')).toThrow(/fill/u);
        expect(() => parseExamples({ [PATH]: { ...ROCKS, model: undefined } }, '1.9.2')).toThrow(/model/u);
        expect(() => parseExamples({ [PATH]: { ...ROCKS, edited: true } }, '1.9.2')).toThrow(/edited/u);
        expect(() => parseExamples({ [PATH]: { ...ROCKS, promptCommit: 'main' } }, '1.9.2')).toThrow(/promptCommit/u);
    });
});

describe('caption', () => {
    it('names the app, plan and model', () => {
        const [example] = parseExamples({ [PATH]: ROCKS }, '1.9.2');

        expect(example?.caption).toBe('made in ChatGPT (free plan, GPT-5) from the prompt below, first try, unedited');
    });

    it('says so when the prompt has changed since the run', () => {
        const [example] = parseExamples({ [PATH]: ROCKS }, '1.10.0');

        expect(example?.caption).toContain('from an earlier version of the prompt below');
    });
});

describe('HOME_EXAMPLES', () => {
    it('loads the committed examples without throwing', () => {
        expect(Array.isArray(HOME_EXAMPLES)).toBe(true);
    });
});
