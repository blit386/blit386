import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_URL } from './sitemap.js';

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
 * Build the `X-Robots-Tag: noindex` block appended to `dist/_headers` on the next channel.
 * Pure and exported so it can be unit-tested without touching disk.
 * @returns {string}
 */
export function buildNoindexHeadersBlock() {
    return '\n# BT-406: next.demos.blit386.dev preview channel - never index.\n/*\n  X-Robots-Tag: noindex\n';
}

/**
 * On the `next.demos.blit386.dev` preview channel (`BLIT386_CHANNEL=next`, set only in the
 * `deploy-demos-next` CI job - see `.github/workflows/deploy.yml`), appends an
 * `X-Robots-Tag: noindex` block to `dist/_headers` and writes a disallow-all `dist/robots.txt`.
 * Production gets neither `_headers` addition: it stays exactly what Vite's `public/` copy wrote
 * from `public/_headers`. Production's `robots.txt` instead allows everything and points
 * crawlers at `sitemapPlugin`'s `dist/sitemap.xml`.
 *
 * Runs in `closeBundle`, which fires after every plugin's `writeBundle` hook across the whole
 * build (Rollup runs the hooks in phases, not by plugin array order) - so `dist/_headers` from
 * Vite's `public/` copy already exists by the time this reads/appends to it.
 * @returns {import('vite').Plugin}
 */
export function channelHeadersPlugin() {
    return {
        name: 'channel-headers',
        apply: 'build',
        closeBundle() {
            const distDir = resolve(rootDir, 'dist');
            const isNextChannel = process.env.BLIT386_CHANNEL === 'next';

            if (!isNextChannel) {
                writeFileSync(join(distDir, 'robots.txt'), buildRobotsTxt(false, SITE_URL));
                return;
            }

            const headersPath = join(distDir, '_headers');
            const noindexBlock = buildNoindexHeadersBlock();

            if (existsSync(headersPath)) {
                appendFileSync(headersPath, noindexBlock);
            } else {
                writeFileSync(headersPath, noindexBlock.trimStart());
            }

            writeFileSync(join(distDir, 'robots.txt'), buildRobotsTxt(true, SITE_URL));
        },
    };
}
