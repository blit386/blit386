import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Fumapress hard-codes <title> and <meta property="og:title"> from page.data.title
// before the meta.page() callback runs, so there is no config hook to prefix them.
// This script post-processes the static HTML output and prepends "BLIT386 – " to both
// on every non-root page so social-card scrapers and browser tabs show the site name.

const DIST_DIR = join(process.cwd(), 'dist/public');
const PREFIX = 'BLIT386 – ';

function patchFile(filePath) {
    const original = readFileSync(filePath, 'utf8');

    const patched = original
        // <title> - one per page, no prefix guard needed (script skips root)
        .replace(/<title>([^<]+)<\/title>/, `<title>${PREFIX}$1</title>`)

        // first <meta property="og:title"> - skip if already prefixed (idempotent)
        .replace(
            /<meta property="og:title" content="(?!BLIT386)([^"]+)"/,
            `<meta property="og:title" content="${PREFIX}$1"`,
        );

    if (patched !== original) {
        writeFileSync(filePath, patched);
        return true;
    }

    return false;
}

let count = 0;

for (const entry of readdirSync(DIST_DIR, { recursive: true })) {
    if (!entry.endsWith('.html')) continue;
    if (entry === 'index.html') continue; // root page: no prefix

    const fullPath = join(DIST_DIR, entry);
    const rel = relative(DIST_DIR, fullPath);

    if (patchFile(fullPath)) {
        console.log(`patched: ${rel}`);
        count++;
    }
}

console.log(`[patch-html-title] ${count} file(s) updated`);
