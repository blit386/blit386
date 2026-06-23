import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WRANGLER_CONFIG = 'dist/server/wrangler.json';
const REQUIRED_FLAG = 'nodejs_compat';

const config = JSON.parse(readFileSync(WRANGLER_CONFIG, 'utf8'));

if (!Array.isArray(config.compatibility_flags)) {
    config.compatibility_flags = [];
}

if (!config.compatibility_flags.includes(REQUIRED_FLAG)) {
    config.compatibility_flags.push(REQUIRED_FLAG);
}

writeFileSync(WRANGLER_CONFIG, `${JSON.stringify(config, null, 2)}\n`);

// Cloudflare Workers does not set import.meta.url for bundled sub-modules, so
// createRequire(import.meta.url) throws at module init. Fall back to a dummy
// file URL so createRequire succeeds; the resulting require function is never
// invoked in practice within a fully bundled Worker.
//
// Scan the whole server bundle recursively, not just dist/server/assets: the
// crashing module lives in dist/server/ssr/assets (loaded on the dynamic-render
// path, e.g. the not-found page) and the bundle also emits non-`chunk-` files
// (such as export-*.js) that contain the same call. Missing either turned every
// unhandled route into a 500 instead of a clean 404.
const SERVER_DIR = 'dist/server';
const PATTERN = /createRequire\s*\(\s*import\s*\.\s*meta\s*\.\s*url\s*\)/g;
const REPLACEMENT = "createRequire(import.meta.url ?? 'file:///worker.js')";

let entries;
try {
    entries = readdirSync(SERVER_DIR, { recursive: true });
} catch {
    entries = [];
}

for (const entry of entries) {
    if (!entry.endsWith('.js') && !entry.endsWith('.mjs')) continue;
    const filePath = join(SERVER_DIR, entry);
    const content = readFileSync(filePath, 'utf8');
    const patched = content.replace(PATTERN, REPLACEMENT);
    if (patched === content) continue;
    console.log(`patched: ${filePath}`);
    writeFileSync(filePath, patched);
}
