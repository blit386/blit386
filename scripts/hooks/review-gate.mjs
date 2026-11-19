#!/usr/bin/env node
/**
 * Commit review gate (BT-815). One script, wired in `.claude/settings.json` for three Claude Code events:
 *
 * - `PostToolUse` (Skill) and `UserPromptSubmit` (a typed slash command): when `/review` or
 *   `/ponytail:ponytail-review` runs, snapshot the whole working tree as a git tree object and record its SHA as that
 *   review's marker in `<git dir>/review-gate/` (per worktree, never committed).
 * - `PreToolUse` (Bash): refuse `git commit` (exit 2) unless every changed tracked path - in the index and in the
 *   working tree, so `-a` and pathspec commits are covered without parsing them - is byte-identical to what both
 *   reviews last saw. An edit after a review therefore needs a fresh review. Generated paths are exempt.
 *
 * A missing or stale marker blocks; any internal error fails open with a stderr note, so a gate bug cannot block every
 * commit. Policy: `.claude/rules/commit-review-gate.md`.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { gitEnv } from '../lib/git-env.mjs';

/** The two reviews a commit needs: marker file name, how to ask for it, and the skill names that count as a run. */
const REVIEWS = [
    { marker: 'review', label: '/review', skills: ['review'] },
    {
        marker: 'ponytail-review',
        label: '/ponytail:ponytail-review',
        skills: ['ponytail:ponytail-review', 'ponytail-review'],
    },
];
const MARKER_DIR = 'review-gate';
const BLOCK = 2;
const ALLOW = 0;

/** Written by `pnpm run api:history`, not by hand. Other generated paths come from the scripts that own them. */
const API_HISTORY_JSON = 'packages/blit386/docs/_api-history.json';

/**
 * `git` where a command starts (line start, or after `;`, `&`, `|`, `(`, `$(`), past any mix of `VAR=x` assignments and
 * the option-less wrappers `rtk env command exec nohup time xargs sudo` - not the phrase quoted inside another command's
 * argument (a grep pattern, a PR body). The options after it are walked in {@link findCommit}, not matched here: a regex
 * over them backtracks exponentially (CodeQL js/redos). Each prefix ends at whitespace, so the repetition is linear.
 * shortcut: a wrapper given its own options (`sudo -u x git`) or a shell string (`bash -c "git commit"`) is not seen;
 * documented in `.claude/rules/commit-review-gate.md`.
 */
const GIT_AT_COMMAND_START =
    /(?:^|[\n;&|(]|\$\()\s*(?:(?:[A-Za-z_]\w*=\S*|rtk|env|command|exec|nohup|time|xargs|sudo)\s+)*git(?=\s)/gu;
const COMMAND_END = /[\n;&|)]/u;
const DIR_OPTION = '-C';
// Each alternative starts with a different character, so the repetition cannot backtrack.
const SHELL_WORD = /(?:"[^"]*"|'[^']*'|[^\s"'])+/gu;
const CD_PREFIX = /^\s*cd\s+("[^"]+"|'[^']+'|[^\s;&]+)\s*(?:&&|;)/u;
const SLASH_COMMAND = /^\s*\/([\w:-]+)/u;
const PATH_LIST_LIMIT = 10;

/** Runs git on `cwd` with git's repo-location variables scrubbed; throws when git cannot start at all. */
function git(cwd, args, env = gitEnv()) {
    const result = spawnSync('git', ['--literal-pathspecs', '-C', cwd, ...args], {
        encoding: 'utf8',
        env,
        maxBuffer: 64 * 1024 * 1024,
    });

    if (result.error) {
        throw result.error;
    }

    return result;
}

/** Like {@link git}, but throws on a non-zero exit and returns trimmed stdout. */
function gitOut(cwd, args, env) {
    const result = git(cwd, args, env);

    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} exited ${result.status}: ${result.stderr.trim()}`);
    }

    return result.stdout.trim();
}

const unquote = (word) => word.replace(/^["']|["']$/gu, '').replace(/^~(?=\/|$)/u, homedir());

/** Repo top level and git dir for `cwd`. */
function repoOf(cwd) {
    const [top, gitDir] = gitOut(cwd, ['rev-parse', '--show-toplevel', '--absolute-git-dir']).split('\n');

    return { top, markers: join(gitDir, MARKER_DIR), index: join(gitDir, 'index') };
}

/** The working tree (tracked + untracked, `.gitignore` honored) as a tree SHA, built in a throwaway index. */
function snapshotTree(repo) {
    mkdirSync(repo.markers, { recursive: true });
    const tempIndex = join(repo.markers, `index-${process.pid}`);

    try {
        if (existsSync(repo.index)) {
            // A fresh mtime on the copy would turn off git's racy-entry check and hide a same-second, same-size edit.
            cpSync(repo.index, tempIndex, { preserveTimestamps: true });
        }

        const env = gitEnv({ GIT_INDEX_FILE: tempIndex });
        gitOut(repo.top, ['add', '-A'], env);

        return gitOut(repo.top, ['write-tree'], env);
    } finally {
        rmSync(tempIndex, { force: true });
    }
}

/** PostToolUse (Skill) / UserPromptSubmit: record what a review run is about to see. */
function recordReview(payload) {
    const skill =
        payload.hook_event_name === 'UserPromptSubmit'
            ? SLASH_COMMAND.exec(payload.prompt ?? '')?.[1]
            : payload.tool_name === 'Skill' && payload.tool_input?.skill;
    const review = REVIEWS.find(({ skills }) => skills.includes(skill));

    if (review) {
        const repo = repoOf(payload.cwd ?? process.cwd());
        writeFileSync(join(repo.markers, review.marker), `${snapshotTree(repo)}\n`);
    }

    return ALLOW;
}

/**
 * The `-C` directories of the first `git <global options> commit` in `command`, or `null` when it runs no commit.
 * `commit-tree` and other subcommands do not count.
 */
function findCommit(command) {
    for (const start of command.matchAll(GIT_AT_COMMAND_START)) {
        const words =
            command
                .slice(start.index + start[0].length)
                .split(COMMAND_END, 1)[0]
                .match(SHELL_WORD) ?? [];
        const dirs = [];

        for (let i = 0; i < words.length; i++) {
            if (words[i] === DIR_OPTION || words[i] === '-c') {
                if (words[i] === DIR_OPTION && words[i + 1]) {
                    dirs.push(words[i + 1]);
                }

                i++;
            } else if (words[i] === 'commit') {
                return dirs;
            } else if (!words[i].startsWith('-')) {
                break;
            }
        }
    }

    return null;
}

/** The directory a commit command acts on: the hook cwd, then a leading `cd X &&`, then each `git -C X` in turn. */
function commitDir(cwd, command, dashCDirs) {
    const cd = CD_PREFIX.exec(command);

    return resolve(cd ? resolve(cwd, unquote(cd[1])) : cwd, ...dashCDirs.map(unquote));
}

/**
 * Changed tracked paths, minus generated ones: `staged` differ from HEAD in the index (intent-to-add placeholders are
 * not staged content, and git leaves them out here), `all` adds those that differ only in the working tree.
 */
async function changedSourcePaths(top) {
    const { OWNED_DIRS, OWNED_EXACT_FILES } = await import('../sync-maintainer-agents.mjs');
    const { COMMANDS_DIR_REL } = await import('../sync-cursor-commands.mjs');
    const generatedDirs = [...OWNED_DIRS, `${COMMANDS_DIR_REL}/`];
    const generatedFiles = new Set([...OWNED_EXACT_FILES, API_HISTORY_JSON]);
    const list = (...args) =>
        gitOut(top, ['diff', '--name-only', '--no-renames', '-z', ...args, 'HEAD'])
            .split('\0')
            .filter((path) => path && !generatedFiles.has(path) && !generatedDirs.some((dir) => path.startsWith(dir)));
    const staged = list('--cached');

    return { staged, all: [...new Set([...staged, ...list()])] };
}

/** Changed paths whose index or working-tree content differs from the review's recorded tree (all, if none). */
function unreviewedPaths(repo, marker, { staged, all }) {
    const markerFile = join(repo.markers, marker);

    if (!existsSync(markerFile)) {
        return all;
    }

    const tree = readFileSync(markerFile, 'utf8').trim();
    // The index is compared only where it holds staged content; an empty pathspec would mean the whole tree.
    const checks = [
        ['--cached', staged],
        [null, all],
    ].filter(([, paths]) => paths.length > 0);
    const differing = checks.flatMap(([cached, paths]) => {
        const result = git(repo.top, ['diff', '--name-only', '-z', ...(cached ? [cached] : []), tree, '--', ...paths]);

        // A tree git no longer has (pruned) cannot vouch for anything.
        return result.status === 0 ? result.stdout.split('\0') : paths;
    });

    return [...new Set(differing)].filter(Boolean);
}

/** PreToolUse (Bash): block a commit whose content both reviews did not see. */
async function gateCommit(payload) {
    const command = payload.tool_input?.command ?? '';
    const dashCDirs = findCommit(command);

    if (!dashCDirs) {
        return ALLOW;
    }

    const sessionDir = payload.cwd ?? process.cwd();
    const repo = repoOf(commitDir(sessionDir, command, dashCDirs));
    const paths = await changedSourcePaths(repo.top);

    if (paths.all.length === 0) {
        return ALLOW;
    }

    const stale = REVIEWS.map((review) => ({ review, paths: unreviewedPaths(repo, review.marker, paths) })).filter(
        (entry) => entry.paths.length > 0,
    );

    if (stale.length === 0) {
        return ALLOW;
    }

    const lines = ['review-gate: this commit contains changes that were not reviewed in their current state.'];

    for (const { review, paths: unreviewed } of stale) {
        lines.push(`  ${review.label} did not see: ${unreviewed.slice(0, PATH_LIST_LIMIT).join(', ')}`);

        if (unreviewed.length > PATH_LIST_LIMIT) {
            lines.push(`    ... and ${unreviewed.length - PATH_LIST_LIMIT} more`);
        }
    }

    // Reviews are recorded for the session's own checkout, so a `cd X && git commit` into another one never matches.
    const sessionTop = git(sessionDir, ['rev-parse', '--show-toplevel']);

    if (sessionTop.status !== 0 || sessionTop.stdout.trim() !== repo.top) {
        lines.push(
            `This commit targets ${repo.top}, but reviews count only for the checkout they run in (the session's`,
            `working directory, here ${sessionDir}). Review and commit from a session whose working directory is the`,
            'committing checkout (for a subagent: work in its own isolated worktree, or in the main checkout).',
        );
    }

    lines.push(
        'Run /review and /ponytail:ponytail-review on the current changes (after your last edit), then commit again.',
        'An edit made after a review needs a fresh review. See .claude/rules/commit-review-gate.md.',
    );
    process.stderr.write(`${lines.join('\n')}\n`);

    return BLOCK;
}

try {
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    process.exitCode = payload.hook_event_name === 'PreToolUse' ? await gateCommit(payload) : recordReview(payload);
} catch (error) {
    // Fail open: a broken gate must not block every commit. A missing marker is not an error and still blocks.
    process.stderr.write(`review-gate: internal error, allowing: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = ALLOW;
}
