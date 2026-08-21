/**
 * Covers `src/csp.ts`, and – more importantly – guards the one copy of the policy that TypeScript
 * cannot see: the `Content-Security-Policy` line in `public/_headers`.
 *
 * That file is a static Cloudflare config with no import mechanism, so its CSP has to be a
 * hand-written duplicate of `BASE_CSP`. "Drift guard" below is what keeps the duplicate honest; it
 * fails the moment either side is edited alone.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_CSP, buildCsp, generateNonce, isHtmlAssetPath } from './csp';

const HEADERS_FILE = new URL('../public/_headers', import.meta.url);
const NONCE = 'AbCdEfGhIjKlMnOpQrStUw==';

/** The `script-src` directive alone, from a serialized policy. */
function scriptSrc(policy: string): string {
    const directive = policy.split('; ').find((entry) => entry.startsWith('script-src '));
    if (directive === undefined) {
        throw new Error(`no script-src in policy: ${policy}`);
    }

    return directive;
}

/** The CSP value `public/_headers` serves under its `/*` rule. */
function headersFileCsp(): string {
    const line = readFileSync(HEADERS_FILE, 'utf8')
        .split('\n')
        .find((entry) => entry.trimStart().startsWith('Content-Security-Policy:'));

    if (line === undefined) {
        throw new Error('public/_headers declares no Content-Security-Policy');
    }

    return line.trim().slice('Content-Security-Policy:'.length).trim();
}

describe('buildCsp', () => {
    it('allows no inline scripts in the base policy', () => {
        expect(scriptSrc(BASE_CSP)).toBe("script-src 'self' https://plausible.io");
    });

    it('adds the nonce to script-src and changes nothing else', () => {
        const withNonce = buildCsp(NONCE);

        expect(scriptSrc(withNonce)).toBe(`script-src 'self' 'nonce-${NONCE}' https://plausible.io`);
        expect(withNonce.replace(` 'nonce-${NONCE}'`, '')).toBe(BASE_CSP);
    });

    it('never emits unsafe-inline for scripts, with or without a nonce', () => {
        expect(scriptSrc(BASE_CSP)).not.toContain("'unsafe-inline'");
        expect(scriptSrc(buildCsp(NONCE))).not.toContain("'unsafe-inline'");
    });

    it('keeps the directives the blog media and demo embeds depend on', () => {
        // CLAUDE.md, "Blog media": these were once 'none' and blocked playback outright.
        expect(BASE_CSP).toContain("media-src 'self'");
        expect(BASE_CSP).toContain('frame-src');
        expect(BASE_CSP).toContain('https://demos.blit386.dev');
    });
});

describe('drift guard', () => {
    it('serves exactly BASE_CSP from public/_headers', () => {
        expect(headersFileCsp()).toBe(BASE_CSP);
    });

    it('has no unsafe-inline in the script-src that public/_headers actually ships', () => {
        // Asserted against the file rather than the builder, so a hand edit cannot slip through
        // even if BASE_CSP were changed to match it.
        expect(scriptSrc(headersFileCsp())).not.toContain("'unsafe-inline'");
    });
});

describe('generateNonce', () => {
    it('returns at least 128 bits of base64', () => {
        expect(atob(generateNonce())).toHaveLength(16);
    });

    it('returns a different value every call', () => {
        const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));

        expect(nonces.size).toBe(100);
    });

    it('produces a nonce that needs no CSP quoting', () => {
        // A base64 nonce can contain `+`, `/`, and `=`, all legal in a CSP source expression;
        // anything outside that set would need escaping the header format does not offer.
        expect(generateNonce()).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    });
});

describe('isHtmlAssetPath', () => {
    it.each(['/', '/docs', '/docs/getting-started', '/blog/hot-reload-release-1-4-0', '/index.html', '/showcase'])(
        'treats %s as HTML',
        (pathname) => {
            expect(isHtmlAssetPath(pathname)).toBe(true);
        },
    );

    it.each([
        '/assets/entry-BujZVH9j.js',
        '/assets/style-abc123.css',
        '/fonts/DepartureMono-Regular.woff2',
        '/media/blog/hot-reload-release-1-4-0/clip.mp4',
        '/llms.txt',
        '/sitemap.xml',
        '/feed.xml',
        '/docs/getting-started.md',
        '/favicon.ico',
    ])('treats %s as a non-HTML asset', (pathname) => {
        expect(isHtmlAssetPath(pathname)).toBe(false);
    });

    it('errs toward HTML for an extensionless non-HTML route', () => {
        // /.well-known/api-catalog is JSON but has no extension to go on. Erring this way costs it
        // its 304s and nothing else; erring the other way would risk a stale body against a fresh
        // nonce, which is a blank page.
        expect(isHtmlAssetPath('/.well-known/api-catalog')).toBe(true);
    });

    it('ignores a dot in an earlier segment', () => {
        expect(isHtmlAssetPath('/.well-known/agent-skills/blit386')).toBe(true);
    });

    it('is case-insensitive about the extension', () => {
        expect(isHtmlAssetPath('/logo.PNG')).toBe(false);
    });
});
