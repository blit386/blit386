/**
 * Unit tests for {@link resolveDtsRollupTypes}.
 *
 * Guards the BT-426 fix: `vite build --watch` must never enable api-extractor's
 * declaration rollup, since it crashes intermittently mid-watch-rebuild. Only the
 * final, non-watch production build may roll up `dist/blit386.d.ts`.
 */

import { describe, expect, it } from 'vitest';

import { resolveDtsRollupTypes } from './vite.config';

describe('resolveDtsRollupTypes', () => {
    it('disables rollupTypes when --watch is present', () => {
        expect(resolveDtsRollupTypes(['vite', 'build', '--watch'])).toBe(false);
    });

    it('enables rollupTypes for a normal production build', () => {
        expect(resolveDtsRollupTypes(['vite', 'build'])).toBe(true);
    });

    it('enables rollupTypes when argv is empty', () => {
        expect(resolveDtsRollupTypes([])).toBe(true);
    });

    it('disables rollupTypes regardless of --watch position in argv', () => {
        expect(resolveDtsRollupTypes(['--watch', 'vite', 'build'])).toBe(false);
    });
});
