/**
 * Covers `src/data/chat-prompt.ts`: cutting the prompt around its idea line and putting a visitor's idea back in.
 * The real `public/prompt.txt` is checked too, since the homepage cannot show an editable idea without that line.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAT_PROMPT, CHAT_PROMPT_TEXT, splitPrompt, withIdea } from './chat-prompt';

const IDEA_LINE = 'My game idea: [describe your game in a sentence or two]';
const SAMPLE = `Intro line.\n\n${IDEA_LINE}\n\nRule one.\nRule two.\n`;

describe('splitPrompt', () => {
    it('cuts around the idea line and counts the lines after it', () => {
        const prompt = splitPrompt(SAMPLE);

        expect(prompt.head).toBe('Intro line.\n\n');
        expect(prompt.tail).toBe('\n\nRule one.\nRule two.\n');
        expect(prompt.tailLineCount).toBe(3);
    });

    it('throws when the idea line is missing', () => {
        expect(() => splitPrompt('Intro line.\nMy game idea: something else\n')).toThrow(/exactly once/u);
    });

    it('throws when the idea line appears twice', () => {
        expect(() => splitPrompt(`${IDEA_LINE}\n${IDEA_LINE}\n`)).toThrow(/exactly once/u);
    });
});

describe('withIdea', () => {
    const prompt = splitPrompt(SAMPLE);

    it('swaps the idea in and leaves every other byte alone', () => {
        expect(withIdea(prompt, '  asteroids, but the rocks split  ')).toBe(
            SAMPLE.replace(IDEA_LINE, 'My game idea: asteroids, but the rocks split'),
        );
    });

    it('keeps the file text for a blank idea', () => {
        expect(withIdea(prompt, '   ')).toBe(SAMPLE);
    });
});

describe('public/prompt.txt', () => {
    it('is the text the page reads, byte for byte', () => {
        expect(CHAT_PROMPT_TEXT).toBe(readFileSync(new URL('../../public/prompt.txt', import.meta.url), 'utf8'));
        expect(withIdea(CHAT_PROMPT, '')).toBe(CHAT_PROMPT_TEXT);
    });
});
