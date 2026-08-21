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
 *
 * `add <claude|cursor>` sets up the files for one AI assistant in a project that did not pick it at
 * scaffold time. It regenerates that assistant's adapter output from the installed kit, writes the new
 * files, and records them in the manifest (so later `sync` runs keep them fresh). It never clobbers an
 * existing file it does not already track: such a file is saved alongside as `<file>.new` instead.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
    agentsFile,
    collectDocs,
    generateClaudeAdapter,
    generateCursorAdapter,
    replaceManagedRegion,
} from '../adapters';
import { detectPackageManager, findProjectRoot, type PackageManager } from '../env';
import { kitRoot } from '../kit-root';
import { BASE_DIR, BLIT_DIR, MANIFEST_FILE, type ReadBlitManifest, type TemplateVars } from '../manifest';
import { ui } from '../messages';
import {
    AGENT_KINDS,
    AGENT_LABEL,
    type AgentKind,
    CLAUDE_MCP_JSON,
    classifyFile,
    CURSOR_MCP_JSON,
    hasAgentFiles,
    isKitManaged,
} from '../ownership';

/** JSON config paths eligible for structural (not text) merge in `runAddAgent`. */
const MERGEABLE_JSON_PATHS: readonly string[] = [CLAUDE_MCP_JSON, CURSOR_MCP_JSON];

/** SHA-256 hex digest of a string. */
function sha256Text(text: string): string {
    return createHash('sha256').update(text).digest('hex');
}

/** SHA-256 hex digest of a file's current on-disk content. */
function sha256(filePath: string): string {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

interface McpConfigLike {
    mcpServers?: Record<string, unknown>;
    [key: string]: unknown;
}

/** True for a plain JSON object – the only shape `mcpServers` is allowed to have. */
function isMcpServerMap(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge the kit's generated MCP config into a pre-existing hand-written one. Adds the kit's server(s)
 * under `mcpServers` next to whatever the user already registered. Returns null – not a crash – when
 * the existing file isn't a mergeable JSON object, its `mcpServers` isn't a plain object, or a server
 * key the kit wants to add already exists with different content: all three cases fall back to the
 * existing collision (`.new` + abort) path.
 */
function tryMergeMcpConfig(existingContent: string, generatedContent: string): string | null {
    let existing: McpConfigLike;

    try {
        existing = JSON.parse(existingContent) as McpConfigLike;
    } catch {
        return null;
    }

    if (!isMcpServerMap(existing)) {
        return null;
    }

    if (existing.mcpServers !== undefined && !isMcpServerMap(existing.mcpServers)) {
        return null;
    }

    const generated = JSON.parse(generatedContent) as McpConfigLike;
    const generatedServers = generated.mcpServers ?? {};
    const existingServers = existing.mcpServers ?? {};

    for (const [name, entry] of Object.entries(generatedServers)) {
        const existingEntry = existingServers[name];
        if (existingEntry !== undefined && !isDeepStrictEqual(existingEntry, entry)) {
            return null;
        }
    }

    const merged = { ...existing, mcpServers: { ...existingServers, ...generatedServers } };

    return `${JSON.stringify(merged, null, 2)}\n`;
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
    const manifestPath = join(root, BLIT_DIR, MANIFEST_FILE);

    if (hasSymlinkedSegment(manifestPath, root)) {
        out(ui.error('.blit/manifest.json is reached through a symlink and will not be read.'));
        return 1;
    }

    if (!existsSync(manifestPath)) {
        out(ui.info('This project has no .blit/manifest.json.'));
        out(ui.info('Scaffold with `npm create blit386` to enable sync support.'));
        return 0;
    }

    let manifest: ReadBlitManifest;

    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReadBlitManifest;
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

/**
 * True if `absPath` (assumed to resolve under `root`) is reached through a symlink at any existing
 * path segment – the file itself or any of its parent directories. Checked with `lstatSync`, which
 * does not follow symlinks, so a symlink pointing outside `root` (or to a file outside it) is caught
 * even when it resolves to something that exists. A segment that does not exist yet is not a symlink
 * and is treated as safe – the caller is about to create it, not read or write through it.
 */
function hasSymlinkedSegment(absPath: string, root: string): boolean {
    const rel = relative(root, absPath);

    if (rel === '' || rel.startsWith(`..${sep}`)) {
        return false;
    }

    let current = root;

    for (const segment of rel.split(sep)) {
        current = join(current, segment);

        let stat;

        try {
            stat = lstatSync(current);
        } catch {
            return false;
        }

        if (stat.isSymbolicLink()) {
            return true;
        }
    }

    return false;
}

/**
 * Reject manifest paths that are absolute, escape the project root via `..` segments, or are reached
 * through a symlink (the file itself or a parent directory) – lexical safety alone would still let a
 * symlink swapped in after scaffolding redirect a read or write outside the project.
 */
function isSafeRelPath(relPath: string, root: string): boolean {
    if (isAbsolute(relPath) || normalize(relPath).startsWith(`..${sep}`)) {
        return false;
    }

    const abs = resolve(root, relPath);

    if (abs !== root && !abs.startsWith(root + sep)) {
        return false;
    }

    return !hasSymlinkedSegment(abs, root);
}

/**
 * Default template vars when an older manifest did not record them.
 *
 * Only the package-manager commands, which is exactly the set `content/` substitutes – so a manifest
 * predating `vars` still regenerates byte-identical kit files once the package manager is detected.
 */
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

    const hasClaude = hasAgentFiles(manifest.files, 'claude');
    const hasCursor = hasAgentFiles(manifest.files, 'cursor');

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

/**
 * Write `content` to a project-relative path, creating parent directories as needed. Returns false
 * without writing anything if `relPath` is reached through a symlinked segment – the final path (not
 * just the `relPath` a caller may have validated earlier) is what matters, since a `.new` sidecar path
 * is never checked anywhere else before reaching here.
 */
function writeRel(root: string, relPath: string, content: string): boolean {
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
 * if `.blit/base/<relPath>` is reached through a symlink – `relPath` itself was already validated by
 * the caller, but the base copy lives at a different path and needs its own check.
 */
function writeBase(root: string, relPath: string, content: string, out: (line: string) => void): void {
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
    const manifestPath = join(root, BLIT_DIR, MANIFEST_FILE);

    if (hasSymlinkedSegment(manifestPath, root)) {
        out(ui.error('.blit/manifest.json is reached through a symlink and will not be read or written.'));
        return 1;
    }

    if (!existsSync(manifestPath)) {
        out(ui.info('This project has no .blit/manifest.json.'));
        out(ui.info('Scaffold with `npm create blit386` to enable sync support.'));
        return 0;
    }

    let manifest: ReadBlitManifest;

    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReadBlitManifest;
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
        const basePath = resolve(root, BLIT_DIR, BASE_DIR, relPath);
        // Checked once per file: the base copy lives at a different path than `relPath` itself (an
        // extra `.blit/base/` prefix), so it needs its own symlink check rather than inheriting the
        // `isSafeRelPath` check above.
        const baseSafe = !hasSymlinkedSegment(basePath, root);

        // New file the kit added since this project was scaffolded.
        if (!entry) {
            writeRel(root, relPath, incoming);
            writeBase(root, relPath, incoming, out);
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

    // Write the refreshed manifest, preserving createdAt and vars when present.
    const refreshed: ReadBlitManifest = {
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

/** Type guard: is `name` an assistant `add` knows how to set up? */
function isAddableAgent(name: string): name is AgentKind {
    return (AGENT_KINDS as readonly string[]).includes(name);
}

/** Result of reading the manifest: either the parsed manifest, or a friendly failure with an exit code. */
type ManifestResult = { ok: true; manifest: ReadBlitManifest } | { ok: false; exitCode: number };

/**
 * Read and validate `.blit/manifest.json`. Prints a Tier-1 line on failure.
 * A missing manifest is informational (exit 0); a damaged one is an error (exit 1).
 */
function readManifest(root: string, out: (line: string) => void): ManifestResult {
    const manifestPath = join(root, BLIT_DIR, MANIFEST_FILE);

    if (hasSymlinkedSegment(manifestPath, root)) {
        out(ui.error('.blit/manifest.json is reached through a symlink and will not be read or written.'));
        return { ok: false, exitCode: 1 };
    }

    if (!existsSync(manifestPath)) {
        out(ui.info('This project has no .blit/manifest.json.'));
        out(ui.info('Scaffold with `npm create blit386` to enable agent setup.'));
        return { ok: false, exitCode: 0 };
    }

    let manifest: ReadBlitManifest;

    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReadBlitManifest;
    } catch {
        out(ui.error('Could not read .blit/manifest.json. The file may be damaged.'));
        return { ok: false, exitCode: 1 };
    }

    if (!Array.isArray(manifest.files)) {
        out(ui.error('.blit/manifest.json is missing the files array. The manifest may be damaged.'));
        return { ok: false, exitCode: 1 };
    }

    return { ok: true, manifest };
}

/**
 * Set up one AI assistant's files in `root`. All-or-nothing: if any generated file would collide with
 * an existing untracked user file, nothing is written except `.new` copies and the manifest is left
 * untouched (so a later `sync` cannot clobber the user files). A generated path on the mergeable-JSON
 * allowlist (`.mcp.json`, `.cursor/mcp.json`) is the one exception: a clean structural merge with the
 * user's existing file is written and tracked like any other generated file instead of counting as a
 * collision. Returns the number of colliding files that need the user's attention; 0 means the
 * assistant was set up cleanly.
 */
function runAddAgent(root: string, agent: AgentKind, out: (line: string) => void): number {
    const result = readManifest(root, out);

    if (!result.ok) {
        return result.exitCode;
    }

    const manifest = result.manifest;
    const label = AGENT_LABEL[agent];

    if (hasAgentFiles(manifest.files, agent)) {
        out(ui.info(`${label} is already set up in this project.`));
        out(ui.info('Run `npx blit agents sync` to update its files from the latest kit.'));
        return 0;
    }

    const kr = kitRoot();
    const vars = manifest.vars ?? fallbackVars(root);

    const generated = agent === 'claude' ? generateClaudeAdapter(kr, vars) : generateCursorAdapter(kr, vars);
    const entryByPath = new Map(manifest.files.map((e) => [e.path, e] as const));

    // A generated path that already exists on disk but is not tracked in the manifest belongs to the
    // user. For an allowlisted JSON config (the MCP config files), try a structural merge first: the
    // kit's server can usually be added next to whatever the user already registered without touching
    // their entries. Only a real conflict (same server key, different content) or an existing file
    // that fails to parse as JSON falls through to the collision path below.
    const mergedPaths = new Set<string>();
    const preparedGenerated = generated.map((file) => {
        if (
            !MERGEABLE_JSON_PATHS.includes(file.path) ||
            !isSafeRelPath(file.path, root) ||
            !existsSync(resolve(root, file.path)) ||
            entryByPath.has(file.path)
        ) {
            return file;
        }

        const onDisk = readFileSync(resolve(root, file.path), 'utf8');
        const mergedContent = tryMergeMcpConfig(onDisk, file.content);

        if (mergedContent === null) {
            return file;
        }

        mergedPaths.add(file.path);

        return { ...file, content: mergedContent };
    });

    // Setting up the assistant must be all-or-nothing: if we wrote only the non-colliding files, the
    // assistant would be half-present, and a later `sync` would regenerate the colliding path, find no
    // manifest entry, and overwrite the very user file we are protecting here. So if anything still
    // collides after the merge attempt above, save the kit versions beside the originals and stop
    // without touching the project or the manifest.
    const collisions = preparedGenerated.filter(
        (file) =>
            isSafeRelPath(file.path, root) &&
            existsSync(resolve(root, file.path)) &&
            !entryByPath.has(file.path) &&
            !mergedPaths.has(file.path),
    );

    if (collisions.length > 0) {
        for (const file of collisions) {
            if (writeRel(root, `${file.path}.new`, file.content)) {
                out(ui.warn(`${file.path} already exists, so I saved the kit version as ${file.path}.new.`));
            } else {
                out(ui.warn(`Skipping unsafe path: ${file.path}.new`));
            }
        }

        out('');
        out(ui.info('I did not change those files or set up the assistant.'));
        out(ui.info('Move or merge the originals, then run the command again.'));

        return collisions.length;
    }

    // No collisions: every generated path is either new or an already-tracked kit file, so writing them
    // all and refreshing the manifest leaves the set consistent for the next `sync`.
    const kitVersion = currentKitVersion();
    const added: string[] = [];

    // Lock in the resolved vars so future syncs regenerate deterministically (older manifests lacked them).
    if (manifest.vars === undefined) {
        manifest.vars = vars;
    }

    for (const file of preparedGenerated) {
        const relPath = file.path;

        if (!isSafeRelPath(relPath, root)) {
            out(ui.warn(`Skipping unsafe path: ${relPath}`));
            continue;
        }

        writeRel(root, relPath, file.content);
        writeBase(root, relPath, file.content, out);
        entryByPath.set(relPath, {
            path: relPath,
            class: classifyFile(relPath),
            kitVersion,
            sha256: sha256Text(file.content),
        });
        added.push(relPath);
    }

    const refreshed: ReadBlitManifest = {
        kitVersion: manifest.kitVersion,
        files: [...entryByPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    };
    if (manifest.createdAt !== undefined) {
        refreshed.createdAt = manifest.createdAt;
    }
    if (manifest.vars !== undefined) {
        refreshed.vars = manifest.vars;
    }
    writeFileSync(join(root, BLIT_DIR, MANIFEST_FILE), `${JSON.stringify(refreshed, null, 2)}\n`);

    for (const path of added) {
        out(ui.success(mergedPaths.has(path) ? `Merged ${path}.` : `Added ${path}.`));
    }

    out('');
    if (added.length === 0) {
        out(ui.info(`There were no ${label} files to add.`));
        return 0;
    }

    out(ui.success(`Set up ${label}.`));
    out(ui.info('Run `npx blit agents sync` later to keep these files up to date.'));

    return 0;
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
        const name = args[1] ?? '';

        if (name === '') {
            out(ui.warn('Tell me which assistant to set up.'));
            out(ui.info('Try `npx blit agents add claude` or `npx blit agents add cursor`.'));
            process.exitCode = 1;
            return;
        }

        if (!isAddableAgent(name)) {
            out(ui.warn(`I do not know the assistant "${name}".`));
            out(ui.info(`You can set up: ${AGENT_KINDS.join(', ')}.`));
            process.exitCode = 1;
            return;
        }

        const root = findProjectRoot(process.cwd());

        if (!root) {
            out(ui.warn('No game found here. Run this inside your game folder.'));
            process.exitCode = 1;
            return;
        }

        out(ui.info(`Setting up ${AGENT_LABEL[name]} files from the kit.`));
        out('');
        const needReview = runAddAgent(root, name, out);

        if (needReview > 0) {
            process.exitCode = 1;
        }

        return;
    }

    out('Usage: blit agents <sync [--check] [--force [path...]] | add <claude|cursor>>');
    out('');
    out(ui.info('sync --check       Report kit-managed files that have drifted (non-zero exit on drift).'));
    out(ui.info('sync               Update AI-assistant files from the latest kit version.'));
    out(ui.info('sync --force       Overwrite your edits with the kit version (optionally name files).'));
    out(ui.info('add <claude|cursor>  Set up files for one AI assistant in this project.'));
}
