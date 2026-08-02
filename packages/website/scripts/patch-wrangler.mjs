// @ts-nocheck
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WRANGLER_CONFIG = 'dist/server/wrangler.json';
const REQUIRED_FLAG = 'nodejs_compat';
const SERVER_DIR = 'dist/server';
const PATTERN = /createRequire\s*\(\s*import\s*\.\s*meta\s*\.\s*url\s*\)/g;
const REPLACEMENT = "createRequire(import.meta.url ?? 'file:///worker.js')";

/**
 * Inject `nodejs_compat` compatibility flag and `run_worker_first: true` into a
 * parsed Wrangler config object. Returns a new object; the input is not mutated.
 *
 * Run the Worker before the Static Assets layer so markdown content negotiation
 * (Accept: text/markdown) can intercept canonical doc URLs. Without this, Cloudflare
 * serves pre-rendered HTML directly and the Worker never sees the request. The Worker
 * re-implements assets-first via the ASSETS binding (see src/markdown-negotiation.ts).
 *
 * `isNextChannel` also sets a `BLIT386_CHANNEL: 'next'` var. This can't be a plain
 * `process.env.BLIT386_CHANNEL` read inside `src/channel-headers.ts` instead: that
 * module's top level re-runs inside the deployed Worker on every cold start (to
 * reconstruct the Fumapress plugin list), and the Worker has no access to the
 * shell env the CI build step ran in – only to whatever `wrangler.json` declares as
 * `vars`, surfaced at request time via `c.env`. Verified locally with `wrangler dev`:
 * without this, `X-Robots-Tag` and the `/robots.txt` override silently never fired,
 * even though `BLIT386_CHANNEL=next` was set for the build (which is why the SSG'd
 * HTML's noindex meta, banner, and canonical URLs were correct regardless – those are
 * baked in once during the Node build, not re-evaluated in the Worker).
 * @param {{ isNextChannel?: boolean }} [options]
 */
export const patchWranglerConfig = (config, options = {}) => {
    const { isNextChannel = false } = options;
    const existingFlags = Array.isArray(config.compatibility_flags) ? config.compatibility_flags : [];
    const flags = existingFlags.includes(REQUIRED_FLAG) ? existingFlags : [...existingFlags, REQUIRED_FLAG];
    const assets =
        config.assets && config.assets.run_worker_first !== true
            ? { ...config.assets, run_worker_first: true }
            : config.assets;
    const vars = isNextChannel ? { ...config.vars, BLIT386_CHANNEL: 'next' } : config.vars;
    return {
        ...config,
        compatibility_flags: flags,
        ...(config.assets !== undefined ? { assets } : {}),
        ...(vars !== undefined ? { vars } : {}),
    };
};

/**
 * Rewrite `createRequire(import.meta.url)` calls to include a fallback so the
 * call succeeds in Cloudflare Workers where `import.meta.url` is undefined for
 * bundled sub-modules. Returns a new string; the input is not mutated.
 */
export const patchRequireMetaUrl = (content) => content.replace(PATTERN, REPLACEMENT);

const main = () => {
    const isNextChannel = process.env.BLIT386_CHANNEL === 'next';
    const patchedConfig = patchWranglerConfig(JSON.parse(readFileSync(WRANGLER_CONFIG, 'utf8')), { isNextChannel });
    writeFileSync(WRANGLER_CONFIG, `${JSON.stringify(patchedConfig, null, 2)}\n`);

    // Scan the whole server bundle recursively, not just dist/server/assets: the
    // crashing module lives in dist/server/ssr/assets (loaded on the dynamic-render
    // path, e.g. the not-found page) and the bundle also emits non-`chunk-` files
    // (such as export-*.js) that contain the same call. Missing either turned every
    // unhandled route into a 500 instead of a clean 404.
    let entries;
    try {
        entries = readdirSync(SERVER_DIR, { recursive: true });
    } catch (error) {
        if (error.code === 'ENOENT') {
            entries = [];
        } else {
            throw error;
        }
    }

    for (const entry of entries) {
        if (!entry.endsWith('.js') && !entry.endsWith('.mjs')) continue;
        const filePath = join(SERVER_DIR, entry);
        const content = readFileSync(filePath, 'utf8');
        const patchedContent = patchRequireMetaUrl(content);
        if (patchedContent === content) continue;
        console.log(`patched: ${filePath}`);
        writeFileSync(filePath, patchedContent);
    }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
