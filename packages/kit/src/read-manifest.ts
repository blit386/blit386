/**
 * Reading `.blit/manifest.json` for the commands that need it (`agents`, `clean`, `doctor`).
 *
 * Kept apart from `manifest.ts` on purpose: that module is a leaf with no filesystem access, this one reads the file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hasSymlinkedSegment } from './fs-safety';
import { BLIT_DIR, MANIFEST_FILE, type ReadBlitManifest } from './manifest';
import { ui } from './messages';

/** True for a plain JSON object (not an array or null). */
function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Result of reading the manifest: either the parsed manifest, or a friendly failure with an exit code. */
type ManifestResult = { ok: true; manifest: ReadBlitManifest } | { ok: false; exitCode: number };

/**
 * Read and validate `.blit/manifest.json`. Prints a Tier-1 line on failure.
 * A missing manifest is informational (exit 0); a damaged one is an error (exit 1).
 *
 * The shape is checked here, once: a plain object with a `files` array. Entries without a string `path` are dropped
 * with one warning (a command that then saves the manifest removes them from the file). JSON can legally hold `null` or `{ "path": 5 }`, and every caller indexes into the result.
 *
 * @param missingTip - what scaffolding the project enables, for the "no manifest" hint
 */
export function readManifest(
    root: string,
    out: (line: string) => void,
    missingTip = 'enable agent setup',
): ManifestResult {
    const manifestPath = join(root, BLIT_DIR, MANIFEST_FILE);

    if (hasSymlinkedSegment(manifestPath, root)) {
        out(ui.error('.blit/manifest.json is reached through a symlink and will not be read or written.'));
        return { ok: false, exitCode: 1 };
    }

    if (!existsSync(manifestPath)) {
        out(ui.info('This project has no .blit/manifest.json.'));
        out(ui.info(`Scaffold with \`npm create blit386\` to ${missingTip}.`));
        return { ok: false, exitCode: 0 };
    }

    let manifest: unknown;

    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
        out(ui.error('Could not read .blit/manifest.json. The file may be damaged.'));
        return { ok: false, exitCode: 1 };
    }

    if (!isObject(manifest) || !Array.isArray(manifest.files)) {
        out(
            ui.error(
                '.blit/manifest.json has an unexpected shape (it needs a files array). The manifest may be damaged or from an older version.',
            ),
        );
        return { ok: false, exitCode: 1 };
    }

    const files = (manifest.files as unknown[]).filter(
        (entry): entry is ReadBlitManifest['files'][number] => isObject(entry) && typeof entry.path === 'string',
    );

    if (files.length < manifest.files.length) {
        out(
            ui.warn(
                `Skipping ${manifest.files.length - files.length} entries in .blit/manifest.json that have no path. Commands that save the manifest will remove them.`,
            ),
        );
    }

    return { ok: true, manifest: { ...manifest, files } as ReadBlitManifest };
}
