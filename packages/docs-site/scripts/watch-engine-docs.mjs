#!/usr/bin/env node
/**
 * Watch the canonical engine docs directory and re-run the sync script on
 * every change. Run alongside `pnpm run dev`; Fumapress HMR picks up the
 * regenerated MDX files automatically.
 *
 * Usage:
 *   pnpm run sync:docs:watch
 *
 * The watched directory resolves the same way the sync script does: the
 * ENGINE_DOCS_DIR environment variable when set, otherwise the sibling
 * workspace path `../blit386/docs`.
 */
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_DOCS = resolve(ROOT, process.env.ENGINE_DOCS_DIR ?? '../blit386/docs');
const SYNC_SCRIPT = resolve(ROOT, 'scripts/sync-docs-from-engine.mjs');

const DEBOUNCE_MS = 300;

let debounceTimer = null;
let syncing = false;
let pendingAfterSync = false;

const runSync = () => {
    if (syncing) {
        pendingAfterSync = true;
        return;
    }

    syncing = true;
    const start = Date.now();
    console.log('[sync] running...');

    const child = spawn(process.execPath, [SYNC_SCRIPT], {
        stdio: 'inherit',
        env: { ...process.env, ENGINE_DOCS_DIR: ENGINE_DOCS },
    });

    child.on('close', (code) => {
        const elapsed = Date.now() - start;

        if (code === 0) {
            console.log(`[sync] done in ${elapsed}ms`);
        } else {
            console.error(`[sync] failed (exit ${code}) after ${elapsed}ms`);
        }

        syncing = false;

        if (pendingAfterSync) {
            pendingAfterSync = false;
            runSync();
        }
    });
};

const scheduleSync = (filename) => {
    if (filename) {
        console.log(`[watch] changed: ${filename}`);
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSync, DEBOUNCE_MS);
};

console.log(`[watch] ${ENGINE_DOCS}`);
console.log('[watch] run `pnpm run dev` in another terminal for HMR');
console.log('[watch] ctrl+c to stop\n');

try {
    watch(ENGINE_DOCS, { recursive: true }, (_event, filename) => {
        if (!filename || filename.startsWith('.') || filename === '_sitemap.schema.json') {
            return;
        }

        scheduleSync(filename);
    });
} catch (error) {
    console.error(`[watch] cannot watch ${ENGINE_DOCS}: ${error.message}`);
    console.error('[watch] is the blit386 repo checked out at the sibling path?');
    process.exit(1);
}

runSync();
