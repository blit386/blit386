import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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
 */
export const patchWranglerConfig = (config) => {
    const existingFlags = Array.isArray(config.compatibility_flags) ? config.compatibility_flags : [];
    const flags = existingFlags.includes(REQUIRED_FLAG) ? existingFlags : [...existingFlags, REQUIRED_FLAG];
    const assets =
        config.assets && config.assets.run_worker_first !== true
            ? { ...config.assets, run_worker_first: true }
            : config.assets;
    return {
        ...config,
        compatibility_flags: flags,
        ...(config.assets !== undefined ? { assets } : {}),
    };
};

/**
 * Rewrite `createRequire(import.meta.url)` calls to include a fallback so the
 * call succeeds in Cloudflare Workers where `import.meta.url` is undefined for
 * bundled sub-modules. Returns a new string; the input is not mutated.
 */
export const patchRequireMetaUrl = (content) => content.replace(PATTERN, REPLACEMENT);

const main = () => {
    const patchedConfig = patchWranglerConfig(JSON.parse(readFileSync(WRANGLER_CONFIG, 'utf8')));
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
