/**
 * Writes a capture run into public/shots/ through the File System Access API (Chrome). The
 * user picks the directory once per session; the handle is kept in memory only.
 */

import { DEMO_ORDER } from '../plugins/demo-order.js';
import { entryKey, imagePath, mergeManifest } from './manifest.js';
import { OUTPUT_VARIANT } from './poses.js';

const MANIFEST_NAME = 'manifest.json';

/**
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function pickShotsDirectory() {
    if (typeof window.showDirectoryPicker !== 'function') {
        throw new Error('This browser has no File System Access API - use Chrome, or run pnpm run capture:shots.');
    }

    return window.showDirectoryPicker({ id: 'blit386-shots', mode: 'readwrite' });
}

/**
 * @param {FileSystemDirectoryHandle} dir
 * @param {string} path - `<slug>/<file>` or a bare file name.
 * @param {Blob | string} data
 */
async function writeFile(dir, path, data) {
    const [folder, name] = path.split('/');
    const target = name ? await dir.getDirectoryHandle(folder, { create: true }) : dir;
    const handle = await target.getFileHandle(name ?? folder, { create: true });
    const writable = await handle.createWritable();

    await writable.write(data);
    await writable.close();
}

/**
 * Turn capture results into manifest entries: one per (slug, pose), variants merged.
 *
 * @param {Array<object>} results - From captureAll's onResult.
 * @returns {Array<object>}
 */
function entriesFromResults(results) {
    const byKey = new Map();

    for (const result of results) {
        const key = entryKey(result.slug, result.pose);
        const entry = byKey.get(key) ?? {
            slug: result.slug,
            pose: result.pose,
            variants: {},
            width: 0,
            height: 0,
            lint: [],
            error: null,
        };

        if (result.ok) {
            entry.variants[result.variant] = imagePath(result.slug, result.pose, result.variant);

            if (result.variant !== OUTPUT_VARIANT && (result.variant === 'display' || entry.width === 0)) {
                entry.width = result.width;
                entry.height = result.height;
                entry.lint = result.lint;
            }
        } else {
            entry.error = `${result.variant}: ${result.error}`;
        }

        byKey.set(key, entry);
    }

    return [...byKey.values()];
}

/**
 * @param {FileSystemDirectoryHandle} dir
 * @param {Array<object>} results
 * @param {object} existingManifest
 * @param {{ engineVersion: string }} meta
 * @returns {Promise<object>} The merged manifest that was written.
 */
async function saveRun(dir, results, existingManifest, meta) {
    for (const result of results) {
        if (result.ok) {
            await writeFile(dir, imagePath(result.slug, result.pose, result.variant), result.blob);
        }
    }

    const manifest = mergeManifest(existingManifest, entriesFromResults(results), DEMO_ORDER, meta);

    await writeFile(dir, MANIFEST_NAME, `${JSON.stringify(manifest, null, 2)}\n`);

    return manifest;
}

export { entriesFromResults, pickShotsDirectory, saveRun };
