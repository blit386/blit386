/**
 * `blit migrate` - rewrite a game's source from old Blit-Tech API names to the current ones.
 *
 * Safe renames are applied; ambiguous ones are reported for review. Previews by default; writes only with `--write`
 * (and a kind nudge first if the project is not saved with git). See `../migrations` for the data and codemod engine.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { findProjectRoot, installedVersion, isGitRepo } from '../env';
import { applyRenames, type RenameHit, renamesFromMigrations } from '../migrations/codemod';
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

/** Render one hit as a two-line diff (red old, green new). */
function formatHit(hit: RenameHit): string {
    return [`  ${color.red(`- ${hit.before.trim()}`)}`, `  ${color.green(`+ ${hit.after.trim()}`)}`].join('\n');
}

/**
 * Run the applicable codemods over a project's source.
 *
 * Selects migrations by the installed engine version (or every known migration when the engine is not installed),
 * prints a preview, and writes changes only when `write` is true. Returns a summary for the caller.
 */
export async function migrateProject(
    root: string,
    out: (line: string) => void,
    options: { write: boolean; skipGitNag?: boolean },
): Promise<MigrateSummary> {
    const installed = installedVersion(root, 'blit-tech');
    const migrations = installed ? migrationsThrough(installed) : [...MIGRATIONS];

    if (migrations.length === 0) {
        out(ui.success('No migrations apply to your Blit-Tech version. Nothing to change.'));
        return { filesChanged: 0, appliedCount: 0, reviewCount: 0, wrote: false };
    }

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

    if (appliedCount === 0 && reviewCount === 0) {
        out(ui.success('Your game already uses the current Blit-Tech names. Nothing to change.'));
        return { filesChanged: 0, appliedCount: 0, reviewCount: 0, wrote: false };
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

    let wrote = false;

    if (appliedCount > 0) {
        if (options.write) {
            if (!options.skipGitNag && !isGitRepo(root)) {
                out('');
                out(ui.warn('Before changing files:'));
                out(NO_GIT_NAG);
                out('');

                if (!(await confirm('Change these files anyway?'))) {
                    out(ui.info('No changes made. Save your work first, then run `blit migrate --write` again.'));
                    return { filesChanged, appliedCount, reviewCount, wrote: false };
                }
            }

            for (const change of changes) {
                if (change.applied.length > 0) {
                    writeFileSync(join(root, change.path), change.text);
                }
            }

            wrote = true;
            out('');
            out(
                ui.success(
                    `Renamed ${appliedCount} ${appliedCount === 1 ? 'name' : 'names'} in ${filesChanged} ${filesChanged === 1 ? 'file' : 'files'}.`,
                ),
            );
        } else {
            out('');
            out(ui.info(`This was a preview of ${appliedCount} ${appliedCount === 1 ? 'change' : 'changes'}.`));
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

    return { filesChanged, appliedCount, reviewCount, wrote };
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

    out(ui.info('Checking your game for old Blit-Tech names...'));
    await migrateProject(root, out, { write });
}
