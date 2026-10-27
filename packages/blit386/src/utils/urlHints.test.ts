/**
 * Unit tests for {@link extractExtension}.
 */

import { describe, expect, it } from 'vitest';

import { extractExtension } from './urlHints';

describe('extractExtension', () => {
    it('should return the lowercase extension with its dot', () => {
        expect(extractExtension('images/Hero.PNG')).toBe('.png');
    });

    it('should return an empty string when there is no extension', () => {
        expect(extractExtension('images/hero')).toBe('');
    });

    it('should ignore a query string, even one containing a slash', () => {
        expect(extractExtension('a.png?v=x/y')).toBe('.png');
    });

    it('should ignore a fragment', () => {
        expect(extractExtension('a.png#frag/x')).toBe('.png');
    });
});
