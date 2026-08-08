/**
 * Builds the social/SEO head block rendered into every demo page: meta description, canonical
 * link, favicon links, OpenGraph, Twitter card, and JSON-LD.
 *
 * Kept out of `virtual-demos.js` so it stays a pure function – no fs, no `process.env`, channel
 * state passed in – and can be unit-tested directly (plugins/__tests__/social-meta.test.mjs).
 */
import { escapeHtml } from './html-escape.js';
import { NEXT_SITE_URL, SITE_URL } from './sitemap.js';

// Card geometry. Exported so scripts/capture-og-image.mjs renders exactly what these tags
// promise – a crawler that fetches a differently-sized image renders a worse card.
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

// Directory under public/ (copied verbatim into dist/ by Vite's publicDir handling) and the
// shared card used for any demo without its own capture yet, so og:image is never a 404.
export const OG_IMAGE_DIR = 'social';
export const OG_IMAGE_FALLBACK = 'og-default.png';

/**
 * How `scripts/capture-og-image.mjs` fits a demo's canvas onto the card.
 *
 * - `auto` – integer when it already fills most of the card, otherwise fit. The default, and
 *   right for nearly every demo.
 * - `integer` – scale by a whole number only. Every source pixel becomes an identical square
 *   block, at the cost of black bars when no whole factor comes close to filling the card.
 * - `fit` – scale to fill the card height, accepting uneven pixel widths.
 *
 * A demo overrides the default with an `@ogScale <mode>` header tag, the same way `@pageTitle`
 * and `@description` work. Lives here beside the card geometry because it describes the card,
 * not the registry that happens to parse the tag.
 */
export const OG_SCALE_MODES = new Set(['auto', 'integer', 'fit']);
export const OG_SCALE_DEFAULT = 'auto';

// In `auto`, use the integer factor when it covers at least this share of the card's height.
// A 320x200 canvas scales 3x to 600 of 630 (95%) and stays perfectly crisp; a 320x240 canvas
// manages only 2x to 480 (76%) and is better served filling the frame.
export const OG_AUTO_FILL_THRESHOLD = 0.9;

const SITE_NAME = 'BLIT386 Demos';
const TWITTER_HANDLE = '@blit386';
const AUTHOR_NAME = 'Václav Vančura';
const AUTHOR_URL = 'https://github.com/vancura';

/**
 * Build the full social/SEO head block for one demo page.
 * @param {object} options
 * @param {{slug: string, title: string, navLabel: string, description: string}} options.entry –
 *   A registry entry, passed **raw**: this function owns all escaping. Handing it
 *   already-escaped text would double-encode every ampersand.
 * @param {boolean} [options.isNextChannel] – True on next.demos.blit386.dev.
 * @param {boolean} [options.hasOgImage] – True when public/social/og-<slug>.png exists.
 * @returns {string} An HTML fragment for <head>, indented to match _partials/layout.html.
 */
export function buildSocialMeta({ entry, isNextChannel = false, hasOgImage = false }) {
    // Self-reference the channel's own origin. Pointing next's canonical at production would
    // contradict the noindex meta tag, the X-Robots-Tag header, and the disallow-all robots.txt
    // that channel already ships (see channel-headers.js).
    const origin = isNextChannel ? NEXT_SITE_URL : SITE_URL;

    // Every URL below is absolute, and that is load-bearing rather than stylistic. Vite rewrites
    // `og:image` and `twitter:image` like any other asset reference, and with `base: './'` a
    // root-absolute path becomes `../social/...` for a page built at demos/<slug>.html – which
    // flattenDemosPlugin then moves to dist/ root, leaving the path pointing outside dist/.
    // Absolute https:// URLs are skipped as external, so they survive both untouched.
    const pageUrl = `${origin}/${entry.slug}`;
    const imageFile = hasOgImage ? `og-${entry.slug}.png` : OG_IMAGE_FALLBACK;
    const imageUrl = `${origin}/${OG_IMAGE_DIR}/${imageFile}`;

    const title = escapeHtml(entry.title);
    const description = entry.description === '' ? '' : escapeHtml(entry.description);
    const imageAlt = escapeHtml(`The ${entry.navLabel} demo running in BLIT386.`);

    const lines = [];

    if (description !== '') {
        lines.push(`<meta name="description" content="${description}">`);
    }

    lines.push(
        `<link rel="canonical" href="${pageUrl}">`,
        '',
        // `vite-ignore` keeps Vite's HTML asset pipeline off these two links. Without it a
        // root-absolute public-dir path is rewritten to `../favicon.svg` for the pre-flatten
        // demos/<slug>.html location, which 404s in production while still working in dev.
        '<link rel="icon" href="/favicon.svg" type="image/svg+xml" vite-ignore>',
        '<link rel="icon" href="/sprites/favicon-light-32.png" sizes="32x32" type="image/png" vite-ignore>',
        '',
        '<meta property="og:type" content="website">',
        `<meta property="og:site_name" content="${SITE_NAME}">`,
        '<meta property="og:locale" content="en_US">',
        `<meta property="og:title" content="${title}">`,
    );

    if (description !== '') {
        lines.push(`<meta property="og:description" content="${description}">`);
    }

    lines.push(
        `<meta property="og:url" content="${pageUrl}">`,
        `<meta property="og:image" content="${imageUrl}">`,
        '<meta property="og:image:type" content="image/png">',
        `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`,
        `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`,
        `<meta property="og:image:alt" content="${imageAlt}">`,
        '',
        '<meta name="twitter:card" content="summary_large_image">',
        `<meta name="twitter:site" content="${TWITTER_HANDLE}">`,
        `<meta name="twitter:title" content="${title}">`,
    );

    if (description !== '') {
        lines.push(`<meta name="twitter:description" content="${description}">`);
    }

    lines.push(
        `<meta name="twitter:image" content="${imageUrl}">`,
        `<meta name="twitter:image:alt" content="${imageAlt}">`,
        '',
        `<script type="application/ld+json">${buildJsonLd({ entry, origin, pageUrl, imageUrl })}</script>`,
    );

    // Indent continuation lines to the four spaces layout.html uses inside <head>; the first
    // line inherits the placeholder's own indentation.
    return lines.join('\n').replaceAll('\n', '\n    ').trimEnd();
}

/**
 * Build the JSON-LD payload for a demo page.
 *
 * `SoftwareApplication` rather than the website's `TechArticle`: a demo page is a running,
 * interactive WebGPU program, not an article about one.
 *
 * Google's software-app rich result additionally wants `aggregateRating` or `review`, and this
 * project has neither. That is deliberate – do not invent ratings to unlock the card. The markup
 * stays valid and other consumers still read it; only Google's rich result is forfeited.
 * @param {object} options
 * @param {{title: string, description: string}} options.entry – Raw registry entry.
 * @param {string} options.origin – Channel origin, no trailing slash.
 * @param {string} options.pageUrl – Absolute canonical URL for this demo.
 * @param {string} options.imageUrl – Absolute URL of the demo's OG card.
 * @returns {string} JSON, safe to inline inside a <script> element.
 */
function buildJsonLd({ entry, origin, pageUrl, imageUrl }) {
    const payload = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: entry.title,
        ...(entry.description === '' ? {} : { description: entry.description }),
        url: pageUrl,
        image: imageUrl,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires WebGPU',
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: origin },
        author: { '@type': 'Person', name: AUTHOR_NAME, url: AUTHOR_URL },
        // The demos are free, and `offers` is one of the properties Google looks for.
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    };

    // `<\/` is a valid JSON string escape, so parsers still read the original text while no
    // field value – all of it human-written prose – can terminate the script element early.
    return JSON.stringify(payload).replaceAll('</', '<\\/');
}
