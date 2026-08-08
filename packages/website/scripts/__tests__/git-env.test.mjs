import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnv } from '../git-env.mjs';

// Every variable git reads to locate a repository. Kept here as the test's own list rather than
// imported from git-env.mjs, so a variable dropped from the implementation fails the test instead
// of silently narrowing both sides at once.
const REPO_LOCATION_VARS = [
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CEILING_DIRECTORIES',
    'GIT_COMMON_DIR',
    'GIT_CONFIG',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_PARAMETERS',
    'GIT_DIR',
    'GIT_GRAFT_FILE',
    'GIT_IMPLICIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_NAMESPACE',
    'GIT_NO_REPLACE_OBJECTS',
    'GIT_OBJECT_DIRECTORY',
    'GIT_PREFIX',
    'GIT_QUARANTINE_PATH',
    'GIT_REPLACE_REF_BASE',
    'GIT_SHALLOW_FILE',
    'GIT_WORK_TREE',
];

describe('gitEnv', () => {
    test('drops every variable through which git locates a repository', () => {
        const saved = { ...process.env };

        try {
            for (const name of REPO_LOCATION_VARS) {
                process.env[name] = `/decoy/${name}`;
            }

            const env = gitEnv();

            for (const name of REPO_LOCATION_VARS) {
                assert.equal(env[name], undefined, `${name} survived the scrub`);
            }
        } finally {
            process.env = saved;
        }
    });

    // git clears exactly this list before recursing into an unrelated repository, so it is the
    // authority on what "points at a repo" means. Asserting against the installed git means a
    // future version adding a variable fails here instead of quietly widening the hole.
    test('covers everything the installed git reports as a local env var', () => {
        const reported = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

        assert.ok(reported.length > 0, 'git should report at least one local env var');

        const missing = reported.filter((name) => !REPO_LOCATION_VARS.includes(name));

        assert.deepEqual(missing, [], 'git-env.mjs must scrub every variable git itself clears');
    });

    test('keeps the rest of the environment and applies overrides last', () => {
        const saved = { ...process.env };

        try {
            process.env.GIT_DIR = '/decoy/.git';

            const env = gitEnv({ GIT_AUTHOR_DATE: '2026-01-15T10:30:00+01:00', GIT_DIR: '/explicit/.git' });

            assert.equal(env.PATH, process.env.PATH);
            assert.equal(env.GIT_AUTHOR_DATE, '2026-01-15T10:30:00+01:00');
            assert.equal(env.GIT_DIR, '/explicit/.git', 'an explicit override must win over the scrub');
        } finally {
            process.env = saved;
        }
    });
});

// The regression this guards against: `.husky/pre-push` runs `pnpm --filter ... run preflight`
// with GIT_DIR exported by git, so a `git init` inside a throwaway fixture repo lands on the real
// repository instead unless that variable is cleared. Pushing from a linked worktree makes GIT_DIR
// `.git/worktrees/<name>`, which git cannot pair with a work tree from an unrelated cwd, so it
// writes `bare = true` into the shared `.git/config` and every later git command in the main
// checkout and in every worktree fails with "this operation must be run in a work tree".
//
// Both halves matter: the control case proves the hazard is still real (a future git could stop
// writing core.bare here, which would quietly make the guarded case pass for the wrong reason),
// and the guarded case proves gitEnv() defuses it.
describe('gitEnv against an inherited GIT_DIR', () => {
    /** @type {string} */
    let decoyRoot;
    /** @type {string} */
    let decoyConfig;
    /** @type {string} */
    let decoyWorktreeGitDir;
    /** @type {string} */
    let pristineConfig;

    /** @type {(args: string[], cwd: string, env: NodeJS.ProcessEnv) => string} */
    const run = (args, cwd, env) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' });

    before(() => {
        decoyRoot = mkdtempSync(join(tmpdir(), 'git-env-decoy-'));

        const main = join(decoyRoot, 'main');
        const scrubbed = gitEnv({ GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com' });

        run(['init', '--quiet', main], decoyRoot, scrubbed);
        run(['config', 'user.email', 'test@example.com'], main, scrubbed);
        run(['config', 'user.name', 'Test'], main, scrubbed);
        run(['commit', '--quiet', '--allow-empty', '-m', 'initial commit'], main, scrubbed);

        // Mirrors this repo: worktree config enabled, plus one linked worktree whose git dir is
        // what git would export as GIT_DIR to a hook run from that worktree.
        run(['config', 'extensions.worktreeConfig', 'true'], main, scrubbed);
        run(['worktree', 'add', '--quiet', join(decoyRoot, 'linked'), '-b', 'linked'], main, scrubbed);

        decoyConfig = join(main, '.git', 'config');
        decoyWorktreeGitDir = join(main, '.git', 'worktrees', 'linked');

        pristineConfig = readFileSync(decoyConfig, 'utf8');

        assert.match(pristineConfig, /bare = false/u, 'decoy repo should start non-bare');
    });

    after(() => {
        rmSync(decoyRoot, { recursive: true, force: true });
    });

    test('an inherited GIT_DIR corrupts the shared config (control)', () => {
        const workDir = mkdtempSync(join(tmpdir(), 'git-env-inherited-'));

        try {
            // gitEnv() with GIT_DIR put back is the control: the override reinstates exactly the
            // variable a hook would have leaked, so this reproduces the hazard while keeping the
            // "every git subprocess goes through gitEnv()" invariant true even here.
            run(['init', '--quiet'], workDir, gitEnv({ GIT_DIR: decoyWorktreeGitDir }));

            assert.match(
                readFileSync(decoyConfig, 'utf8'),
                /bare = true/u,
                'inherited GIT_DIR should still be able to re-init the decoy repo as bare',
            );
        } finally {
            rmSync(workDir, { recursive: true, force: true });
            writeFileSync(decoyConfig, pristineConfig);
        }
    });

    test('gitEnv() keeps git init inside the directory it was given', () => {
        const workDir = mkdtempSync(join(tmpdir(), 'git-env-scrubbed-'));
        const saved = { ...process.env };

        try {
            process.env.GIT_DIR = decoyWorktreeGitDir;

            run(['init', '--quiet'], workDir, gitEnv());

            assert.equal(
                readFileSync(decoyConfig, 'utf8'),
                pristineConfig,
                'the decoy repo shared config must come through byte-identical',
            );
            assert.equal(
                run(['rev-parse', '--git-dir'], workDir, gitEnv()).trim(),
                '.git',
                'git init should have created a repository in the directory it was handed',
            );
        } finally {
            process.env = saved;
            rmSync(workDir, { recursive: true, force: true });
        }
    });
});
