#!/usr/bin/env node
/**
 * Commit review gate (BT-815). One script, wired in `.claude/settings.json` for three Claude Code events:
 *
 * - `PostToolUse` (Skill) and `UserPromptSubmit` (a typed slash command): when `/review` or
 *   `/ponytail:ponytail-review` runs, snapshot the whole working tree as a git tree object and record its SHA as that
 *   review's marker in `<git dir>/review-gate/` (per worktree, never committed).
 * - `PreToolUse` (Bash): refuse `git commit` and `gh pr create` (exit 2) unless every changed tracked path - in the
 *   index and in the working tree, so `-a` and pathspec commits are covered without parsing them - is byte-identical
 *   to what both reviews last saw. A commit is measured against HEAD; a PR against the merge base with `origin/<base>`
 *   (`--base`, else main), where what HEAD changes counts too. An edit after a review therefore needs a fresh review. Generated
 *   paths are exempt.
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

/** What a gated command proposes, and the ref its changed paths are counted from. */
const COMMIT = 'commit';
const PULL_REQUEST = 'pull request';
const REMOTE = 'origin';

/** Written by `pnpm run api:history`, not by hand. Other generated paths come from the scripts that own them. */
const API_HISTORY_JSON = 'packages/blit386/docs/_api-history.json';

/** Command boundaries in {@link shellTokens} output: `;`, `&`, `|`, newline; a subshell's `(` or `$(`, and its `)`. */
const BOUNDARY = Symbol('boundary');
const SUBSHELL_OPEN = Symbol('subshell open');
const SUBSHELL_CLOSE = Symbol('subshell close');
const BOUNDARY_TOKENS = new Map([
    [';', BOUNDARY],
    ['&', BOUNDARY],
    ['|', BOUNDARY],
    ['\n', BOUNDARY],
    ['(', SUBSHELL_OPEN],
    [')', SUBSHELL_CLOSE],
]);
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
/** Words skipped in front of a command: option-less wrappers. `VAR=x` assignments are skipped too. */
const COMMAND_WRAPPERS = new Set(['rtk', 'env', 'command', 'exec', 'nohup', 'time', 'xargs', 'sudo']);
const ASSIGNMENT = /^[A-Za-z_]\w*=/u;
/** Git global options whose value is the next word (`git.c`); `-C` also moves the directory. */
const DIR_OPTION = '-C';
const OPERAND_OPTIONS = new Set([
    DIR_OPTION,
    '-c',
    '--config-env',
    '--git-dir',
    '--work-tree',
    '--namespace',
    '--super-prefix',
    '--attr-source',
]);
/** `gh` options whose value is the next word and that may precede a subcommand. */
const REPO_OPTIONS = new Set(['-R', '--repo']);
const PR_CREATE_NAMES = new Set(['create', 'new']);
/** `gh pr create` options that take a value (`gh pr create --help`), long and short. */
const CREATE_VALUE_FLAGS = new Set([
    ...['--assignee', '--base', '--body', '--body-file', '--head', '--label', '--milestone', '--project'],
    ...['--recover', '--reviewer', '--template', '--title', '--repo'],
    ...['-a', '-B', '-b', '-F', '-H', '-l', '-m', '-p', '-r', '-T', '-t', '-R'],
]);
/** Git subcommands that change the checked-out branch, so a later `gh pr create` in the same command sees another one. */
const BRANCH_SWITCHERS = new Set(['switch', 'checkout']);
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

const expandHome = (path) => path.replace(/^~(?=\/|$)/u, homedir());

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
 * Splits a shell command into words (quotes removed, backslash escapes applied) and boundary markers, one pass
 * per character so it cannot backtrack (CodeQL js/redos). Separators inside quotes stay part of the word; `$(` opens a
 * command context even inside double quotes, and the quote resumes at its `)`.
 * shortcut: no `$VAR` or glob expansion, and `bash -c "..."` stays one opaque word; documented in the rule file.
 */
function shellTokens(command) {
    const tokens = [];
    const resume = [];
    let word = null;
    let quote = '';
    const flush = () => {
        if (word !== null) {
            tokens.push(word);
            word = null;
        }
    };

    for (let i = 0; i < command.length; i++) {
        const char = command[i];

        if (char === '\\' && quote !== SINGLE_QUOTE) {
            word = (word ?? '') + (command[++i] ?? '');
        } else if (char === '$' && command[i + 1] === '(' && quote !== SINGLE_QUOTE) {
            flush();
            tokens.push(SUBSHELL_OPEN);
            resume.push(quote);
            quote = '';
            i++;
        } else if (quote) {
            if (char === quote) {
                quote = '';
            } else {
                word += char;
            }
        } else if (char === DOUBLE_QUOTE || char === SINGLE_QUOTE) {
            quote = char;
            word ??= '';
        } else if (BOUNDARY_TOKENS.has(char)) {
            const token = BOUNDARY_TOKENS.get(char);
            flush();
            tokens.push(token);

            if (token === SUBSHELL_OPEN) {
                resume.push('');
            } else if (token === SUBSHELL_CLOSE) {
                quote = resume.pop() ?? '';
            }
        } else if (/\s/u.test(char)) {
            flush();
        } else {
            word = (word ?? '') + char;
        }
    }

    flush();

    return tokens;
}

/**
 * `--base` and `--head` of a `gh pr create`, read the way its flag parser does: every string option consumes the next
 * word even when it starts with `-` (`--title --base=x` is a title), `-B=x`, `-Bx` and a cluster such as `-dB x` all
 * work, the last occurrence wins, and an empty value means "not given".
 */
function createTargets(words) {
    const targets = {};
    const record = (flag, value) => {
        if (flag === '--base' || flag === '-B') {
            targets.base = value || undefined;
        } else if (flag === '--head' || flag === '-H') {
            targets.head = value || undefined;
        } else if (flag === '--repo' || flag === '-R') {
            targets.repo = value || undefined;
        }
    };

    for (let i = 0; i < words.length; i++) {
        const word = words[i];

        if (word.startsWith('--')) {
            const [flag, ...inline] = word.split('=');

            if (CREATE_VALUE_FLAGS.has(flag)) {
                record(flag, inline.length > 0 ? inline.join('=') : words[++i]);
            }
        } else if (word.startsWith('-')) {
            // Short cluster: boolean letters pass, the first value letter takes the rest of the word or the next word.
            for (let j = 1; j < word.length && word[j] !== '='; j++) {
                if (CREATE_VALUE_FLAGS.has(`-${word[j]}`)) {
                    const rest = word.slice(j + 1);
                    record(`-${word[j]}`, rest === '' ? words[++i] : rest.replace(/^=/u, ''));
                    break;
                }
            }
        }
    }

    return targets;
}

/**
 * `{ dir, base, head }` for a `gh pr create` (or its alias `gh pr new`), else `null` for any other `gh` command.
 * `-R/--repo` is persistent, so cobra accepts it before `pr` and before the subcommand; its operand is skipped.
 */
function ghPrCreate(args, dir) {
    const positional = [];

    for (let i = 0; i < args.length && positional.length < 3; i++) {
        if (REPO_OPTIONS.has(args[i])) {
            i++;
        } else if (!args[i].startsWith('-')) {
            positional.push(args[i]);
        }
    }

    const [group, subcommand] = positional;

    if (group !== 'pr' || !PR_CREATE_NAMES.has(subcommand)) {
        return null;
    }

    return { dir, ...createTargets(args) };
}

/** `{ name, dir }`: the subcommand of `git <global options> ...` and the directory it acts on, or `null` for none. */
function gitSubcommand(args, startDir) {
    let dir = startDir;

    for (let i = 0; i < args.length; i++) {
        if (!args[i].startsWith('-')) {
            return { name: args[i], dir };
        }

        if (OPERAND_OPTIONS.has(args[i])) {
            // shortcut: --git-dir and --work-tree are skipped, not followed; the commit is checked in `dir`.
            if (args[i] === DIR_OPTION) {
                dir = resolve(dir, expandHome(args[i + 1] ?? ''));
            }

            i++;
        }
    }

    return null;
}

/**
 * The directory and kind of every `git commit` and `gh pr create` in `command`, walking its simple commands in order from `cwd`: a `cd X` before a
 * commit moves it, and a subshell's `)` restores the directory it started in.
 */
function gatedCommands(command, cwd) {
    const found = new Map();
    let switched = false;
    const outer = [];
    let dir = cwd;
    let words = [];

    for (const token of [...shellTokens(command), BOUNDARY]) {
        if (typeof token === 'string') {
            words.push(token);
            continue;
        }

        const start = words.findIndex((word) => !ASSIGNMENT.test(word) && !COMMAND_WRAPPERS.has(word));
        const [name, ...args] = start < 0 ? [] : words.slice(start);

        if (name === 'cd' && args[0]) {
            dir = resolve(dir, expandHome(args[0]));
        } else if (name === 'git') {
            const sub = gitSubcommand(args, dir);

            if (sub?.name === 'commit') {
                found.set(`${COMMIT}\0${sub.dir}`, { kind: COMMIT, dir: sub.dir });
            } else if (BRANCH_SWITCHERS.has(sub?.name)) {
                switched = true;
            }
        } else if (name === 'gh') {
            const pr = ghPrCreate(args, dir);

            if (pr) {
                // Every target is part of the key: one command must not hide another's --repo, --head or --base.
                const key = JSON.stringify([PULL_REQUEST, dir, pr.base, pr.head, pr.repo, switched]);
                found.set(key, { kind: PULL_REQUEST, ...pr, switched });
            }
        }

        words = [];

        if (token === SUBSHELL_OPEN) {
            outer.push(dir);
        } else if (token === SUBSHELL_CLOSE) {
            dir = outer.pop() ?? dir;
        }
    }

    return [...found.values()];
}

/**
 * Changed tracked paths, minus generated ones: `staged` differ from `base` in the index (intent-to-add placeholders are
 * not staged content, and git leaves them out here), `all` adds those that differ only in the working tree, and
 * `committed` (a PR only) are those `HEAD` itself changes: what the PR carries, whatever the index and tree hold now.
 */
async function changedSourcePaths(top, base, forPullRequest) {
    const { OWNED_DIRS, OWNED_EXACT_FILES } = await import('../sync-maintainer-agents.mjs');
    const { COMMANDS_DIR_REL } = await import('../sync-cursor-commands.mjs');
    const generatedDirs = [...OWNED_DIRS, `${COMMANDS_DIR_REL}/`];
    const generatedFiles = new Set([...OWNED_EXACT_FILES, API_HISTORY_JSON]);
    const list = (...refs) =>
        gitOut(top, ['diff', '--name-only', '--no-renames', '-z', ...refs])
            .split('\0')
            .filter((path) => path && !generatedFiles.has(path) && !generatedDirs.some((dir) => path.startsWith(dir)));
    const staged = list('--cached', base);
    const committed = forPullRequest ? list(base, 'HEAD') : [];

    return { staged, committed, all: [...new Set([...committed, ...staged, ...list(base)])] };
}

/** Changed paths whose index or working-tree content differs from the review's recorded tree (all, if none). */
function unreviewedPaths(repo, marker, { staged, committed, all }) {
    const markerFile = join(repo.markers, marker);

    if (!existsSync(markerFile)) {
        return all;
    }

    const tree = readFileSync(markerFile, 'utf8').trim();
    // The index is compared only where it holds staged content; an empty pathspec would mean the whole tree.
    const checks = [
        ['HEAD', committed],
        ['--cached', staged],
        [null, all],
    ].filter(([, paths]) => paths.length > 0);
    const differing = checks.flatMap(([ref, paths]) => {
        const result = git(repo.top, ['diff', '--name-only', '-z', ...(ref ? [ref] : []), tree, '--', ...paths]);

        // A tree git no longer has (pruned) cannot vouch for anything.
        return result.status === 0 ? result.stdout.split('\0') : paths;
    });

    return [...new Set(differing)].filter(Boolean);
}

/**
 * The base `gh pr create` falls back to without `--base`: the branch's `gh-merge-base`, else the remote's default as
 * the local `origin/HEAD` records it (`git remote set-head origin -a` refreshes it), else `''`: not determinable.
 */
function defaultPrBase(top) {
    const read = (args) => {
        const result = git(top, args);

        return result.status === 0 ? result.stdout.trim() : '';
    };
    const branch = read(['symbolic-ref', '--short', 'HEAD']);
    const configured = branch && read(['config', '--get', `branch.${branch}.gh-merge-base`]);
    const remoteHead = read(['symbolic-ref', '--short', `refs/remotes/${REMOTE}/HEAD`]).replace(`${REMOTE}/`, '');

    return configured || remoteHead;
}

/** Block-message lines for a `kind` in `dir` whose content both reviews did not see; empty when it may proceed. */
async function staleReport({ kind, dir, base: prBase, head, repo: targetRepo, switched }, sessionDir) {
    const repo = repoOf(dir);
    const isPullRequest = kind === PULL_REQUEST;

    if (switched) {
        // shortcut: the branch a pending switch lands on is not predicted; the switch has to be its own tool call.
        return ['  git switch/checkout in the same command as gh pr create: switch branches in a separate call first.'];
    }

    if (targetRepo) {
        // shortcut: a repository other than this checkout's origin is not followed; refused, not guessed at.
        return [`  gh pr create --repo ${targetRepo}: only this checkout's own PRs can be checked; drop --repo.`];
    }

    if (head) {
        // shortcut: a head other than the checked-out branch is not followed; refused, not guessed at.
        return [
            `  gh pr create --head ${head}: only the checked-out branch can be checked; drop --head and switch to it.`,
        ];
    }

    // The PR base is the one named by --base, as the remote knows it; with no such ref git throws and the gate fails open.
    const prBaseName = isPullRequest ? (prBase ?? defaultPrBase(repo.top)) : '';

    if (isPullRequest && !prBaseName) {
        return ['  gh pr create: the PR base cannot be determined (no origin/HEAD); pass --base.'];
    }

    const base = isPullRequest ? gitOut(repo.top, ['merge-base', 'HEAD', `${REMOTE}/${prBaseName}`]) : 'HEAD';
    const paths = await changedSourcePaths(repo.top, base, isPullRequest);
    const stale =
        paths.all.length === 0
            ? []
            : REVIEWS.map((review) => ({ review, paths: unreviewedPaths(repo, review.marker, paths) })).filter(
                  (entry) => entry.paths.length > 0,
              );
    const lines = [];

    for (const { review, paths: unreviewed } of stale) {
        lines.push(`  ${review.label} did not see: ${unreviewed.slice(0, PATH_LIST_LIMIT).join(', ')}`);

        if (unreviewed.length > PATH_LIST_LIMIT) {
            lines.push(`    ... and ${unreviewed.length - PATH_LIST_LIMIT} more`);
        }
    }

    // Reviews are recorded for the session's own checkout, so a `cd X && git commit` into another one never matches.
    const sessionTop = stale.length > 0 && git(sessionDir, ['rev-parse', '--show-toplevel']);

    if (sessionTop && (sessionTop.status !== 0 || sessionTop.stdout.trim() !== repo.top)) {
        lines.push(
            `This ${kind} targets ${repo.top}, but reviews count only for the checkout they run in (the session's`,
            `working directory, here ${sessionDir}). Review and proceed from a session whose working directory is the`,
            'target checkout (for a subagent: work in its own isolated worktree, or in the main checkout).',
        );
    }

    return lines;
}

/** PreToolUse (Bash): block a command whose commits contain content both reviews did not see. */
async function gateCommit(payload) {
    const sessionDir = payload.cwd ?? process.cwd();
    const lines = [];

    const kinds = new Set();

    for (const gated of gatedCommands(payload.tool_input?.command ?? '', sessionDir)) {
        let report;

        try {
            report = await staleReport(gated, sessionDir);
        } catch (error) {
            // Fail open per entry: a lookup that fails (no origin/<base>) must not drop a block another entry earned.
            process.stderr.write(
                `review-gate: internal error, allowing: ${error instanceof Error ? error.message : error}\n`,
            );
            continue;
        }

        if (report.length > 0) {
            kinds.add(gated.kind);
            lines.push(...report);
        }
    }

    if (lines.length === 0) {
        return ALLOW;
    }

    const what = [...kinds].join(' and ');
    lines.unshift(`review-gate: this ${what} contains changes that were not reviewed in their current state.`);
    lines.push(
        `Run /review and /ponytail:ponytail-review on the current changes (after your last edit), then retry the ${what}.`,
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
