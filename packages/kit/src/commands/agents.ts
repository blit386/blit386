/**
 * `blit agents <add|sync>` - manage AI-assistant files from the kit's canonical content.
 *
 * `sync --check` is report-only: reads `.blit/manifest.json`, computes current SHA-256 hashes
 * for kit-owned and shared files, and reports any that have drifted from their generated state.
 * Exits non-zero when drift is found so it is safe to use in CI and inside `blit doctor`.
 *
 * `sync` (no flag) is the write path: it regenerates what the installed kit would emit, then
 * applies the ownership model (section 4.10 of the design doc) to update the project without
 * clobbering user edits:
 *   - kit-owned files the user has not touched are overwritten;
 *   - shared files (AGENTS.md, CLAUDE.md) get only their managed region rewritten;
 *   - kit-owned files the user edited are three-way merged when git is available, otherwise saved
 *     alongside as `<file>.new`;
 *   - user-owned files are never touched.
 * `--force [path...]` overwrites the named files (or all kit-managed files) with the kit version.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';

import {
    agentsFile,
    collectDocs,
    generateClaudeAdapter,
    generateCursorAdapter,
    kitRoot,
    replaceManagedRegion,
    type TemplateVars,
} from '../adapters';
import { detectPackageManager, findProjectRoot, type PackageManager } from '../env';
import { ui } from '../messages';

type FileClass = 'kit-owned' | 'shared' | 'user-owned';

/** One entry as written by the scaffolder into `.blit/manifest.json`. */
interface ManifestEntry {
    /** File path relative to the project root. */
    path: string;
    /** Ownership class: kit-owned or shared files are checked; user-owned are skipped. */
    class: FileClass;
    /** Kit version that last wrote this file. */
    kitVersion?: string;
    /** SHA-256 hex digest of the file content as generated. */
    sha256: string;
}

/** The `.blit/manifest.json` root structure. */
interface BlitManifest {
    /** Kit version that created the project. */
    kitVersion: string;
    /** ISO-8601 creation timestamp. */
    createdAt?: string;
    /** Template variables captured at scaffold time, used to regenerate kit files deterministically. */
    vars?: TemplateVars;
    /** One entry per generated file. */
    files: ManifestEntry[];
}

/** SHA-256 hex digest of a string. */
function sha256Text(text: string): string {
    return createHash('sha256').update(text).digest('hex');
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

    if (!Array.isArray(manifest.files)) {
        out(
            ui.error(
                '.blit/manifest.json is missing the files array. The manifest may be damaged or from an older version.',
            ),
        );
        return 1;
    }

    const tracked = manifest.files.filter((e) => e.class === 'kit-owned' || e.class === 'shared');
    const missing: string[] = [];
    const modified: string[] = [];
    let unchanged = 0;

    for (const entry of tracked) {
        if (!isSafeRelPath(entry.path, root)) {
            out(ui.warn(`Skipping unsafe manifest path: ${entry.path}`));
            continue;
        }

        const absPath = resolve(root, entry.path);

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

/** Reject manifest paths that are absolute or escape the project root via `..` segments. */
function isSafeRelPath(relPath: string, root: string): boolean {
    if (isAbsolute(relPath) || normalize(relPath).startsWith(`..${sep}`)) {
        return false;
    }

    const abs = resolve(root, relPath);

    return abs === root || abs.startsWith(root + sep);
}

/**
 * Classify a file by its project-relative path. Mirrors the scaffolder's `classifyFile` so newly
 * shipped kit files land in the same ownership class they would have at scaffold time.
 */
function classifyFile(relPath: string): FileClass {
    const normalized = relPath.replace(/\\/g, '/');

    if (normalized === 'AGENTS.md' || normalized === 'CLAUDE.md') {
        return 'shared';
    }

    if (
        normalized.startsWith('docs/') ||
        normalized.startsWith('.cursor/rules/') ||
        normalized.startsWith('.cursor/hooks/') ||
        normalized.startsWith('.cursor/commands/') ||
        normalized === '.cursor/hooks.json' ||
        normalized.startsWith('.claude/skills/') ||
        normalized.startsWith('.claude/rules/') ||
        normalized === '.claude/settings.json'
    ) {
        return 'kit-owned';
    }

    return 'user-owned';
}

/** Default template vars when an older manifest did not record them (npm commands, project name). */
function fallbackVars(root: string): TemplateVars {
    const pm: PackageManager = detectPackageManager(root);
    const runPrefix = pm === 'yarn' ? `${pm} ` : `${pm} run `;

    return {
        pmInstall: pm === 'yarn' ? 'yarn' : `${pm} install`,
        pmRunDev: `${runPrefix}dev`,
        pmRunBuild: `${runPrefix}build`,
        pmRunFormat: `${runPrefix}format`,
        pmRunLint: `${runPrefix}lint`,
    };
}

/** Read the installed kit's own version, for stamping the refreshed manifest. */
function currentKitVersion(): string {
    try {
        const pkg = JSON.parse(readFileSync(join(kitRoot(), 'package.json'), 'utf8')) as { version?: string };
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
}

/**
 * Recompute every file the installed kit would emit for this project, keyed by project-relative path.
 *
 * Always includes AGENTS.md and docs/. Includes the Claude or Cursor adapter outputs only when the
 * manifest shows the project already uses that assistant.
 */
function regenerate(manifest: BlitManifest, root: string): Map<string, string> {
    const kr = kitRoot();
    const vars = manifest.vars ?? fallbackVars(root);

    // Lock the resolved vars into the manifest the first time we have to fall back. Without this a
    // project scaffolded before vars were tracked would re-detect the package manager on every sync.
    if (manifest.vars === undefined) {
        manifest.vars = vars;
    }

    const map = new Map<string, string>();

    const agents = agentsFile(kr);
    map.set(agents.path, agents.content);

    for (const doc of collectDocs(kr)) {
        map.set(doc.path, doc.content);
    }

    const hasClaude = manifest.files.some((f) => f.path === 'CLAUDE.md' || f.path.startsWith('.claude/'));
    const hasCursor = manifest.files.some((f) => f.path.startsWith('.cursor/'));

    if (hasClaude) {
        for (const file of generateClaudeAdapter(kr, vars)) {
            map.set(file.path, file.content);
        }
    }

    if (hasCursor) {
        for (const file of generateCursorAdapter(kr, vars)) {
            map.set(file.path, file.content);
        }
    }

    return map;
}

/** Write `content` to a project-relative path, creating parent directories as needed. */
function writeRel(root: string, relPath: string, content: string): void {
    const abs = resolve(root, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
}

/** Update (or create) the pristine base copy used as the merge ancestor. */
function writeBase(root: string, relPath: string, content: string): void {
    writeRel(root, join('.blit', 'base', relPath), content);
}

/**
 * Three-way merge using git. `current` is the user's edited file, `base` the pristine ancestor,
 * and `incoming` the freshly regenerated content. Returns the merged text on a clean merge, or null
 * when git is unavailable, the base is missing, or the merge has conflicts.
 */
function gitThreeWayMerge(current: string, basePath: string, incoming: string): string | null {
    if (!existsSync(basePath)) {
        return null;
    }

    const scratch = mkdtempSync(join(tmpdir(), 'blit-merge-'));

    try {
        const currentPath = join(scratch, 'current');
        const incomingPath = join(scratch, 'incoming');
        writeFileSync(currentPath, current);
        writeFileSync(incomingPath, incoming);

        const result = spawnSync('git', ['merge-file', '-p', currentPath, basePath, incomingPath], {
            encoding: 'utf8',
        });

        // status 0 = clean merge; >0 = conflicts; null/error = git missing or failed.
        if (result.status === 0 && typeof result.stdout === 'string') {
            return result.stdout;
        }

        return null;
    } catch {
        return null;
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

/** Running tally of what the sync did, printed as a Tier-1 summary at the end. */
interface SyncTally {
    updated: string[];
    merged: string[];
    restored: string[];
    added: string[];
    review: string[];
    orphaned: string[];
    unchanged: number;
}

/**
 * Run a full sync against `root`. Returns the number of files that need the user's attention
 * (conflict `.new` copies); 0 means everything resolved cleanly.
 */
export function runFullSync(
    root: string,
    out: (line: string) => void,
    options: { force: boolean; forcePaths: string[] } = { force: false, forcePaths: [] },
): number {
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

    if (!Array.isArray(manifest.files)) {
        out(ui.error('.blit/manifest.json is missing the files array. The manifest may be damaged.'));
        return 1;
    }

    const regenerated = regenerate(manifest, root);
    const entryByPath = new Map(manifest.files.map((e) => [e.path, e] as const));
    const newKitVersion = currentKitVersion();

    const tally: SyncTally = {
        updated: [],
        merged: [],
        restored: [],
        added: [],
        review: [],
        orphaned: [],
        unchanged: 0,
    };

    // Forced paths normalize to forward slashes to match manifest/regeneration keys.
    const forcedSet = new Set(options.forcePaths.map((p) => p.replace(/\\/g, '/')));
    const isForced = (relPath: string): boolean => options.force && (forcedSet.size === 0 || forcedSet.has(relPath));

    // Pass 1: every file the new kit wants to emit.
    for (const [relPath, incoming] of regenerated) {
        if (!isSafeRelPath(relPath, root)) {
            out(ui.warn(`Skipping unsafe path: ${relPath}`));
            continue;
        }

        const entry = entryByPath.get(relPath);
        const abs = resolve(root, relPath);
        const basePath = resolve(root, '.blit', 'base', relPath);

        // New file the kit added since this project was scaffolded.
        if (!entry) {
            writeRel(root, relPath, incoming);
            writeBase(root, relPath, incoming);
            entryByPath.set(relPath, {
                path: relPath,
                class: classifyFile(relPath),
                kitVersion: newKitVersion,
                sha256: sha256Text(incoming),
            });
            tally.added.push(relPath);
            continue;
        }

        const incomingHash = sha256Text(incoming);

        // Missing on disk: restore the kit version.
        if (!existsSync(abs)) {
            writeRel(root, relPath, incoming);
            writeBase(root, relPath, incoming);
            entry.sha256 = incomingHash;
            entry.kitVersion = newKitVersion;
            tally.restored.push(relPath);
            continue;
        }

        const onDisk = readFileSync(abs, 'utf8');
        const diskHash = sha256Text(onDisk);

        // Forced: clobber with the kit version regardless of user edits.
        if (isForced(relPath)) {
            if (diskHash !== incomingHash) {
                writeRel(root, relPath, incoming);
                tally.updated.push(relPath);
            } else {
                tally.unchanged++;
            }
            writeBase(root, relPath, incoming);
            entry.sha256 = incomingHash;
            entry.kitVersion = newKitVersion;
            continue;
        }

        // Shared files (AGENTS.md, CLAUDE.md): only the managed region is kit-owned, everything around
        // it belongs to the user. Always refresh just that region and keep the rest, whether or not the
        // file changed since the last sync. This runs before the kit-owned fast paths below so the user's
        // surrounding notes are never overwritten wholesale.
        if (entry.class === 'shared') {
            const merged = replaceManagedRegion(onDisk, incoming);

            if (merged !== null) {
                if (merged !== onDisk) {
                    writeRel(root, relPath, merged);
                    tally.merged.push(relPath);
                } else {
                    tally.unchanged++;
                }
                // entry.sha256 tracks the reconciled on-disk content so `--check` treats a preserved
                // note as in-sync; the base copy keeps the kit version as the merge ancestor.
                writeBase(root, relPath, incoming);
                entry.sha256 = sha256Text(merged);
                entry.kitVersion = newKitVersion;
                continue;
            }

            // Managed markers were removed: save the kit version alongside for the user to reconcile.
            writeRel(root, `${relPath}.new`, incoming);
            tally.review.push(relPath);
            continue;
        }

        // Kit-owned, unmodified by the user: overwrite freely.
        if (diskHash === entry.sha256) {
            if (diskHash !== incomingHash) {
                writeRel(root, relPath, incoming);
                writeBase(root, relPath, incoming);
                entry.sha256 = incomingHash;
                entry.kitVersion = newKitVersion;
                tally.updated.push(relPath);
            } else {
                tally.unchanged++;
            }
            continue;
        }

        // Kit-owned, user-modified: try a real three-way merge; clean merges apply.
        {
            const merged = gitThreeWayMerge(onDisk, basePath, incoming);

            if (merged !== null) {
                if (merged !== onDisk) {
                    writeRel(root, relPath, merged);
                    tally.merged.push(relPath);
                } else {
                    tally.unchanged++;
                }
                // Keep the kit-generated version as the baseline/ancestor, not the merged result.
                // The merged file carries the user's edits; recording it as the baseline would make
                // the next sync treat those edits as the kit default and overwrite them.
                writeBase(root, relPath, incoming);
                entry.sha256 = incomingHash;
                entry.kitVersion = newKitVersion;
                continue;
            }
        }

        // No clean merge: save the kit version alongside and keep the user's file.
        writeRel(root, `${relPath}.new`, incoming);
        tally.review.push(relPath);
    }

    // Pass 2: files the manifest tracks that the new kit no longer ships.
    // Drop them from the tracked set so the refreshed manifest stops carrying stale entries.
    for (const entry of manifest.files) {
        if (entry.class === 'user-owned' || regenerated.has(entry.path)) {
            continue;
        }
        tally.orphaned.push(entry.path);
        entryByPath.delete(entry.path);
    }

    // Write the refreshed manifest, preserving createdAt and vars when present.
    const refreshed: BlitManifest = {
        kitVersion: newKitVersion,
        files: [...entryByPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    };
    if (manifest.createdAt !== undefined) {
        refreshed.createdAt = manifest.createdAt;
    }
    if (manifest.vars !== undefined) {
        refreshed.vars = manifest.vars;
    }
    writeFileSync(manifestPath, `${JSON.stringify(refreshed, null, 2)}\n`);

    printSummary(out, tally);

    return tally.review.length;
}

/** Print the Tier-1 voice summary of a sync run. */
function printSummary(out: (line: string) => void, tally: SyncTally): void {
    for (const path of tally.updated) {
        out(ui.success(`Updated ${path}.`));
    }
    for (const path of tally.merged) {
        out(ui.success(`Merged kit changes into ${path}, keeping your edits.`));
    }
    for (const path of tally.restored) {
        out(ui.success(`Restored ${path} (it was missing).`));
    }
    for (const path of tally.added) {
        out(ui.success(`Added ${path} (new in this kit).`));
    }
    for (const path of tally.review) {
        out(ui.warn(`You changed ${path}, so I saved the kit version as ${path}.new.`));
        out(ui.info('Compare the two and keep what you like.'));
    }
    for (const path of tally.orphaned) {
        out(ui.info(`${path} is no longer part of the kit. You can delete it if you do not need it.`));
    }

    const changed = tally.updated.length + tally.merged.length + tally.restored.length + tally.added.length;

    out('');
    if (changed === 0 && tally.review.length === 0) {
        out(ui.success('Everything is already up to date.'));
        return;
    }

    const parts = [`${changed} updated`, `${tally.unchanged} unchanged`];
    if (tally.review.length > 0) {
        parts.push(`${tally.review.length} need your eyes`);
    }
    out(ui.info(parts.join(', ')));
}

export function runAgents(args: string[]): void {
    const sub = args[0] ?? '';
    const out = (line: string): void => {
        process.stdout.write(`${line}\n`);
    };

    if (sub === 'sync') {
        const root = findProjectRoot(process.cwd());

        if (!root) {
            out(ui.warn('No game found here. Run this inside your game folder.'));
            process.exitCode = 1;
            return;
        }

        if (args.includes('--check')) {
            const driftCount = checkSyncDrift(root, out);

            if (driftCount > 0) {
                process.exitCode = 1;
            }

            return;
        }

        const force = args.includes('--force');
        const forcePaths = args.slice(1).filter((a) => !a.startsWith('-'));

        out(ui.info('Updating AI-assistant files from the latest kit version.'));
        out('');
        const needReview = runFullSync(root, out, { force, forcePaths });

        if (needReview > 0) {
            process.exitCode = 1;
        }

        return;
    }

    if (sub === 'add') {
        out(ui.info('Setting up files for a specific AI assistant arrives in a later version of Blit-Tech.'));
        out(ui.info('For now your game already has an AGENTS.md and a docs/ folder that any AI can read.'));
        return;
    }

    out('Usage: blit agents <sync [--check] [--force [path...]] | add>');
    out('');
    out(ui.info('sync --check  Report kit-managed files that have drifted (non-zero exit on drift).'));
    out(ui.info('sync          Update AI-assistant files from the latest kit version.'));
    out(ui.info('sync --force  Overwrite your edits with the kit version (optionally name files).'));
    out(ui.info('add           Set up files for a specific AI assistant (coming soon).'));
}
