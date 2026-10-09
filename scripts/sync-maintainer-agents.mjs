#!/usr/bin/env node
/**
 * Generate the monorepo's own Antigravity, Codex, Gemini CLI, Copilot, and OpenCode
 * hook/MCP config from the kit adapters.
 *
 * This is the dogfood counterpart of `sync-cursor-commands.mjs`: the kit's
 * `generate*Adapter` builders already know each agent's dialect (Gemini `httpUrl`,
 * Antigravity `serverUrl`, Codex's unknown-key ban, Copilot's bash+powershell pair,
 * OpenCode `type: "remote"`). Calling those builders here means a dialect regression
 * fails this script's `--check` instead of shipping unnoticed.
 *
 * Do not run `blit agents add` against the repo root. The kit's `content/` is the
 * generated-game persona (beginner guides, game-author skills), not this repo's
 * maintainer skills - a straight add would overwrite the wrong things. Claude,
 * Cursor, and Zed stay hand-maintained: their trees already diverge from kit output
 * (rtk hooks, monorepo session bootstrap, richer Zed settings).
 *
 * Hook scripts whose bytes match `packages/kit/content/hooks/` are installed as
 * symlinks (same arrangement as `.cursor/hooks/shell-safety.cjs`). Rendered files
 * such as `.opencode/plugins/kit-guard.ts` are written as regular files.
 *
 * Skipped from the Copilot adapter: root `.mcp.json` (already owned by
 * `findProjectMcpFailures`) and `.github/workflows/copilot-setup-steps.yml` (the
 * generated-game sandbox workflow; this repo has its own Actions).
 *
 * Usage:
 *   node scripts/sync-maintainer-agents.mjs            # write files (local + pre-commit)
 *   node scripts/sync-maintainer-agents.mjs --check    # report drift, write nothing, exit 1 (CI)
 */
import { spawnSync } from 'node:child_process';
import {
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readlinkSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildKitBuildCommand, isKitBuilt } from './ensure-kit-built.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT_ROOT = join(ROOT, 'packages', 'kit');
const KIT_HOOKS_DIR = join(KIT_ROOT, 'content', 'hooks');
const KIT_HOOKS_DIR_REL = 'packages/kit/content/hooks';

/**
 * Paths the Copilot adapter emits that this repo already owns for another reason.
 * MANUAL-SYNC HAZARD: these literals also live in `packages/kit/src/ownership.ts`
 * (`ROOT_MCP_JSON`, `COPILOT_SETUP_STEPS_YML`) - rename both sides together.
 */
export const SKIP_PATHS = new Set(['.mcp.json', '.github/workflows/copilot-setup-steps.yml']);

/**
 * Directories whose entire contents this script owns (orphans are removed). Exact
 * files outside these dirs are listed in {@link OWNED_EXACT_FILES}.
 * MANUAL-SYNC HAZARD: prefixes match `packages/kit/src/ownership.ts` path constants.
 */
export const OWNED_DIRS = ['.agents/hooks/', '.codex/hooks/', '.gemini/hooks/', '.github/hooks/', '.opencode/hooks/'];

/** Exact files this script owns that do not live under {@link OWNED_DIRS}. */
export const OWNED_EXACT_FILES = [
    '.agents/hooks.json',
    '.agents/mcp_config.json',
    '.codex/config.toml',
    '.codex/hooks.json',
    '.gemini/settings.json',
    'opencode.json',
    '.opencode/plugins/kit-guard.ts',
];

/** The only template var the five adapters render into hook/MCP output. */
export const MAINTAINER_TEMPLATE_VARS = { pmInstall: 'pnpm install' };

/**
 * @typedef {'write' | 'symlink'} MaintainerEntryKind
 * @typedef {{ path: string, kind: MaintainerEntryKind, content?: string, linkTarget?: string }} MaintainerEntry
 */

/**
 * Basename of a kit hook script to symlink when adapter bytes match the kit copy
 * verbatim; otherwise `null` (write a regular file). Rendered outputs never match.
 *
 * @param {string} relPath Project-relative destination path (forward slashes).
 * @param {string} content Bytes the adapter would write at `relPath`.
 * @param {(name: string) => string | null} readKitHookContents Returns kit
 *   contents by basename, or `null` when that basename is absent.
 * @returns {string | null}
 */
export function symlinkHookBasename(relPath, content, readKitHookContents) {
    // Kit hook scripts are only `.cjs` / `.sh` under an agent's `hooks/` directory.
    // Settings, TOML, and rendered TypeScript (kit-guard) are always written.
    const match = /\/hooks\/([^/]+\.(?:cjs|sh))$/u.exec(relPath);

    if (!match) {
        return null;
    }

    const basename = match[1];
    const kitContents = readKitHookContents(basename);

    return kitContents !== null && kitContents === content ? basename : null;
}

/**
 * Relative symlink target from a project-relative destination to the kit hook script.
 *
 * @param {string} destRelPath Project-relative path of the symlink (forward slashes).
 * @param {string} basename Hook script basename.
 * @returns {string} Relative path using forward slashes (portable for git).
 */
export function kitHookLinkTarget(destRelPath, basename) {
    const destDir = dirname(destRelPath.split('/').join(sep));
    const targetAbs = join(KIT_HOOKS_DIR_REL.split('/').join(sep), basename);
    const rel = relative(destDir, targetAbs);

    return rel.split(sep).join('/');
}

/**
 * Filters adapter output and classifies each kept file as a write or a symlink.
 *
 * @param {Array<{ path: string, content: string }>} generatedFiles Adapter output.
 * @param {(name: string) => string | null} readKitHookContents Kit hook reader.
 * @returns {MaintainerEntry[]} Sorted by path.
 */
export function planMaintainerEntries(generatedFiles, readKitHookContents) {
    /** @type {MaintainerEntry[]} */
    const entries = [];

    for (const file of generatedFiles) {
        if (SKIP_PATHS.has(file.path)) {
            continue;
        }

        const symlinkBasename = symlinkHookBasename(file.path, file.content, readKitHookContents);

        if (symlinkBasename !== null) {
            entries.push({
                path: file.path,
                kind: 'symlink',
                linkTarget: kitHookLinkTarget(file.path, symlinkBasename),
            });
            continue;
        }

        entries.push({ path: file.path, kind: 'write', content: file.content });
    }

    return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Project-relative paths under `dirRel` (trailing slash) that are not in `expected`.
 *
 * @param {string[]} existingRelPaths Paths currently on disk under the owned surface.
 * @param {Set<string>} expected Paths the plan will install.
 * @param {string[]} ownedDirs Directory prefixes (trailing slash).
 * @param {string[]} ownedExact Exact owned file paths.
 * @returns {string[]} Sorted orphan paths.
 */
export function findOrphanMaintainerPaths(existingRelPaths, expected, ownedDirs, ownedExact) {
    const exactSet = new Set(ownedExact);

    return existingRelPaths
        .filter((path) => {
            if (expected.has(path)) {
                return false;
            }

            if (exactSet.has(path)) {
                return true;
            }

            return ownedDirs.some((dir) => path.startsWith(dir));
        })
        .sort();
}

/** Build the kit when `packages/kit/dist` is missing or stale. */
function ensureKitBuilt() {
    if (isKitBuilt()) {
        return;
    }

    console.log('packages/kit/dist is missing or stale - building the kit first...');
    const { command, args, cwd } = buildKitBuildCommand();
    const result = spawnSync(command, args, { stdio: 'inherit', cwd });

    if (result.status !== 0 || !isKitBuilt()) {
        console.error('Could not build @blit386/kit; packages/kit/dist is still missing or stale.');
        process.exit(result.status || 1);
    }
}

/**
 * @param {string} name Hook script basename.
 * @returns {string | null}
 */
function readKitHookContents(name) {
    const path = join(KIT_HOOKS_DIR, name);

    return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Collect project-relative paths currently under the owned surface.
 *
 * @param {string} root Absolute repo root.
 * @returns {string[]}
 */
function listOwnedSurfacePaths(root) {
    /** @type {string[]} */
    const found = [];

    for (const exact of OWNED_EXACT_FILES) {
        if (existsSync(join(root, exact))) {
            found.push(exact);
        }
    }

    for (const dir of OWNED_DIRS) {
        const absDir = join(root, dir);

        if (!existsSync(absDir)) {
            continue;
        }

        for (const relativePath of readdirSync(absDir, { recursive: true, withFileTypes: false })) {
            const rel = `${dir}${String(relativePath).split(sep).join('/')}`;
            const abs = join(root, rel);

            try {
                const stat = lstatSync(abs);

                if (stat.isFile() || stat.isSymbolicLink()) {
                    found.push(rel);
                }
            } catch {
                // Broken symlink still counts as present for orphan / drift checks.
                found.push(rel);
            }
        }
    }

    return found;
}

/**
 * @param {string} root
 * @param {MaintainerEntry} entry
 * @returns {boolean} True when on-disk state already matches the plan entry.
 */
function entryMatchesDisk(root, entry) {
    const abs = join(root, entry.path);

    try {
        const stat = lstatSync(abs);

        if (entry.kind === 'symlink') {
            if (!stat.isSymbolicLink()) {
                return false;
            }

            const current = readlinkSync(abs).split(sep).join('/');

            return current === entry.linkTarget;
        }

        if (stat.isSymbolicLink() || !stat.isFile()) {
            return false;
        }

        return readFileSync(abs, 'utf8') === entry.content;
    } catch {
        return false;
    }
}

/**
 * @param {string} root
 * @param {MaintainerEntry} entry
 */
function writeEntry(root, entry) {
    const abs = join(root, entry.path);
    mkdirSync(dirname(abs), { recursive: true });
    rmSync(abs, { force: true });

    if (entry.kind === 'symlink') {
        if (entry.linkTarget === undefined) {
            throw new Error(`symlink entry ${entry.path} has no linkTarget`);
        }

        symlinkSync(entry.linkTarget, abs);

        return;
    }

    if (entry.content === undefined) {
        throw new Error(`write entry ${entry.path} has no content`);
    }

    writeFileSync(abs, entry.content);
}

/**
 * Load the five adapters and return their combined output (before skip/classify).
 *
 * @returns {Promise<Array<{ path: string, content: string }>>}
 */
async function collectGeneratedFiles() {
    ensureKitBuilt();

    const adaptersUrl = pathToFileURL(join(KIT_ROOT, 'dist', 'adapters.js')).href;
    const {
        generateAntigravityAdapter,
        generateCodexAdapter,
        generateGeminiAdapter,
        generateCopilotAdapter,
        generateOpenCodeAdapter,
    } = await import(adaptersUrl);

    return [
        ...generateAntigravityAdapter(KIT_ROOT, MAINTAINER_TEMPLATE_VARS),
        ...generateCodexAdapter(KIT_ROOT, MAINTAINER_TEMPLATE_VARS),
        ...generateGeminiAdapter(KIT_ROOT, MAINTAINER_TEMPLATE_VARS),
        ...generateCopilotAdapter(KIT_ROOT, MAINTAINER_TEMPLATE_VARS),
        ...generateOpenCodeAdapter(KIT_ROOT, MAINTAINER_TEMPLATE_VARS),
    ];
}

async function main() {
    const isCheck = process.argv.includes('--check');
    const generated = await collectGeneratedFiles();
    const plan = planMaintainerEntries(generated, readKitHookContents);
    const expected = new Set(plan.map((entry) => entry.path));
    const orphans = findOrphanMaintainerPaths(listOwnedSurfacePaths(ROOT), expected, OWNED_DIRS, OWNED_EXACT_FILES);
    /** @type {string[]} */
    const drifted = [];

    for (const entry of plan) {
        if (entryMatchesDisk(ROOT, entry)) {
            continue;
        }

        drifted.push(entry.path);

        if (!isCheck) {
            writeEntry(ROOT, entry);
        }
    }

    for (const orphan of orphans) {
        drifted.push(`${orphan} (orphaned)`);

        if (!isCheck) {
            rmSync(join(ROOT, orphan), { force: true });
        }
    }

    if (isCheck) {
        if (drifted.length > 0) {
            console.error(`\n${drifted.length} maintainer agent file(s) out of date:`);

            for (const entry of drifted) {
                console.error(`  ${entry}`);
            }

            console.error('\nRun `pnpm run sync:maintainer-agents` to update them.');
            process.exit(1);
        }

        console.log(`All ${plan.length} maintainer agent file(s) up to date.`);

        return;
    }

    if (drifted.length === 0) {
        console.log(`All ${plan.length} maintainer agent file(s) already up to date.`);

        return;
    }

    for (const entry of drifted) {
        console.log(`updated ${entry}`);
    }

    console.log(`\n${drifted.length} of ${plan.length} maintainer agent file(s) updated.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
