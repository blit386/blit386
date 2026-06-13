/**
 * `blit agents <add|sync>` - manage AI-assistant files from the kit's canonical content.
 *
 * `sync --check` is report-only: reads `.blit/manifest.json`, computes current SHA-256 hashes
 * for kit-owned and shared files, and reports any that have drifted from their generated state.
 * Exits non-zero when drift is found so it is safe to use in CI and inside `blit doctor`.
 *
 * Full sync (overwrite / managed-region merge) arrives in a later version.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findProjectRoot } from '../env';
import { ui } from '../messages';

type FileClass = 'kit-owned' | 'shared' | 'user-owned';

/** One entry as written by the scaffolder into `.blit/manifest.json`. */
interface ManifestEntry {
    /** File path relative to the project root. */
    path: string;
    /** Ownership class: kit-owned or shared files are checked; user-owned are skipped. */
    class: FileClass;
    /** SHA-256 hex digest of the file content as generated. */
    sha256: string;
}

/** The `.blit/manifest.json` root structure. */
interface BlitManifest {
    /** Kit version that created the project. */
    kitVersion: string;
    /** One entry per generated file. */
    files: ManifestEntry[];
}

/** SHA-256 hex digest of a file's current on-disk content. */
function sha256(filePath: string): string {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Check the project's `.blit/manifest.json` for drift.
 *
 * Drift = any kit-owned or shared file whose current on-disk hash differs from the hash recorded
 * when the file was generated. Missing files also count as drift.
 *
 * Returns the number of drifted files (0 means clean). All output is sent through `out` so the
 * caller controls where it goes.
 */
export function checkSyncDrift(root: string, out: (line: string) => void): number {
    const manifestPath = join(root, '.blit', 'manifest.json');

    if (!existsSync(manifestPath)) {
        out(ui.info('This project has no .blit/manifest.json.'));
        out(ui.info('Scaffold with `npm create blit-tech` to enable sync support.'));
        return 0;
    }

    let manifest: BlitManifest;

    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BlitManifest;
    } catch {
        out(ui.error('Could not read .blit/manifest.json. The file may be damaged.'));
        return 1;
    }

    const tracked = manifest.files.filter((e) => e.class === 'kit-owned' || e.class === 'shared');
    const missing: string[] = [];
    const modified: string[] = [];
    let unchanged = 0;

    for (const entry of tracked) {
        const absPath = join(root, entry.path);

        if (!existsSync(absPath)) {
            missing.push(entry.path);
            continue;
        }

        if (sha256(absPath) !== entry.sha256) {
            modified.push(entry.path);
        } else {
            unchanged++;
        }
    }

    const driftCount = missing.length + modified.length;

    if (driftCount === 0) {
        out(ui.success(`${unchanged} kit-managed file${unchanged === 1 ? '' : 's'} are up to date.`));
        return 0;
    }

    for (const path of modified) {
        out(ui.warn(`${path} has been changed since it was generated.`));
    }

    for (const path of missing) {
        out(ui.warn(`${path} is missing (it was generated but has since been deleted).`));
    }

    out('');
    out(
        ui.info(
            `${driftCount} file${driftCount === 1 ? '' : 's'} have drifted. Run \`npx blit agents sync\` to update them.`,
        ),
    );

    return driftCount;
}

export function runAgents(args: string[]): void {
    const sub = args[0] ?? '';
    const out = (line: string): void => {
        process.stdout.write(`${line}\n`);
    };

    if (sub === 'sync') {
        const isCheck = args.includes('--check');

        if (isCheck) {
            const root = findProjectRoot(process.cwd());

            if (!root) {
                out(ui.warn('No game found here. Run this inside your game folder.'));
                process.exitCode = 1;
                return;
            }

            const driftCount = checkSyncDrift(root, out);

            if (driftCount > 0) {
                process.exitCode = 1;
            }

            return;
        }

        // Full sync — merges managed regions and regenerates kit-owned files.
        out(ui.info('Updating AI-assistant files from the latest kit version.'));
        out(ui.info('Full sync arrives in a later version. Use `npx blit agents sync --check` to check for drift.'));
        return;
    }

    if (sub === 'add') {
        out(ui.info('Setting up files for a specific AI assistant arrives in a later version of Blit-Tech.'));
        out(ui.info('For now your game already has an AGENTS.md and a docs/ folder that any AI can read.'));
        return;
    }

    out('Usage: blit agents <sync [--check] | add>');
    out('');
    out(ui.info('sync --check  Report kit-managed files that have drifted (non-zero exit on drift).'));
    out(ui.info('sync          Update AI-assistant files from the latest kit version (coming soon).'));
    out(ui.info('add           Set up files for a specific AI assistant (coming soon).'));
}
