import { describe, expect, it } from 'vitest';

import { resolveOverlayTopLeftLabel } from './labels';

describe('resolveOverlayTopLeftLabel', () => {
    it('formats registry-style page titles without a BLIT386 prefix', () => {
        expect(resolveOverlayTopLeftLabel('BLIT386 Demo 006 - Patterns')).toBe('Patterns Demo');
        expect(resolveOverlayTopLeftLabel('BLIT386 Demo 002 - Primitives')).toBe('Primitives Demo');
    });

    it('falls back when title is empty', () => {
        expect(resolveOverlayTopLeftLabel('')).toBe('Demo');
        expect(resolveOverlayTopLeftLabel(undefined)).toBe('Demo');
    });

    it('passes through non-registry titles unchanged', () => {
        expect(resolveOverlayTopLeftLabel('Custom Page')).toBe('Custom Page');
    });
});
