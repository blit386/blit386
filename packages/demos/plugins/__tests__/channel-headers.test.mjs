/**
 * Unit tests for the pure `robots.txt` / `_headers` builders behind `channelHeadersPlugin`.
 * Pure and exported so they can be unit-tested without touching disk.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { addNoindexHeader, buildRobotsTxt } from '../channel-headers.js';
import { SITE_URL } from '../sitemap.js';

describe('buildRobotsTxt', () => {
    it('disallows everything on the next channel', () => {
        const robotsTxt = buildRobotsTxt(true, SITE_URL);

        assert.equal(robotsTxt, 'User-agent: *\nDisallow: /\n');
        assert.ok(!robotsTxt.includes('Sitemap:'));
    });

    it('allows everything and points at the sitemap in production', () => {
        const robotsTxt = buildRobotsTxt(false, SITE_URL);

        assert.ok(robotsTxt.includes('Allow: /'));
        assert.ok(robotsTxt.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
        assert.ok(!robotsTxt.includes('Disallow:'));
    });
});

describe('addNoindexHeader', () => {
    const headers =
        "# comment\n\n/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src 'self'\n\n/examples/*\n  Content-Security-Policy: default-src 'none'\n";

    it('adds noindex inside the existing /* block instead of a second /* block', () => {
        const result = addNoindexHeader(headers);

        assert.equal(result.match(/^\/\*$/gm)?.length, 1);
        assert.ok(
            result.includes(
                "/*\n  X-Robots-Tag: noindex\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src 'self'\n",
            ),
        );
    });

    it('keeps every other rule intact', () => {
        assert.equal(addNoindexHeader(headers).replace('  X-Robots-Tag: noindex\n', ''), headers);
    });

    it('throws when there is no /* block to extend', () => {
        assert.throws(() => addNoindexHeader('/examples/*\n  X-Frame-Options: DENY\n'), /\/\*/);
    });

    it('puts noindex in the same rule as the CSP in the real public/_headers', () => {
        const result = addNoindexHeader(readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8'));
        const catchAllRule = result.split(/\n(?=\S)/).find((rule) => rule.startsWith('/*\n'));

        assert.equal(result.match(/^\/\*$/gm)?.length, 1);
        assert.ok(catchAllRule?.includes('  X-Robots-Tag: noindex\n'));
        assert.ok(catchAllRule?.includes('  Content-Security-Policy: '));
        assert.ok(catchAllRule?.includes('  Permissions-Policy: '));
    });
});
