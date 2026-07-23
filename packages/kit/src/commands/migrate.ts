/**
 * `blit migrate` - rewrite a game's source from old BLIT386 API names to the current ones, and enable hot reload.
 *
 * Safe renames are applied; ambiguous ones are reported for review. On blit386 1.4.0+, also wires the `blit386()` Vite
 * plugin into `vite.config.*` when it is missing, so edits keep the game running. Previews by default; writes only with
 * `--write` (and a kind nudge first if the project is not saved with git). See `../migrations` for the data and
 * codemod engine.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { compareVersions, findProjectRoot, installedVersion, isGitRepo } from '../env';
import { applyRenames, type RenameHit, renamesFromMigrations } from '../migrations/codemod';
import {
    enableHotReloadInViteConfig,
    HOT_RELOAD_SINCE,
    type HotReloadViteStatus,
    VITE_CONFIG_NAMES,
} from '../migrations/enableHotReload';
import { MIGRATIONS, migrationsThrough } from '../migrations/registry';
import { color, NO_GIT_NAG, ui } from '../messages';
import { confirm } from '../prompt';

/** Source file extensions we rewrite. */
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);

/** Directories never worth scanning. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.blit', '.vite', 'coverage']);

/** Per-file outcome of running the codemods. */
interface FileChange {
    /** Path relative to the project root. */
    path: string;

    /** Rewritten file text. */
    text: string;

    /** Renames applied to this file. */
    applied: RenameHit[];

    /** Review matches found in this file. */
    review: RenameHit[];
}

/** Pending vite.config rewrite for hot reload. */
interface HotReloadChange {
    /** Path relative to the project root. */
    path: string;

    /** Rewritten file text. */
    text: string;

    /** Status from the rewriter. */
    status: HotReloadViteStatus;
}

/** Summary returned to callers (used by `blit upgrade`). */
export interface MigrateSummary {
    /** Files that had at least one auto rename. */
    filesChanged: number;

    /** Total auto renames applied. */
    appliedCount: number;

    /** Total review matches found. */
    reviewCount: number;

    /** Whether changes were written to disk. */
    wrote: boolean;

    /**
     * Hot-reload Vite plugin outcome.
     *
     * - `added`: a rewrite is ready (or was written) to enable the plugin
     * - `already`: vite.config already has it
     * - `skipped-engine`: installed blit386 is older than 1.4.0
     * - `missing-config`: no vite.config.* at the project root
     * - `unsupported`: config shape was too unusual to rewrite safely
     * - `none`: hot reload was not considered (no migrations path)
     */
    hotReload: HotReloadViteStatus | 'none';

    /** True when a hot-reload vite rewrite is available to apply (preview or pending write). */
    hotReloadPending: boolean;
}

/** Recursively collect code files under `dir`, skipping build and dependency folders. */
function collectFiles(dir: string, acc: string[]): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.isDirectory()) {
            continue;
        }
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) {
                collectFiles(join(dir, entry.name), acc);
            }
            continue;
        }

        const dot = entry.name.lastIndexOf('.');
        if (dot >= 0 && CODE_EXT.has(entry.name.slice(dot))) {
            acc.push(join(dir, entry.name));
        }
    }

    return acc;
}

/** Find the files to scan: prefer `src/`, fall back to the whole project root (skipping build/dependency/dot folders). */
function sourceFiles(root: string): string[] {
    const srcDir = join(root, 'src');

    // Prefer src/ only when it really is a directory; otherwise scan the whole project. Genuine read
    // errors (permissions, etc.) are left to propagate rather than being masked by a blanket fallback.
    if (existsSync(srcDir) && statSync(srcDir).isDirectory()) {
        return collectFiles(srcDir, []);
    }

    return collectFiles(root, []);
}

/** Locate vite.config.* at the project root (not under src/). */
function findViteConfig(root: string): string | null {
    for (const name of VITE_CONFIG_NAMES) {
        const path = join(root, name);
        if (existsSync(path) && statSync(path).isFile()) {
            return path;
        }
    }
    return null;
}

/** Render one hit as a two-line diff (red old, green new). */
function formatHit(hit: RenameHit): string {
    return [`  ${color.red(`- ${hit.before.trim()}`)}`, `  ${color.green(`+ ${hit.after.trim()}`)}`].join('\n');
}

/** Empty summary helper. */
function emptySummary(hotReload: MigrateSummary['hotReload'] = 'none'): MigrateSummary {
    return {
        filesChanged: 0,
        appliedCount: 0,
        reviewCount: 0,
        wrote: false,
        hotReload,
        hotReloadPending: false,
    };
}

/**
 * Decide whether this project should get the Vite hot-reload plugin rewrite.
 *
 * When blit386 is not installed yet, we still offer the rewrite (scaffold / migrate before install). When it is
 * installed below 1.4.0, skip – `blit386/vite` does not exist on older engines.
 */
function shouldOfferHotReload(installed: string | null): boolean {
    if (!installed) {
        return true;
    }
    return compareVersions(installed, HOT_RELOAD_SINCE) >= 0;
}

/** Inspect and optionally prepare a vite.config rewrite. */
function planHotReload(root: string, installed: string | null): HotReloadChange | { status: HotReloadViteStatus } {
    if (!shouldOfferHotReload(installed)) {
        return { status: 'skipped-engine' };
    }

    const vitePath = findViteConfig(root);
    if (!vitePath) {
        return { status: 'missing-config' };
    }

    const original = readFileSync(vitePath, 'utf8');
    const result = enableHotReloadInViteConfig(original);

    if (result.status === 'added' && result.changed) {
        return {
            path: relative(root, vitePath),
            text: result.text,
            status: 'added',
        };
    }

    return { status: result.status };
}

/**
 * Run the applicable codemods over a project's source, and enable hot reload on blit386 1.4.0+.
 *
 * Selects migrations by the installed engine version (or every known migration when the engine is not installed),
 * prints a preview, and writes changes only when `write` is true. Returns a summary for the caller.
 */
export async function migrateProject(
    root: string,
    out: (line: string) => void,
    options: { write: boolean; skipGitNag?: boolean },
): Promise<MigrateSummary> {
    const installed = installedVersion(root, 'blit386');
    const migrations = installed ? migrationsThrough(installed) : [...MIGRATIONS];

    const renames = renamesFromMigrations(migrations);
    const changes: FileChange[] = [];

    for (const file of sourceFiles(root)) {
        const original = readFileSync(file, 'utf8');
        const result = applyRenames(original, renames);

        if (result.changed || result.review.length > 0) {
            changes.push({
                path: relative(root, file),
                text: result.text,
                applied: result.applied,
                review: result.review,
            });
        }
    }

    const appliedCount = changes.reduce((n, c) => n + c.applied.length, 0);
    const reviewCount = changes.reduce((n, c) => n + c.review.length, 0);
    const filesChanged = changes.filter((c) => c.applied.length > 0).length;

    const hotPlan = planHotReload(root, installed);
    const hotReloadPending = 'path' in hotPlan && hotPlan.status === 'added';
    const hotReload: MigrateSummary['hotReload'] = hotPlan.status;

    if (migrations.length === 0 && !hotReloadPending && hotReload === 'skipped-engine') {
        out(ui.success('No migrations apply to your BLIT386 version. Nothing to change.'));
        return emptySummary(hotReload);
    }

    if (appliedCount === 0 && reviewCount === 0 && !hotReloadPending) {
        if (hotReload === 'already') {
            out(ui.success('Your game already uses the current BLIT386 names, and hot reload is wired up. Nice.'));
        } else if (hotReload === 'missing-config') {
            out(ui.success('Your game already uses the current BLIT386 names. Nothing to change.'));
            out(
                ui.info(
                    'No vite.config at the project root – add `plugins: [blit386()]` from `blit386/vite` yourself for hot reload (see docs/hot-reload.md).',
                ),
            );
        } else if (hotReload === 'unsupported') {
            out(ui.success('Your game already uses the current BLIT386 names. Nothing to rename.'));
            out(
                ui.warn(
                    "Could not safely edit vite.config for hot reload – add `import { blit386 } from 'blit386/vite'` and `plugins: [blit386()]` by hand (see docs/hot-reload.md).",
                ),
            );
        } else if (hotReload === 'skipped-engine') {
            out(ui.success('Your game already uses the current BLIT386 names. Nothing to change.'));
            out(
                ui.info(
                    `Hot reload needs blit386 ${HOT_RELOAD_SINCE}+. Run \`npx blit upgrade\`, then \`npx blit migrate --write\` again.`,
                ),
            );
        } else {
            out(ui.success('Your game already uses the current BLIT386 names. Nothing to change.'));
        }
        return { ...emptySummary(hotReload), reviewCount };
    }

    for (const change of changes) {
        if (change.applied.length === 0) {
            continue;
        }

        out('');
        out(color.bold(change.path));
        for (const hit of change.applied) {
            out(`  ${color.dim(`line ${hit.line}`)}`);
            out(formatHit(hit));
        }
    }

    if (hotReloadPending && 'path' in hotPlan) {
        out('');
        out(color.bold(hotPlan.path));
        out(`  ${color.dim('hot reload')}`);
        out(`  ${color.green("+ import { blit386 } from 'blit386/vite'")}`);
        out(`  ${color.green('+ plugins: [blit386()]')}`);
        out(ui.info('Edits will keep the game running instead of wiping state on every save.'));
    }

    const pendingWrites = appliedCount > 0 || hotReloadPending;
    let wrote = false;

    if (pendingWrites) {
        if (options.write) {
            if (!options.skipGitNag && !isGitRepo(root)) {
                out('');
                out(ui.warn('Before changing files:'));
                out(NO_GIT_NAG);
                out('');

                if (!(await confirm('Change these files anyway?'))) {
                    out(ui.info('No changes made. Save your work first, then run `blit migrate --write` again.'));
                    return {
                        filesChanged,
                        appliedCount,
                        reviewCount,
                        wrote: false,
                        hotReload,
                        hotReloadPending,
                    };
                }
            }

            for (const change of changes) {
                if (change.applied.length > 0) {
                    writeFileSync(join(root, change.path), change.text);
                }
            }

            if (hotReloadPending && 'path' in hotPlan) {
                writeFileSync(join(root, hotPlan.path), hotPlan.text);
            }

            wrote = true;
            out('');
            if (appliedCount > 0 && hotReloadPending) {
                out(
                    ui.success(
                        `Renamed ${appliedCount} ${appliedCount === 1 ? 'name' : 'names'} in ${filesChanged} ${filesChanged === 1 ? 'file' : 'files'}, and enabled hot reload in vite.config.`,
                    ),
                );
            } else if (appliedCount > 0) {
                out(
                    ui.success(
                        `Renamed ${appliedCount} ${appliedCount === 1 ? 'name' : 'names'} in ${filesChanged} ${filesChanged === 1 ? 'file' : 'files'}.`,
                    ),
                );
            } else if (hotReloadPending) {
                out(ui.success('Enabled hot reload in vite.config.'));
            }
            if (hotReloadPending) {
                out(ui.info('Restart `npx blit run` once, then save a file – the game should keep playing.'));
            }
        } else {
            out('');
            const n = appliedCount + (hotReloadPending ? 1 : 0);
            out(ui.info(`This was a preview of ${n} ${n === 1 ? 'change' : 'changes'}.`));
            out(ui.info('Run `blit migrate --write` to apply them.'));
        }
    }

    if (reviewCount > 0) {
        out('');
        out(
            ui.warn(
                `${reviewCount} ${reviewCount === 1 ? 'name needs' : 'names need'} a closer look (too common to rename safely):`,
            ),
        );
        for (const change of changes) {
            for (const hit of change.review) {
                const note = hit.rename.note ? ` - ${hit.rename.note}` : '';
                out(`  ${color.dim(`${change.path}:${hit.line}`)}  ${hit.rename.from} -> ${hit.rename.to}${note}`);
            }
        }
        out(ui.info('Check each one by hand, or ask your AI assistant to update them.'));
    }

    if (hotReload === 'unsupported' && !hotReloadPending) {
        out('');
        out(
            ui.warn(
                "Could not safely edit vite.config for hot reload – add `import { blit386 } from 'blit386/vite'` and `plugins: [blit386()]` by hand (see docs/hot-reload.md).",
            ),
        );
    }

    return {
        filesChanged: filesChanged + (wrote && hotReloadPending ? 1 : 0),
        appliedCount: appliedCount + (wrote && hotReloadPending ? 1 : 0),
        reviewCount,
        wrote,
        hotReload,
        hotReloadPending,
    };
}

/** CLI entry point for `blit migrate [--write]`. */
export async function runMigrate(args: string[]): Promise<void> {
    const out = (line: string): void => {
        process.stdout.write(`${line}\n`);
    };

    const write = args.includes('--write');

    const root = findProjectRoot(process.cwd());
    if (!root) {
        out(ui.error("Couldn't find a game here. Run this inside your game folder."));
        process.exitCode = 1;
        return;
    }

    out(ui.info('Checking your game for old BLIT386 names and hot-reload setup...'));
    await migrateProject(root, out, { write });
}
