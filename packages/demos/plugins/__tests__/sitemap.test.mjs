/**
 * Unit tests for the pure sitemap XML builder behind `sitemapPlugin`. Pure and exported so it
 * can be unit-tested without touching disk.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSitemapXml, SITE_URL } from '../sitemap.js';

describe('buildSitemapXml', () => {
    it('emits only the root URL for an empty registry', () => {
        const xml = buildSitemapXml([], SITE_URL);

        assert.equal((xml.match(/<url>/g) ?? []).length, 1);
        assert.ok(xml.includes(`<loc>${SITE_URL}/</loc>`));
    });

    it('emits one <url> per demo, in registry order, plus the root', () => {
        const registry = [{ slug: 'basics' }, { slug: 'palette-cycling' }];
        const xml = buildSitemapXml(registry, SITE_URL);

        assert.equal((xml.match(/<url>/g) ?? []).length, 3);
        const rootIndex = xml.indexOf(`<loc>${SITE_URL}/</loc>`);
        const basicsIndex = xml.indexOf(`<loc>${SITE_URL}/basics</loc>`);
        const paletteIndex = xml.indexOf(`<loc>${SITE_URL}/palette-cycling</loc>`);

        assert.ok(rootIndex >= 0 && basicsIndex >= 0 && paletteIndex >= 0);
        assert.ok(rootIndex < basicsIndex, 'root URL must come first');
        assert.ok(basicsIndex < paletteIndex, 'demos must stay in registry order');
    });

    it('builds extensionless URLs from the given site origin', () => {
        const xml = buildSitemapXml([{ slug: 'basics' }], 'https://next.demos.blit386.dev');

        assert.ok(xml.includes('<loc>https://next.demos.blit386.dev/basics</loc>'));
        assert.ok(!xml.includes('.html'));
    });

    it('produces a well-formed sitemap document', () => {
        const xml = buildSitemapXml([{ slug: 'basics' }], SITE_URL);

        assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
        assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
        assert.equal((xml.match(/<\/url>/g) ?? []).length, 2);
        assert.ok(xml.trim().endsWith('</urlset>'));
    });
});
