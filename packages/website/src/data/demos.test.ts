/**
 * Guards `flagshipDemos` against the demos it describes: every title and description is a hand copy of
 * the demo's own header, and three of twelve had drifted before this test existed (BT-772).
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../../../demos/plugins/demo-registry.js';
import { flagshipDemos } from './demos';

const DEMOS_ROOT = fileURLToPath(new URL('../../../demos', import.meta.url));
const DEMOS_ORIGIN = 'https://demos.blit386.dev/';

const registry = buildRegistry(DEMOS_ROOT);

describe('flagshipDemos', () => {
    it.each(flagshipDemos.map((demo) => [demo.href, demo] as const))('%s matches its demo header', (href, demo) => {
        const slug = href.slice(DEMOS_ORIGIN.length);
        const entry = registry.find((candidate) => candidate.slug === slug);

        expect(href.startsWith(DEMOS_ORIGIN)).toBe(true);
        expect(entry).toBeDefined();
        expect({ title: demo.title, description: demo.description }).toEqual({
            title: entry?.navLabel,
            description: entry?.description,
        });
    });
});
