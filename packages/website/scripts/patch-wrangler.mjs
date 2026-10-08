// @ts-nocheck
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WRANGLER_CONFIG = 'dist/server/wrangler.json';
const REQUIRED_FLAG = 'nodejs_compat';
const SERVER_DIR = 'dist/server';
const CREATE_REQUIRE_PATTERN = /createRequire\s*\(\s*import\s*\.\s*meta\s*\.\s*url\s*\)/g;
const CREATE_REQUIRE_REPLACEMENT = "createRequire(import.meta.url ?? 'file:///worker.js')";
const BUILD_METADATA_FILE = 'dist/server/__waku_build_metadata.js';
const BUILD_METADATA_PATTERN = /^export const buildMetadata = new Map\((.*)\);$/su;
const CACHED_ELEMENTS_KEY = 'defineRouter:cachedElements';
const PAGE_SLOT_PREFIX = 'slot/page:';

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
 * shell env the CI build step ran in - only to whatever `wrangler.json` declares as
 * `vars`, surfaced at request time via `c.env`. Verified locally with `wrangler dev`:
 * without this, `X-Robots-Tag` and the `/robots.txt` override silently never fired,
 * even though `BLIT386_CHANNEL=next` was set for the build (which is why the SSG'd
 * HTML's noindex meta, banner, and canonical URLs were correct regardless - those are
 * baked in once during the Node build, not re-evaluated in the Worker).
 *
 * `isCspReportOnly` sets `BLIT386_CSP_REPORT_ONLY: '1'`, read the same request-time way
 * by `src/csp-nonce.ts`. It downgrades the nonce-based CSP to
 * `Content-Security-Policy-Report-Only` for a deployment, so a policy change can be
 * measured against real traffic on next.blit386.dev before it is enforced on production.
 * Never set it for the production build.
 *
 * `observability.enabled` turns on Workers Logs. blit386.dev is a production site with a
 * live JSON-RPC endpoint (`/mcp`) and a request-time markdown-negotiation path in front of
 * every doc URL; without this there is no way to see a runtime error in either without
 * reproducing it locally.
 * @param {{ isNextChannel?: boolean, isCspReportOnly?: boolean }} [options]
 */
export const patchWranglerConfig = (config, options = {}) => {
    const { isNextChannel = false, isCspReportOnly = false } = options;
    const existingFlags = Array.isArray(config.compatibility_flags) ? config.compatibility_flags : [];
    const flags = existingFlags.includes(REQUIRED_FLAG) ? existingFlags : [...existingFlags, REQUIRED_FLAG];
    const assets =
        config.assets && config.assets.run_worker_first !== true
            ? { ...config.assets, run_worker_first: true }
            : config.assets;
    const extraVars = {
        ...(isNextChannel ? { BLIT386_CHANNEL: 'next' } : {}),
        ...(isCspReportOnly ? { BLIT386_CSP_REPORT_ONLY: '1' } : {}),
    };
    const vars = Object.keys(extraVars).length > 0 ? { ...config.vars, ...extraVars } : config.vars;
    const observability = { ...config.observability, enabled: true };
    return {
        ...config,
        compatibility_flags: flags,
        ...(config.assets !== undefined ? { assets } : {}),
        ...(vars !== undefined ? { vars } : {}),
        observability,
    };
};

/**
 * Rewrite `createRequire(import.meta.url)` calls to include a fallback so the
 * call succeeds in Cloudflare Workers where `import.meta.url` is undefined for
 * bundled sub-modules. Returns a new string; the input is not mutated.
 */
export const patchRequireMetaUrl = (content) => content.replace(CREATE_REQUIRE_PATTERN, CREATE_REQUIRE_REPLACEMENT);

/**
 * Drop each prerendered page's RSC payload from Waku's build metadata (BT-586). Waku keeps
 * a base64 copy of every static page in `defineRouter:cachedElements`, which with Twoslash
 * on was ~27 MiB of a Worker that Cloudflare caps at 64 MiB uncompressed. The Worker never
 * serves those pages: `markdownNegotiationPlugin` answers every HTML and `RSC/` request from
 * the ASSETS binding, and only asset-less paths (`/mcp`, unknown URLs) reach Waku.
 *
 * Safe because the cache is only a cache: in waku 1.0.0-beta.6 `addEntry` in
 * `waku/dist/router/define-router.js` renders a static slot on a miss. Layout and route
 * template entries stay cached; every page, the 404 page included, renders on demand if a
 * request ever reaches Waku. Throws on any other file shape, so a Waku upgrade that changes
 * it fails the build instead of shipping the bloat.
 *
 * @param {string} source Contents of `dist/server/__waku_build_metadata.js`.
 * @returns {string}
 */
export const stripPrerenderedPages = (source) => {
    const match = BUILD_METADATA_PATTERN.exec(source.trim());
    if (!match) throw new Error(`${BUILD_METADATA_FILE} is not the "new Map([...])" module this patch expects`);
    /** @type {[string, string][]} */
    const entries = JSON.parse(match[1]);
    if (!entries.some(([key]) => key === CACHED_ELEMENTS_KEY)) {
        throw new Error(`${BUILD_METADATA_FILE} has no ${CACHED_ELEMENTS_KEY} entry`);
    }
    const stripped = entries.map(([key, value]) => {
        if (key !== CACHED_ELEMENTS_KEY) return [key, value];
        const kept = Object.entries(JSON.parse(value)).filter(([cacheId]) => !cacheId.startsWith(PAGE_SLOT_PREFIX));
        return [key, JSON.stringify(Object.fromEntries(kept))];
    });
    return `export const buildMetadata = new Map(${JSON.stringify(stripped)});`;
};

const main = () => {
    const isNextChannel = process.env.BLIT386_CHANNEL === 'next';
    const isCspReportOnly = process.env.BLIT386_CSP_REPORT_ONLY === '1';
    const patchedConfig = patchWranglerConfig(JSON.parse(readFileSync(WRANGLER_CONFIG, 'utf8')), {
        isNextChannel,
        isCspReportOnly,
    });
    writeFileSync(WRANGLER_CONFIG, `${JSON.stringify(patchedConfig, null, 2)}\n`);

    const bytesBefore = statSync(BUILD_METADATA_FILE).size;
    writeFileSync(BUILD_METADATA_FILE, stripPrerenderedPages(readFileSync(BUILD_METADATA_FILE, 'utf8')));
    const toMiB = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
    console.log(
        `stripped prerendered pages: ${BUILD_METADATA_FILE} ${toMiB(bytesBefore)} -> ${toMiB(statSync(BUILD_METADATA_FILE).size)}`,
    );

    // Scan the whole server bundle recursively, not just dist/server/assets: the
    // crashing module lives in dist/server/ssr/assets (loaded on the dynamic-render
    // path, e.g. the not-found page) and the bundle also emits non-`chunk-` files
    // (such as export-*.js) that contain the same call. Missing either turned every
    // unhandled route into a 500 instead of a clean 404.
    for (const entry of readdirSync(SERVER_DIR, { recursive: true })) {
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
