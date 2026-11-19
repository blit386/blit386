import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitEnv } from '../lib/git-env.mjs';

const SCRIPT = fileURLToPath(new URL('./review-gate.mjs', import.meta.url));
const SOURCE = 'src/a.ts';
const GENERATED = '.cursor/commands/example.md';
const COMMIT = 'git commit -m change';

const fixtures = [];
after(() => {
    for (const dir of fixtures) {
        rmSync(dir, { recursive: true, force: true });
    }
});

const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: gitEnv(), encoding: 'utf8', stdio: 'pipe' });

/** @param {string} repo @param {string} path @param {string} content */
function write(repo, path, content) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
}

/** A fresh repo with one committed source file. Signing is off in this throwaway repo only. */
function makeRepo() {
    const repo = mkdtempSync(join(tmpdir(), 'review-gate-'));
    fixtures.push(repo);
    git(repo, 'init', '--quiet');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'commit.gpgsign', 'false');
    write(repo, SOURCE, 'one\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '--quiet', '-m', 'initial');

    return repo;
}

const hook = (payload, env = gitEnv()) =>
    spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(payload), encoding: 'utf8', env });

const review = (cwd, skill) => hook({ hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill }, cwd });

const reviewBoth = (cwd) => {
    review(cwd, 'review');
    review(cwd, 'ponytail:ponytail-review');
};

const commit = (cwd, command = COMMIT, env = undefined) =>
    hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd }, env);

describe('review-gate commit gate', () => {
    test('blocks an unreviewed staged change', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');

        const result = commit(repo);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /\/review did not see: src\/a\.ts/u);
        assert.match(result.stderr, /\/ponytail:ponytail-review did not see: src\/a\.ts/u);
    });

    test('finds a commit in any command position', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');

        for (const command of [
            `git add -A && ${COMMIT}`,
            `true; ${COMMIT}`,
            `GIT_AUTHOR_NAME=x ${COMMIT}`,
            `rtk ${COMMIT}`,
            'git -c user.name="A B" commit -m change',
            `(${COMMIT})`,
            `echo "$(${COMMIT})"`,
        ]) {
            assert.equal(commit(repo, command).status, 2, command);
        }
    });

    test('passes when both reviews saw the change, even if it was staged after the review', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        reviewBoth(repo);
        git(repo, 'add', '-A');

        assert.equal(commit(repo).status, 0);
    });

    test('sees an edit that only git racy-entry check reveals', () => {
        const repo = makeRepo();
        const file = join(repo, SOURCE);
        const index = join(repo, '.git', 'index');
        const past = new Date('2020-01-01T00:00:00Z');

        // Index entry and index file share one timestamp, so git must re-hash the entry rather than trust its stat.
        utimesSync(file, past, past);
        git(repo, 'update-index', '--refresh');
        utimesSync(index, past, past);
        write(repo, SOURCE, 'two\n');
        utimesSync(file, past, past);
        reviewBoth(repo);
        git(repo, 'add', '-A');

        assert.equal(commit(repo).status, 0);
    });

    test('blocks when one review marker is missing', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');
        review(repo, 'review');

        const result = commit(repo);

        assert.equal(result.status, 2);
        assert.doesNotMatch(result.stderr, /\/review did not see/u);
        assert.match(result.stderr, /\/ponytail:ponytail-review did not see: src\/a\.ts/u);
    });

    test('blocks when the staged diff changed after the review', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');
        reviewBoth(repo);
        write(repo, SOURCE, 'three\n');
        git(repo, 'add', '-A');

        assert.equal(commit(repo).status, 2);
    });

    test('blocks a commit -a when the working tree changed after the review', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        reviewBoth(repo);
        write(repo, SOURCE, 'three\n');

        assert.equal(commit(repo, 'git commit -am change').status, 2);
    });

    test('passes a reviewed intent-to-add file, whose index entry is only a placeholder', () => {
        const repo = makeRepo();
        write(repo, 'src/new.ts', 'new\n');
        git(repo, 'add', '-N', 'src/new.ts');
        reviewBoth(repo);

        assert.equal(commit(repo).status, 0);
    });

    test('passes a generated-only commit with no review', () => {
        const repo = makeRepo();
        write(repo, GENERATED, 'generated\n');
        git(repo, 'add', '-A');

        assert.equal(commit(repo).status, 0);
    });

    test('blocks generated plus unreviewed source, naming only the source', () => {
        const repo = makeRepo();
        write(repo, GENERATED, 'generated\n');
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');

        const result = commit(repo);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /src\/a\.ts/u);
        assert.doesNotMatch(result.stderr, /\.cursor\/commands/u);
    });

    test('records reviews typed as slash commands', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');
        hook({ hook_event_name: 'UserPromptSubmit', prompt: '/review root', cwd: repo });
        hook({ hook_event_name: 'UserPromptSubmit', prompt: '/ponytail:ponytail-review', cwd: repo });

        assert.equal(commit(repo).status, 0);
    });

    test('targets the repo named by a cd prefix or git -C, not the hook cwd', () => {
        const repo = makeRepo();
        const elsewhere = mkdtempSync(join(tmpdir(), 'review-gate-cwd-'));
        fixtures.push(elsewhere);
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');

        // From a non-repo cwd the gate would fail open (exit 0), so exit 2 proves it found the repo.
        const viaCd = commit(elsewhere, `cd "${repo}" && ${COMMIT}`);
        assert.equal(viaCd.status, 2);
        assert.match(viaCd.stderr, /reviews count only for the checkout they run in/u);
        assert.equal(commit(elsewhere, `git -C "${repo}" commit -m change`).status, 2);
    });

    test('a review run from another checkout does not count for the committing one', () => {
        const repo = makeRepo();
        const other = makeRepo();
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');
        reviewBoth(other);

        assert.equal(commit(other, `cd "${repo}" && ${COMMIT}`).status, 2);
        assert.doesNotMatch(commit(repo).stderr, /reviews count only/u);
    });

    test('stays fast on option-heavy commands that never reach commit (CodeQL ReDoS shapes)', () => {
        const repo = makeRepo();

        for (const command of [
            `\ngit ${'-C -- '.repeat(5000)}`,
            `\ngit -C ${'"!" -C '.repeat(5000)}`,
            `\ngit -${'-- -'.repeat(5000)}`,
        ]) {
            const started = Date.now();
            const result = commit(repo, command);
            assert.equal(result.status, 0);
            assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
        }
    });

    test('ignores commands that are not a commit', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');

        for (const command of [
            'git status',
            'git commit-tree HEAD^{tree}',
            'git log --grep commit',
            `grep -n "${COMMIT}" notes.md`,
            `gh pr view --json body | grep '${COMMIT}'`,
        ]) {
            const result = commit(repo, command);
            assert.equal(result.status, 0, command);
            assert.equal(result.stderr, '', command);
        }
    });

    test('fails open with a stderr note on an internal error', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');

        // No git on PATH: the gate cannot inspect anything, so it must allow rather than block.
        const result = commit(repo, COMMIT, gitEnv({ PATH: '' }));

        assert.equal(result.status, 0);
        assert.match(result.stderr, /review-gate: internal error, allowing/u);
    });
});
