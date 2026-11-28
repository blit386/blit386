/**
 * Covers `src/data/prompt-copy.ts`: the copy reaches the clipboard, the Plausible event follows only a successful
 * copy, a missing or broken Plausible never breaks the copy, and the `idea` property matches what was copied.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    copyPrompt,
    IDEA_EDITED,
    IDEA_EXAMPLE,
    IDEA_PLACEHOLDER,
    ideaSource,
    PROMPT_COPY_EVENT,
    trackPromptCopy,
} from './prompt-copy';

function stubClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    return writeText;
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('ideaSource', () => {
    it('is edited once the visitor typed something', () => {
        expect(ideaSource('A frog game', 'An example')).toBe(IDEA_EDITED);
        expect(ideaSource('A frog game', undefined)).toBe(IDEA_EDITED);
    });

    it('is the example when the field is blank and an example is shown', () => {
        expect(ideaSource('  ', 'An example')).toBe(IDEA_EXAMPLE);
    });

    it('is the placeholder when the field is blank and there is no example', () => {
        expect(ideaSource('', undefined)).toBe(IDEA_PLACEHOLDER);
    });
});

describe('trackPromptCopy', () => {
    it('sends the event with the idea source', () => {
        const plausible = vi.fn();
        vi.stubGlobal('window', { plausible });

        trackPromptCopy(IDEA_PLACEHOLDER);

        expect(plausible).toHaveBeenCalledExactlyOnceWith(PROMPT_COPY_EVENT, { props: { idea: IDEA_PLACEHOLDER } });
    });

    it('does nothing when window.plausible is undefined', () => {
        vi.stubGlobal('window', {});

        expect(() => trackPromptCopy(IDEA_EDITED)).not.toThrow();
    });

    it('warns instead of throwing when Plausible throws', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.stubGlobal('window', {
            plausible: () => {
                throw new Error('broken');
            },
        });

        expect(() => trackPromptCopy(IDEA_EDITED)).not.toThrow();
        expect(warn).toHaveBeenCalledOnce();
    });
});

describe('copyPrompt', () => {
    it('copies the text, then sends the event with idea=edited', async () => {
        const writeText = stubClipboard();
        const plausible = vi.fn();
        vi.stubGlobal('window', { plausible });

        await copyPrompt('the prompt', IDEA_EDITED);

        expect(writeText).toHaveBeenCalledWith('the prompt');
        expect(plausible).toHaveBeenCalledExactlyOnceWith(PROMPT_COPY_EVENT, { props: { idea: IDEA_EDITED } });
    });

    it('sends idea=example when the visitor kept the example idea', async () => {
        stubClipboard();
        const plausible = vi.fn();
        vi.stubGlobal('window', { plausible });

        await copyPrompt('the prompt', IDEA_EXAMPLE);

        expect(plausible).toHaveBeenCalledExactlyOnceWith(PROMPT_COPY_EVENT, { props: { idea: IDEA_EXAMPLE } });
    });

    it('still copies when window.plausible is undefined', async () => {
        const writeText = stubClipboard();
        vi.stubGlobal('window', {});

        await expect(copyPrompt('the prompt', IDEA_EDITED)).resolves.toBeUndefined();
        expect(writeText).toHaveBeenCalledWith('the prompt');
    });

    it('still resolves when Plausible throws', async () => {
        stubClipboard();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.stubGlobal('window', {
            plausible: () => {
                throw new Error('broken');
            },
        });

        await expect(copyPrompt('the prompt', IDEA_EDITED)).resolves.toBeUndefined();
    });

    it('sends nothing when the clipboard write fails', async () => {
        stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
        const plausible = vi.fn();
        vi.stubGlobal('window', { plausible });

        await expect(copyPrompt('the prompt', IDEA_EDITED)).rejects.toThrow('denied');
        expect(plausible).not.toHaveBeenCalled();
    });
});
