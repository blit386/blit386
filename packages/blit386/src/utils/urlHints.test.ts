/**
 * Unit tests for {@link extractExtension}.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCorsImageHint, extractExtension } from './urlHints';

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

describe('buildCorsImageHint', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should hint at CORS for an image on another site', () => {
        expect(buildCorsImageHint('https://cdn.example.com/sheet.png')).toMatch(/another site.*CORS/);
    });

    it("should not hint for an image on the page's own site", () => {
        expect(buildCorsImageHint('/sprites/sheet.png')).toBe('');
    });

    it('should not hint for data: and blob: URLs, which never need CORS', () => {
        expect(buildCorsImageHint('data:image/png;base64,AAAA')).toBe('');
        expect(buildCorsImageHint('blob:http://localhost/1234')).toBe('');
    });

    it('should return no hint instead of throwing for a URL that does not parse', () => {
        expect(buildCorsImageHint('http://')).toBe('');
        expect(buildCorsImageHint('http://localhost:99999/sheet.png')).toBe('');
    });

    it('should explain the missing origin on a page opened from a file or a sandboxed frame', () => {
        vi.stubGlobal('origin', 'null');

        expect(buildCorsImageHint('./sheet.png')).toMatch(/no web address of its own.*local web server/);
    });
});
