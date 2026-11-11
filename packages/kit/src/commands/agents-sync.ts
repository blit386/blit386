/**
 * `blit agents sync`: the drift report (`--check`, also run by `blit doctor`) and the write path that regenerates kit
 * files and reconciles them with the user's edits. The file helpers here (`writeRel`, `writeBase`, `writeManifest`,
 * `fallbackVars`) are shared with `agents-add.ts`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { agentsFile, collectDocs, generateAgentFiles, readKitVersion, replaceManagedRegion } from '../adapters';
import { detectPackageManager, type PackageManager } from '../env';
import { hasSymlinkedSegment, isSafeRelPath, sha256, sha256Text } from '../fs-safety';
import { kitRoot } from '../kit-root';
import { BASE_DIR, BLIT_DIR, MANIFEST_FILE, type ReadBlitManifest, type TemplateVars } from '../manifest';
import { ui } from '../messages';
import { AGENT_KINDS, classifyFile, hasAgentFiles, isKitManaged } from '../ownership';
import { readManifest } from '../read-manifest';

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
    const result = readManifest(root, out, 'enable sync support');

    if (!result.ok) {
        return result.exitCode;
    }

    const manifest = result.manifest;

    const tracked = manifest.files.filter((e) => isKitManaged(e.class));
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
        out(ui.success(`${unchanged} kit-managed ${unchanged === 1 ? 'file is' : 'files are'} up to date.`));
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
            `${driftCount} ${driftCount === 1 ? 'file has' : 'files have'} drifted. Run \`npx blit agents sync\` to update them.`,
        ),
    );

    return driftCount;
}

/**
 * Default template vars when an older manifest did not record them.
 *
 * Only the package-manager commands, which is exactly the set `content/` substitutes - so a manifest
 * predating `vars` still regenerates byte-identical kit files once the package manager is detected.
 */
export function fallbackVars(root: string): TemplateVars {
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

/**
 * Recompute every file the installed kit would emit for this project, keyed by project-relative path.
 *
 * Always includes AGENTS.md and docs/. Includes an assistant's adapter output only when the manifest
 * shows the project already uses that assistant, plus the shared skills folder while any of them reads it.
 */
function regenerate(manifest: ReadBlitManifest, root: string): Map<string, string> {
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

    const present = AGENT_KINDS.filter((agent) => hasAgentFiles(manifest.files, agent));

    for (const file of generateAgentFiles(kr, vars, present)) {
        map.set(file.path, file.content);
    }

    return map;
}

/**
 * Write `content` to a project-relative path, creating parent directories as needed. Returns false
 * without writing anything if `relPath` is reached through a symlinked segment - the final path (not
 * just the `relPath` a caller may have validated earlier) is what matters, since a `.new` sidecar path
 * is never checked anywhere else before reaching here.
 */
export function writeRel(root: string, relPath: string, content: string): boolean {
    const abs = resolve(root, relPath);

    if (hasSymlinkedSegment(abs, root)) {
        return false;
    }

    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);

    return true;
}

/**
 * Update (or create) the pristine base copy used as the merge ancestor. Skips the write (and warns)
 * if `.blit/base/<relPath>` is reached through a symlink - `relPath` itself was already validated by
 * the caller, but the base copy lives at a different path and needs its own check.
 */
export function writeBase(root: string, relPath: string, content: string, out: (line: string) => void): void {
    const baseRelPath = join(BLIT_DIR, BASE_DIR, relPath);

    if (!writeRel(root, baseRelPath, content)) {
        out(ui.warn(`Skipping unsafe base path: ${baseRelPath}`));
    }
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

/**
 * Write the refreshed `.blit/manifest.json`: `kitVersion`, the entries sorted by path for stable diffs, and `createdAt`
 * and `vars` carried over when the manifest that was read had them.
 */
export function writeManifest(
    root: string,
    manifest: ReadBlitManifest,
    kitVersion: string,
    entries: Iterable<ReadBlitManifest['files'][number]>,
): void {
    const refreshed: ReadBlitManifest = {
        kitVersion,
        files: [...entries].sort((a, b) => a.path.localeCompare(b.path)),
    };
    if (manifest.createdAt !== undefined) {
        refreshed.createdAt = manifest.createdAt;
    }
    if (manifest.vars !== undefined) {
        refreshed.vars = manifest.vars;
    }
    writeFileSync(join(root, BLIT_DIR, MANIFEST_FILE), `${JSON.stringify(refreshed, null, 2)}\n`);
}

/** Running tally of what the sync did, printed as a Tier-1 summary at the end. */
interface SyncTally {
    updated: string[];
    merged: string[];
    restored: string[];
    added: string[];
    review: string[];
    /** Untracked files already on disk at a path the kit newly ships; the kit version went to `.new`. */
    collided: { path: string; sidecarSaved: boolean }[];
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
    const result = readManifest(root, out, 'enable sync support');

    if (!result.ok) {
        return result.exitCode;
    }

    const manifest = result.manifest;

    const regenerated = regenerate(manifest, root);
    const entryByPath = new Map(manifest.files.map((e) => [e.path, e] as const));
    const newKitVersion = readKitVersion(kitRoot());

    const tally: SyncTally = {
        updated: [],
        merged: [],
        restored: [],
        added: [],
        review: [],
        collided: [],
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

        // User-owned adapter output (`.claude/launch.json`): the user, the desktop app, and other tools
        // all write into it, so the kit only fills the gap when the file is missing. An existing file,
        // tracked or not, is never read, merged, forced, or given a `.new` copy, and has no base copy.
        if (classifyFile(relPath) === 'user-owned') {
            if (!existsSync(abs) && writeRel(root, relPath, incoming)) {
                entryByPath.set(relPath, {
                    path: relPath,
                    class: 'user-owned',
                    kitVersion: newKitVersion,
                    sha256: sha256Text(incoming),
                });
                (entry ? tally.restored : tally.added).push(relPath);
            }
            continue;
        }

        const basePath = resolve(root, BLIT_DIR, BASE_DIR, relPath);
        // Checked once per file: the base copy lives at a different path than `relPath` itself (an
        // extra `.blit/base/` prefix), so it needs its own symlink check rather than inheriting the
        // `isSafeRelPath` check above.
        const baseSafe = !hasSymlinkedSegment(basePath, root);

        // New file the kit added since this project was scaffolded.
        if (!entry) {
            const existed = existsSync(abs);

            // An untracked file already sits at this path (e.g. a hand-written skill that a later kit
            // now ships under the same name). Never overwrite it - git cannot bring it back. Save the
            // kit version alongside and leave the path untracked until the user resolves it.
            if (existed && readFileSync(abs, 'utf8') !== incoming) {
                // Counted even when the sidecar cannot be written: the collision is unresolved either way.
                let sidecarSaved = false;
                try {
                    sidecarSaved = writeRel(root, `${relPath}.new`, incoming);
                    if (!sidecarSaved) {
                        out(ui.warn(`Skipping unsafe path: ${relPath}.new`));
                    }
                } catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);
                    out(ui.warn(`Could not save ${relPath}.new (${reason}).`));
                }
                tally.collided.push({ path: relPath, sidecarSaved });
                continue;
            }

            // Missing, or already byte-identical to the kit version: write (if needed) and adopt it.
            if (!existed) {
                writeRel(root, relPath, incoming);
            }
            writeBase(root, relPath, incoming, out);
            entryByPath.set(relPath, {
                path: relPath,
                class: classifyFile(relPath),
                kitVersion: newKitVersion,
                sha256: sha256Text(incoming),
            });
            if (existed) {
                tally.unchanged++;
            } else {
                tally.added.push(relPath);
            }
            continue;
        }

        const incomingHash = sha256Text(incoming);

        // Missing on disk: restore the kit version.
        if (!existsSync(abs)) {
            writeRel(root, relPath, incoming);
            writeBase(root, relPath, incoming, out);
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
            writeBase(root, relPath, incoming, out);
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
                writeBase(root, relPath, incoming, out);
                entry.sha256 = sha256Text(merged);
                entry.kitVersion = newKitVersion;
                continue;
            }

            // Managed markers were removed: save the kit version alongside for the user to reconcile.
            if (writeRel(root, `${relPath}.new`, incoming)) {
                tally.review.push(relPath);
            } else {
                out(ui.warn(`Skipping unsafe path: ${relPath}.new`));
            }
            continue;
        }

        // Whether the user changed this file is measured against the pristine kit version from the last
        // sync (the merge ancestor in .blit/base/), NOT entry.sha256. entry.sha256 records the reconciled
        // on-disk content so `--check`/doctor do not flag a clean-merged file as drift. Older projects may
        // lack a base copy; fall back to entry.sha256 there.
        const baseHash = baseSafe && existsSync(basePath) ? sha256(basePath) : entry.sha256;

        // Kit-owned, unchanged from the pristine kit version: adopt the new kit version freely.
        if (diskHash === baseHash) {
            if (diskHash !== incomingHash) {
                writeRel(root, relPath, incoming);
                writeBase(root, relPath, incoming, out);
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
            const merged = baseSafe ? gitThreeWayMerge(onDisk, basePath, incoming) : null;

            if (merged !== null) {
                if (merged !== onDisk) {
                    writeRel(root, relPath, merged);
                    tally.merged.push(relPath);
                } else {
                    tally.unchanged++;
                }
                // The base copy keeps the kit-generated version as the merge ancestor (so the next sync
                // still detects the user's edits and re-merges them). entry.sha256 records the reconciled
                // on-disk content instead, so `--check` treats this clean-merged file as in-sync rather
                // than flagging it as drift forever.
                writeBase(root, relPath, incoming, out);
                entry.sha256 = sha256Text(merged);
                entry.kitVersion = newKitVersion;
                continue;
            }
        }

        // No clean merge: save the kit version alongside and keep the user's file.
        if (writeRel(root, `${relPath}.new`, incoming)) {
            tally.review.push(relPath);
        } else {
            out(ui.warn(`Skipping unsafe path: ${relPath}.new`));
        }
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

    writeManifest(root, manifest, newKitVersion, entryByPath.values());

    printSummary(out, tally);

    return tally.review.length + tally.collided.length;
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
    for (const { path, sidecarSaved } of tally.collided) {
        if (sidecarSaved) {
            out(ui.warn(`${path} already exists, so I saved the kit version as ${path}.new.`));
            out(
                ui.info(
                    'Compare the two and keep what you like. Sync tracks the file once it matches the kit version.',
                ),
            );
        } else {
            out(ui.warn(`${path} already exists, so I left it alone. The kit version could not be saved next to it.`));
        }
    }
    for (const path of tally.orphaned) {
        out(ui.info(`${path} is no longer part of the kit. You can delete it if you do not need it.`));
    }

    const changed = tally.updated.length + tally.merged.length + tally.restored.length + tally.added.length;

    out('');
    const needEyes = tally.review.length + tally.collided.length;

    if (changed === 0 && needEyes === 0) {
        out(ui.success('Everything is already up to date.'));
        return;
    }

    const parts = [`${changed} updated`, `${tally.unchanged} unchanged`];
    if (needEyes > 0) {
        parts.push(`${needEyes} need your eyes`);
    }
    out(ui.info(parts.join(', ')));
}
