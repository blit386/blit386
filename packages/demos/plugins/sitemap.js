import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRegistry } from './demo-registry.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');

// Mirrors package.json's "homepage" field - the canonical production origin. Also consumed by
// channel-headers.js to point production's robots.txt at this file.
export const SITE_URL = 'https://demos.blit386.dev';

// The BLIT386_CHANNEL=next preview origin (Cloudflare Pages project `blit386-demos-next`, see
// .github/workflows/deploy.yml). Kept beside SITE_URL so exactly one module knows the demo
// origins; `social-meta.js` picks between them so the next channel never advertises production
// URLs in its canonical, og:url, or og:image tags.
export const NEXT_SITE_URL = 'https://next.demos.blit386.dev';

// True on that preview channel: BLIT386_CHANNEL=next is set only in the deploy-demos-next CI job.
// Read in Node at build time, so no client-side env var plumbing is needed.
export const IS_NEXT_CHANNEL = process.env.BLIT386_CHANNEL === 'next';

/**
 * Build the sitemap XML body for the live demo registry: the site root plus every demo's
 * canonical, extensionless URL, in registry order. Pure and exported so it can be
 * unit-tested without touching disk.
 * @param {Array<{ slug: string }>} registry - Live demo registry entries.
 * @param {string} siteUrl - Absolute origin to build URLs from (SITE_URL or NEXT_SITE_URL).
 * @returns {string} A complete `sitemap.xml` document.
 */
export function buildSitemapXml(registry, siteUrl) {
    const urls = [`${siteUrl}/`, ...registry.map((entry) => `${siteUrl}/${entry.slug}`)];
    const body = urls.map((url) => `    <url>\n        <loc>${url}</loc>\n    </url>`).join('\n');

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        `${body}\n` +
        '</urlset>\n'
    );
}

/**
 * Writes `dist/sitemap.xml` from the live demo registry: the site root plus every demo's
 * canonical, extensionless URL. Cloudflare Pages serves `/<slug>` and 308s `/<slug>.html` to
 * it, so only the extensionless form belongs here - same rule `demoRedirectsPlugin` follows
 * for `_redirects`.
 *
 * Skipped entirely on the `next.demos.blit386.dev` preview channel (`BLIT386_CHANNEL=next`):
 * that channel already disallows all crawling via `channelHeadersPlugin`'s disallow-all
 * `robots.txt`, so a sitemap there would contradict it.
 * @returns {import('vite').Plugin}
 */
export function sitemapPlugin() {
    return {
        name: 'demo-sitemap',
        apply: 'build',
        closeBundle() {
            if (IS_NEXT_CHANNEL) {
                return;
            }

            const registry = buildRegistry(rootDir);
            const xml = buildSitemapXml(registry, SITE_URL);

            writeFileSync(join(resolve(rootDir, 'dist'), 'sitemap.xml'), xml);
        },
    };
}
