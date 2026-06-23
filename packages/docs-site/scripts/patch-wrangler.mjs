import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// #region Patch wrangler.json - add nodejs_compat flag

const WRANGLER_CONFIG = 'dist/server/wrangler.json';
const REQUIRED_FLAG = 'nodejs_compat';

const config = JSON.parse(readFileSync(WRANGLER_CONFIG, 'utf8'));

if (!Array.isArray(config.compatibility_flags)) {
    config.compatibility_flags = [];
}

if (!config.compatibility_flags.includes(REQUIRED_FLAG)) {
    config.compatibility_flags.push(REQUIRED_FLAG);
}

// Run the Worker before the Static Assets layer so markdown content negotiation
// (Accept: text/markdown) can intercept canonical doc URLs. Without this, Cloudflare
// serves pre-rendered HTML directly and the Worker never sees the request. The Worker
// re-implements assets-first via the ASSETS binding (see src/markdown-negotiation.ts).
if (config.assets && config.assets.run_worker_first !== true) {
    config.assets = { ...config.assets, run_worker_first: true };
}

writeFileSync(WRANGLER_CONFIG, `${JSON.stringify(config, null, 2)}\n`);

// #endregion

// #region Patch rolldown runtime chunk - fix createRequire(import.meta.url)

// Cloudflare Workers does not set import.meta.url for bundled sub-modules, so
// createRequire(import.meta.url) throws at module init. Fall back to a dummy
// file URL so createRequire succeeds; the resulting require function is never
// invoked in practice within a fully bundled Worker.
const ASSETS_DIR = 'dist/server/assets';
const PATTERN = /createRequire\s*\(\s*import\s*\.\s*meta\s*\.\s*url\s*\)/g;
const REPLACEMENT = "createRequire(import.meta.url ?? 'file:///worker.js')";

let files;
try {
    files = readdirSync(ASSETS_DIR);
} catch {
    files = [];
}

for (const file of files) {
    if (!file.startsWith('chunk-') || !file.endsWith('.js')) continue;
    const filePath = join(ASSETS_DIR, file);
    const content = readFileSync(filePath, 'utf8');
    const patched = content.replace(PATTERN, REPLACEMENT);
    if (patched === content) continue;
    console.log(`patched: ${filePath}`);
    writeFileSync(filePath, patched);
}

// #endregion
