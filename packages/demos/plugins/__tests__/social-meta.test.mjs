/**
 * Unit tests for the social/SEO head block builder.
 *
 * `buildSocialMeta` is pure (no fs, no process.env – channel state is passed in), so every
 * case here is a plain string assertion.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NEXT_SITE_URL, SITE_URL } from '../sitemap.js';
import { buildSocialMeta, OG_IMAGE_FALLBACK, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '../social-meta.js';

const ENTRY = {
    slug: 'palette-cycling',
    title: 'BLIT386 Demo - Palette Cycling',
    navLabel: 'Palette Cycling',
    description: 'Classic retro color rotation with BT.paletteCycle: rotate palette slots to make a still image flow.',
};

/**
 * Count non-overlapping occurrences of a literal needle.
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function occurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

/**
 * Pull the JSON-LD payload out of a rendered head block.
 * @param {string} html
 * @returns {object}
 */
function parseJsonLd(html) {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(match, 'expected exactly one ld+json script');
    return JSON.parse(match[1]);
}

describe('buildSocialMeta', () => {
    it('emits every required tag exactly once', () => {
        const html = buildSocialMeta({ entry: ENTRY, hasOgImage: true });

        for (const needle of [
            '<meta name="description"',
            '<link rel="canonical"',
            'property="og:type"',
            'property="og:site_name"',
            'property="og:title"',
            'property="og:description"',
            'property="og:url"',
            'property="og:image"',
            'name="twitter:card"',
            'name="twitter:title"',
            'name="twitter:description"',
            'name="twitter:image"',
        ]) {
            assert.equal(occurrences(html, needle), 1, `expected exactly one ${needle}`);
        }

        assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
        assert.match(html, /<meta property="og:type" content="website">/);
        // Two icon links: the SVG with its light/dark variants, plus a raster fallback.
        assert.equal(occurrences(html, '<link rel="icon"'), 2);
    });

    it('escapes HTML-significant characters in the title and description', () => {
        const html = buildSocialMeta({
            entry: { ...ENTRY, title: 'Tom & "Jerry" <b>', description: 'It\'s <em>bold</em> & "quoted" prose here.' },
            hasOgImage: true,
        });

        assert.match(html, /content="Tom &amp; &quot;Jerry&quot; &lt;b&gt;"/);
        assert.match(html, /&#39;s &lt;em&gt;bold&lt;\/em&gt; &amp; &quot;quoted&quot;/);

        // No raw markup may survive into any content= attribute. The JSON-LD block is exempt
        // and checked separately below – escaping it would break every parser.
        const attributeValues = [...html.matchAll(/content="([^"]*)"/g)].map((match) => match[1]);
        assert.ok(attributeValues.length > 0);

        for (const value of attributeValues) {
            assert.ok(!/[<>&](?!(?:amp|lt|gt|quot|#39);)/.test(value), `unescaped character in: ${value}`);
        }
    });

    it('leaves the JSON-LD payload unescaped, as JSON parsers require', () => {
        const html = buildSocialMeta({
            entry: { ...ENTRY, title: 'Tom & "Jerry"', description: 'Angle < bracket > prose.' },
            hasOgImage: true,
        });
        const jsonLd = parseJsonLd(html);

        // Round-trips to the original text: no &amp; / &quot; anywhere inside the script body.
        assert.equal(jsonLd.name, 'Tom & "Jerry"');
        assert.equal(jsonLd.description, 'Angle < bracket > prose.');
    });

    it('passes a description containing $& and $1 through verbatim', () => {
        // Guards the contract with renderHtml, which substitutes {{socialMeta}} using a function
        // replacer precisely so these sequences are never interpreted.
        const description = 'Regex-ish text with $& and $1 and $` inside it, kept exactly as written.';
        const html = buildSocialMeta({ entry: { ...ENTRY, description }, hasOgImage: true });

        assert.ok(html.includes(description));
    });

    it('makes canonical and og:url identical, absolute, and extensionless', () => {
        const html = buildSocialMeta({ entry: ENTRY, hasOgImage: true });
        const expected = `${SITE_URL}/${ENTRY.slug}`;

        assert.ok(html.includes(`<link rel="canonical" href="${expected}">`));
        assert.ok(html.includes(`<meta property="og:url" content="${expected}">`));
        assert.ok(!html.includes('/demos/'), 'must not use the dev-only /demos/ path');
        assert.ok(!html.includes('.html'), 'must not use the dev-only .html suffix');
    });

    it('self-references the next origin on the next channel', () => {
        const html = buildSocialMeta({ entry: ENTRY, isNextChannel: true, hasOgImage: true });

        assert.ok(html.includes(`<link rel="canonical" href="${NEXT_SITE_URL}/${ENTRY.slug}">`));
        assert.ok(html.includes(`<meta property="og:url" content="${NEXT_SITE_URL}/${ENTRY.slug}">`));
        assert.ok(html.includes(`${NEXT_SITE_URL}/social/og-${ENTRY.slug}.png`));

        // Nothing may still advertise the production host. Strip the next origin first, since
        // it contains the production host as a substring.
        assert.ok(!html.replaceAll(NEXT_SITE_URL, '').includes(SITE_URL));
    });

    it('omits every description tag when the entry has none', () => {
        const html = buildSocialMeta({ entry: { ...ENTRY, description: '' }, hasOgImage: true });

        assert.ok(!html.includes('name="description"'));
        assert.ok(!html.includes('og:description'));
        assert.ok(!html.includes('twitter:description'));
        assert.ok(!html.includes('content=""'), 'must not emit an empty content attribute');
        assert.equal(parseJsonLd(html).description, undefined);
    });

    it('emits parseable JSON-LD naming the page', () => {
        const jsonLd = parseJsonLd(buildSocialMeta({ entry: ENTRY, hasOgImage: true }));

        assert.equal(jsonLd['@context'], 'https://schema.org');
        assert.equal(jsonLd['@type'], 'SoftwareApplication');
        assert.equal(jsonLd.name, ENTRY.title);
        assert.equal(jsonLd.url, `${SITE_URL}/${ENTRY.slug}`);
        assert.equal(jsonLd.description, ENTRY.description);
    });

    it('prevents a description from closing the JSON-LD script element', () => {
        const description = 'Sneaky </script><img src=x> payload that must never break out of the block.';
        const html = buildSocialMeta({ entry: { ...ENTRY, description }, hasOgImage: true });

        // Exactly one closing tag: the real one ending the ld+json block.
        assert.equal(occurrences(html, '</script>'), 1);
        assert.equal(parseJsonLd(html).description, description);
    });

    it('falls back to the shared card when the demo has no OG image', () => {
        const withImage = buildSocialMeta({ entry: ENTRY, hasOgImage: true });
        const withoutImage = buildSocialMeta({ entry: ENTRY, hasOgImage: false });

        assert.ok(withImage.includes(`${SITE_URL}/social/og-${ENTRY.slug}.png`));
        assert.ok(withoutImage.includes(`${SITE_URL}/social/${OG_IMAGE_FALLBACK}`));
        assert.ok(!withoutImage.includes(`og-${ENTRY.slug}.png`));
    });

    it('builds the image alt from the title, so a branded navLabel cannot garble it', () => {
        // navLabel keeps its "BLIT386 Demo – " prefix on the four demos with a @pageTitle
        // override (BT-465). Deriving alt text from it would read "The BLIT386 Demo – PipBoy
        // CRT demo running in BLIT386."
        const html = buildSocialMeta({
            entry: { ...ENTRY, title: 'BLIT386 Demo – PipBoy CRT', navLabel: 'BLIT386 Demo – PipBoy CRT' },
            hasOgImage: true,
        });

        assert.ok(html.includes('content="Screenshot of BLIT386 Demo – PipBoy CRT."'));
        assert.ok(!html.includes('demo running in BLIT386'));
    });

    it('leaves no unsubstituted template placeholder behind', () => {
        assert.ok(!buildSocialMeta({ entry: ENTRY, hasOgImage: true }).includes('{{'));
    });

    it('keeps the declared image dimensions in step with the exported constants', () => {
        const html = buildSocialMeta({ entry: ENTRY, hasOgImage: true });

        assert.ok(html.includes(`<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`));
        assert.ok(html.includes(`<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`));
        assert.equal(OG_IMAGE_WIDTH, 1200);
        assert.equal(OG_IMAGE_HEIGHT, 630);
    });
});
