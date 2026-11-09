import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The engine package root, which every script here reports paths relative to. */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Path relative to the engine package root, for readable console output.
 *
 * @param {string} filePath - Absolute file path.
 * @returns {string} Package-relative path, or `filePath` unchanged when it lies outside the package.
 */
export function relativeToRoot(filePath) {
    return filePath.startsWith(PACKAGE_ROOT) ? filePath.slice(PACKAGE_ROOT.length + 1) : filePath;
}

/**
 * Runs a generator's `--check`: compares freshly generated text with the committed file and
 * exits non-zero on drift, naming the script that regenerates it.
 *
 * @param {string} outputFile - Absolute path of the committed generated file.
 * @param {string} desired - Freshly generated contents.
 * @param {string} regenerateScript - `pnpm run` script name that rewrites `outputFile`.
 */
export function runCheck(outputFile, desired, regenerateScript) {
    const relativeOutput = relativeToRoot(outputFile);
    const current = existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : null;

    if (current === desired) {
        console.log(`${relativeOutput} is up to date.`);

        return;
    }

    console.error(`${relativeOutput} is out of date.`);
    console.error(`Run \`pnpm run ${regenerateScript}\` to regenerate it.`);
    process.exit(1);
}
