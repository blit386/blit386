/**
 * Covers `src/home-markdown.ts`: the homepage markdown (llms.txt, markdown negotiation, the MCP server) must carry one
 * h1 and the prompt fence without a trailing blank line.
 */

import { describe, expect, it } from 'vitest';
import { rewriteForMarkdown } from './home-markdown';

describe('rewriteForMarkdown', () => {
    it('demotes the headline to an h2 without touching the original', () => {
        const heading = { type: 'heading', depth: 1, children: [] };

        expect(rewriteForMarkdown(heading)).toEqual({ type: 'heading', depth: 2, children: [] });
        expect(heading.depth).toBe(1);
    });

    it("trims one final newline from the included prompt's code block", () => {
        expect(rewriteForMarkdown({ type: 'code', value: 'line\n\n' }).value).toBe('line\n');
    });

    it('leaves other nodes as they are', () => {
        const nodes = [{ type: 'heading', depth: 2 }, { type: 'paragraph' }, { type: 'code', value: 'x' }];

        expect(nodes.map(rewriteForMarkdown)).toEqual(nodes);
    });
});
