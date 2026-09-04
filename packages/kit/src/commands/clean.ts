/**
 * `blit clean` – replace the game's source file with an empty, ready-to-fill skeleton.
 *
 * Detects TypeScript vs JavaScript by which language config is present (`tsconfig.json` vs
 * `jsconfig.json`), then overwrites `src/game.ts` / `src/game.js` with the kit's empty skeleton: the
 * same `init`/`update`/`render` shape, no drawing, no input handling. Nothing else in the project is
 * touched – agent files, config, and docs are all scaffolded once and never revisited by this command.
 *
 * Before writing, compares the current file's SHA-256 against the hash `.blit/manifest.json` recorded
 * for it at scaffold time. A match means the file is still the untouched default; a mismatch means the
 * user has started their own game, so the confirm prompt below is phrased as a warning instead of a
 * routine question. Either way, nothing is written without an explicit yes – or `--yes` to skip the
 * prompt for scripted use, mirroring `confirm()`'s own non-TTY safe default.
 *
 * After a successful write, the manifest entry's hash is updated to match the new skeleton, so the
 * skeleton becomes the new tracked baseline instead of showing as permanently modified.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { findProjectRoot } from '../env';
import { hasSymlinkedSegment, isSafeRelPath, sha256, sha256Text } from '../fs-safety';
import { kitRoot } from '../kit-root';
import { BLIT_DIR, MANIFEST_FILE, type ReadBlitManifest } from '../manifest';
import { ui } from '../messages';
import { confirm } from '../prompt';

/** Project-relative path of the game source file in a TypeScript scaffold. */
const GAME_FILE_TS = 'src/game.ts';

/** Project-relative path of the game source file in a JavaScript scaffold. */
const GAME_FILE_JS = 'src/game.js';

/** Read `.blit/manifest.json` if present and undamaged; a missing or unreadable manifest is not fatal. */
function tryReadManifest(root: string): ReadBlitManifest | null {
    const manifestPath = join(root, BLIT_DIR, MANIFEST_FILE);

    if (hasSymlinkedSegment(manifestPath, root) || !existsSync(manifestPath)) {
        return null;
    }

    try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReadBlitManifest;
        return Array.isArray(manifest.files) ? manifest : null;
    } catch {
        return null;
    }
}

export async function runClean(args: string[]): Promise<void> {
    const out = (line: string): void => {
        process.stdout.write(`${line}\n`);
    };
    const skipPrompt = args.includes('--yes') || args.includes('-y');

    const root = findProjectRoot(process.cwd());
    if (!root) {
        out(ui.error("Couldn't find a game here. Run this inside your game folder."));
        process.exitCode = 1;
        return;
    }

    const isTs = existsSync(join(root, 'tsconfig.json'));
    const isJs = existsSync(join(root, 'jsconfig.json'));

    if (!isTs && !isJs) {
        out(
            ui.error(
                "Couldn't tell if this is a JavaScript or TypeScript project (no tsconfig.json or jsconfig.json).",
            ),
        );
        process.exitCode = 1;
        return;
    }

    if (isTs && isJs) {
        out(
            ui.error(
                "Couldn't tell if this is a JavaScript or TypeScript project (both tsconfig.json and jsconfig.json are here).",
            ),
        );
        process.exitCode = 1;
        return;
    }

    const relPath = isTs ? GAME_FILE_TS : GAME_FILE_JS;
    const absPath = join(root, relPath);

    if (hasSymlinkedSegment(absPath, root)) {
        out(ui.error(`${relPath} is reached through a symlink and will not be touched.`));
        process.exitCode = 1;
        return;
    }

    if (!existsSync(absPath)) {
        out(ui.error(`Couldn't find ${relPath} here. Run this inside your game folder.`));
        process.exitCode = 1;
        return;
    }

    const manifest = tryReadManifest(root);
    const entry = manifest?.files.find((file) => file.path === relPath);
    const isModified = entry !== undefined && entry.sha256 !== sha256(absPath);

    if (isModified) {
        out(ui.warn(`${relPath} has changed since it was scaffolded.`));
        out(ui.info('Cleaning replaces it with an empty skeleton – your current code will be lost.'));
    } else {
        out(ui.info(`This replaces ${relPath} with an empty skeleton, ready for your own code.`));
    }

    if (!skipPrompt) {
        const go = await confirm(`Replace ${relPath}?`);
        if (!go) {
            out(ui.info('No changes made.'));
            return;
        }
    }

    const templateName = isTs ? 'game.ts' : 'game.js';
    const skeleton = readFileSync(join(kitRoot(), 'content', 'templates', templateName), 'utf8');

    writeFileSync(absPath, skeleton);
    out(ui.success(`Replaced ${relPath} with an empty skeleton.`));

    // The game file is already replaced – the command's actual job is done. Keeping the manifest's tracked hash in
    // step is bookkeeping for later drift checks (`blit doctor`, `blit agents sync --check`), not the deliverable
    // itself, so a failure here is reported and swallowed rather than crashing a command that otherwise succeeded.
    if (manifest && entry && isSafeRelPath(relPath, root)) {
        entry.sha256 = sha256Text(skeleton);

        try {
            writeFileSync(join(root, BLIT_DIR, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
        } catch (error) {
            out(
                ui.warn(
                    `Couldn't update .blit/manifest.json (${error instanceof Error ? error.message : String(error)}).`,
                ),
            );
            out(ui.info(`${relPath} may show as modified in later drift checks.`));
        }
    }
}
