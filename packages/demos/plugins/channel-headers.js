import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_URL } from './sitemap.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');

/**
 * On the `next.demos.blit386.dev` preview channel (`BLIT386_CHANNEL=next`, set only in the
 * `deploy-demos-next` CI job – see `.github/workflows/deploy.yml`), appends an
 * `X-Robots-Tag: noindex` block to `dist/_headers` and writes a disallow-all `dist/robots.txt`.
 * Production gets neither `_headers` addition: it stays exactly what `viteStaticCopy` copied
 * from `public/_headers`. Production's `robots.txt` instead allows everything and points
 * crawlers at `sitemapPlugin`'s `dist/sitemap.xml`.
 *
 * Runs in `closeBundle`, which fires after every plugin's `writeBundle` hook across the whole
 * build (Rollup runs the hooks in phases, not by plugin array order) – so `dist/_headers` from
 * `viteStaticCopy` already exists by the time this reads/appends to it.
 * @returns {import('vite').Plugin}
 */
export function channelHeadersPlugin() {
    return {
        name: 'channel-headers',
        apply: 'build',
        closeBundle() {
            const distDir = resolve(rootDir, 'dist');

            if (process.env.BLIT386_CHANNEL !== 'next') {
                writeFileSync(
                    join(distDir, 'robots.txt'),
                    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
                );
                return;
            }

            const headersPath = join(distDir, '_headers');
            const noindexBlock =
                '\n# BT-406: next.demos.blit386.dev preview channel — never index.\n/*\n  X-Robots-Tag: noindex\n';

            if (existsSync(headersPath)) {
                appendFileSync(headersPath, noindexBlock);
            } else {
                writeFileSync(headersPath, noindexBlock.trimStart());
            }

            writeFileSync(join(distDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
        },
    };
}
