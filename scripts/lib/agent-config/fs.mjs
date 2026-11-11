import { existsSync, readFileSync, realpathSync } from 'node:fs';

/** @param {string} path @returns {string} The resolved path, or `path` unchanged when it does not exist. */
export function realpathSyncIfExists(path) {
    return existsSync(path) ? realpathSync(path) : path;
}

/** @param {string} path @returns {string | null} File contents, or `null` when the file does not exist. */
export function readFileIfExists(path) {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
}
