import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IS_NEXT_CHANNEL, SITE_URL } from './sitemap.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');

/**
 * Build the `robots.txt` body for either channel. Pure and exported so it can be
 * unit-tested without touching disk.
 * @param {boolean} isNextChannel - True on the `next.demos.blit386.dev` preview channel.
 * @param {string} siteUrl - Production origin, used to point crawlers at the sitemap.
 * @returns {string} A complete `robots.txt` document.
 */
export function buildRobotsTxt(isNextChannel, siteUrl) {
    return isNextChannel
        ? 'User-agent: *\nDisallow: /\n'
        : `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

/**
 * Add `X-Robots-Tag: noindex` to the existing `/*` rule of a `_headers` file. Appending a second
 * `/*` block instead left next.demos.blit386.dev serving no CSP and no Permissions-Policy.
 * Pure and exported so it can be unit-tested without touching disk.
 * @param {string} headers - The `_headers` file contents.
 * @returns {string} The same contents with the noindex line first in the `/*` rule.
 */
export function addNoindexHeader(headers) {
    const catchAllRule = /^\/\*[ \t]*$/m;
    if (!catchAllRule.test(headers)) {
        throw new Error('channel-headers: dist/_headers has no /* rule to add X-Robots-Tag: noindex to');
    }
    return headers.replace(catchAllRule, (rule) => `${rule}\n  X-Robots-Tag: noindex`);
}

/**
 * On the `next.demos.blit386.dev` preview channel (`BLIT386_CHANNEL=next`, set only in the
 * `deploy-demos-next` CI job - see `.github/workflows/deploy.yml`), adds `X-Robots-Tag: noindex`
 * to the `/*` rule of `dist/_headers` and writes a disallow-all `dist/robots.txt`.
 * Production gets no `_headers` change: it stays exactly what Vite's `public/` copy wrote
 * from `public/_headers`. Production's `robots.txt` instead allows everything and points
 * crawlers at `sitemapPlugin`'s `dist/sitemap.xml`.
 *
 * Runs in `closeBundle`, which fires after every plugin's `writeBundle` hook across the whole
 * build (Rollup runs the hooks in phases, not by plugin array order) - so `dist/_headers` from
 * Vite's `public/` copy already exists by the time this reads and rewrites it.
 * @returns {import('vite').Plugin}
 */
export function channelHeadersPlugin() {
    return {
        name: 'channel-headers',
        apply: 'build',
        closeBundle() {
            const distDir = resolve(rootDir, 'dist');
            if (!IS_NEXT_CHANNEL) {
                writeFileSync(join(distDir, 'robots.txt'), buildRobotsTxt(false, SITE_URL));
                return;
            }

            const headersPath = join(distDir, '_headers');
            writeFileSync(headersPath, addNoindexHeader(readFileSync(headersPath, 'utf8')));

            writeFileSync(join(distDir, 'robots.txt'), buildRobotsTxt(true, SITE_URL));
        },
    };
}
