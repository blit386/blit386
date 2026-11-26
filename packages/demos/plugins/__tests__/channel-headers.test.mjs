/**
 * Unit tests for the pure `robots.txt` / `_headers` builders behind `channelHeadersPlugin`.
 * Pure and exported so they can be unit-tested without touching disk.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildNoindexHeadersBlock, buildRobotsTxt } from '../channel-headers.js';
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

describe('buildNoindexHeadersBlock', () => {
    it('carries the X-Robots-Tag: noindex directive for every path', () => {
        const block = buildNoindexHeadersBlock();

        assert.ok(block.includes('/*'));
        assert.ok(block.includes('X-Robots-Tag: noindex'));
    });
});
