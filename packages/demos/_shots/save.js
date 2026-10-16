/**
 * Writes a capture run into public/shots/ through the File System Access API (Chrome). The
 * user picks the directory once per session; the handle is kept in memory only. Without that
 * API every file is downloaded instead, named `<slug>__<file>` because a download name cannot
 * hold a folder.
 */

import { DEMO_ORDER } from '../plugins/demo-order.js';
import { entryKey, imagePath, mergeManifest } from './manifest.js';
import { OUTPUT_VARIANT } from './poses.js';

const MANIFEST_NAME = 'manifest.json';

/**
 * @returns {Promise<FileSystemDirectoryHandle | null>} Null when this browser has no File System Access API.
 */
async function pickShotsDirectory() {
    if (typeof window.showDirectoryPicker !== 'function') {
        return null;
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
 * @param {string} path
 * @param {Blob | string} data
 */
async function downloadFile(path, data) {
    const link = document.createElement('a');

    link.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'application/json' }));
    link.download = path.replace('/', '__');
    link.click();
    // Some browsers start the download asynchronously; revoking in the same tick can empty it.
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

/**
 * Save every result, one file at a time. A file that fails to write is named in `failed` and the
 * rest still go out; the manifest lists only what was written.
 *
 * @param {FileSystemDirectoryHandle | null} dir - Null downloads each file instead.
 * @param {Array<object>} results
 * @param {object} existingManifest
 * @param {{ engineVersion: string }} meta
 * @returns {Promise<{ manifest: object, failed: Array<{ path: string, error: string, result: object | null }> }>}
 *   `manifest` is the merged manifest (the written one, unless `failed` names `manifest.json`).
 */
async function saveRun(dir, results, existingManifest, meta) {
    const write = dir ? (path, data) => writeFile(dir, path, data) : downloadFile;
    const written = [];
    const failed = [];

    for (const result of results.filter((item) => item.ok)) {
        const path = imagePath(result.slug, result.pose, result.variant);

        try {
            await write(path, result.blob);
            written.push(result);
        } catch (error) {
            failed.push({ path, error: error instanceof Error ? error.message : String(error), result });
        }
    }

    const manifest = mergeManifest(existingManifest, entriesFromResults(written), DEMO_ORDER, meta);

    try {
        await write(MANIFEST_NAME, `${JSON.stringify(manifest, null, 2)}\n`);
    } catch (error) {
        failed.push({
            path: MANIFEST_NAME,
            error: error instanceof Error ? error.message : String(error),
            result: null,
        });
    }

    return { manifest, failed };
}

export { entriesFromResults, pickShotsDirectory, saveRun };
