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
            `env ${COMMIT}`,
            `env FOO=1 ${COMMIT}`,
            `command ${COMMIT}`,
            `exec ${COMMIT}`,
            `nohup ${COMMIT}`,
            `time ${COMMIT}`,
            `echo x | xargs ${COMMIT}`,
            `sudo ${COMMIT}`,
            `(${COMMIT})`,
            `echo "$(${COMMIT})"`,
            'git -c user.name="A; B" commit -m change',
            'git --git-dir .git commit -m change',
            `echo "a $(true) b"; ${COMMIT}`,
        ]) {
            assert.equal(commit(repo, command).status, 2, command);
        }
    });

    test('checks every commit in a compound command, in the directory each one runs in', () => {
        const reviewed = makeRepo();
        const unreviewed = makeRepo();
        write(reviewed, SOURCE, 'two\n');
        git(reviewed, 'add', '-A');
        reviewBoth(reviewed);
        write(unreviewed, SOURCE, 'two\n');
        git(unreviewed, 'add', '-A');

        const both = commit(reviewed, `git -C "${reviewed}" commit -m a && git -C "${unreviewed}" commit -m b`);
        assert.equal(both.status, 2);
        assert.match(both.stderr, /src\/a\.ts/u);
        assert.equal(commit(reviewed, `git status && cd "${unreviewed}" && ${COMMIT}`).status, 2);
        assert.equal(commit(reviewed, `git status && ${COMMIT}`).status, 0);
        // A cd inside a subshell does not move the commit that follows it.
        assert.equal(commit(unreviewed, `(cd "${reviewed}") && ${COMMIT}`).status, 2);
        assert.equal(commit(unreviewed, `echo "$(cd "${reviewed}")" && ${COMMIT}`).status, 2);
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
            'git --git-dir .git status',
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

const PR_CREATE = 'gh pr create --title t --body b';

/** A repo with origin/main at the initial commit and one committed, unreviewed source change on the branch. */
function makePrRepo(path = SOURCE, content = 'two\n') {
    const repo = makeRepo();
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    write(repo, path, content);
    git(repo, 'add', '-A');
    git(repo, 'commit', '--quiet', '-m', 'branch work');

    return repo;
}

describe('review-gate pull request gate', () => {
    test('blocks gh pr create when the committed branch content was not reviewed', () => {
        const repo = makePrRepo();

        const result = commit(repo, PR_CREATE);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /this pull request contains changes/u);
        assert.match(result.stderr, /\/review did not see: src\/a\.ts/u);
        assert.match(result.stderr, /\/ponytail:ponytail-review did not see: src\/a\.ts/u);
        assert.match(result.stderr, /Run \/review and \/ponytail:ponytail-review/u);
    });

    test('passes when both reviews saw the committed branch content', () => {
        const repo = makePrRepo();
        reviewBoth(repo);

        assert.equal(commit(repo, PR_CREATE).status, 0);
    });

    test('blocks again after an uncommitted tracked edit made after the reviews', () => {
        const repo = makePrRepo();
        reviewBoth(repo);
        write(repo, SOURCE, 'three\n');

        assert.equal(commit(repo, PR_CREATE).status, 2);
    });

    test('blocks when only one review ran', () => {
        const repo = makePrRepo();
        review(repo, 'review');

        const result = commit(repo, PR_CREATE);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /ponytail-review did not see/u);
        assert.doesNotMatch(result.stderr, /\n {2}\/review did not see/u);
    });

    test('passes a PR whose changes are all generated paths', () => {
        const repo = makePrRepo(GENERATED, 'generated\n');

        assert.equal(commit(repo, PR_CREATE).status, 0);
    });

    test('finds gh pr create in a chain, a subshell and behind wrappers', () => {
        const repo = makePrRepo();

        for (const command of [
            `git push -u origin HEAD && ${PR_CREATE}`,
            `(${PR_CREATE})`,
            `echo $(${PR_CREATE})`,
            `GH_DEBUG=1 ${PR_CREATE}`,
            `rtk ${PR_CREATE}`,
            'gh pr -R owner/name create --fill',
            'gh pr --repo owner/name create --fill',
            'gh --repo owner/name pr create --fill',
            'gh -R owner/name pr new --fill',
            'gh pr new --title t',
        ]) {
            assert.equal(commit(repo, command).status, 2, command);
        }
    });

    test('ignores other gh commands and quoted mentions of gh pr create', () => {
        const repo = makePrRepo();

        for (const command of [
            'gh pr view 1',
            'gh pr list',
            'gh pr edit 1 --body x',
            `echo "${PR_CREATE}"`,
            `grep -n 'gh pr create' notes.md`,
            `git log --grep "${PR_CREATE}"`,
            'gh issue create --title t',
        ]) {
            const result = commit(repo, command);
            assert.equal(result.status, 0, command);
            assert.equal(result.stderr, '', command);
        }
    });

    test('checks the checkout a cd prefix names, and a review elsewhere does not count', () => {
        const repo = makePrRepo();
        const other = makeRepo();
        reviewBoth(other);

        const result = commit(other, `cd "${repo}" && ${PR_CREATE}`);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /This pull request targets/u);
    });

    test('names both a commit and a pull request in one command', () => {
        const repo = makePrRepo();
        write(repo, SOURCE, 'four\n');
        git(repo, 'add', '-A');

        const result = commit(repo, `${COMMIT} && ${PR_CREATE}`);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /this commit and pull request contains changes/u);
    });

    test('blocks committed branch content that the index and working tree no longer hold', () => {
        const repo = makePrRepo();
        git(repo, 'restore', '--source=origin/main', '--staged', '--worktree', SOURCE);
        reviewBoth(repo);

        const result = commit(repo, PR_CREATE);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /src\/a\.ts/u);
    });

    test('blocks when a reviewed working-tree correction sits over unreviewed committed content', () => {
        const repo = makePrRepo();
        write(repo, SOURCE, 'corrected\n');
        reviewBoth(repo);

        assert.equal(commit(repo, PR_CREATE).status, 2);
    });

    test('measures from the base named by --base, not always main', () => {
        const repo = makePrRepo();
        git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
        git(repo, 'update-ref', 'refs/remotes/origin/release', 'HEAD~1');

        assert.equal(commit(repo, PR_CREATE).status, 0);
        for (const flags of ['--base release', '--base=release', '-B release']) {
            assert.equal(commit(repo, `${PR_CREATE} ${flags}`).status, 2, flags);
        }
    });

    test('refuses a --head override it cannot check', () => {
        const repo = makePrRepo();
        reviewBoth(repo);

        for (const flags of ['--head feature', '--head=feature', '-H feature']) {
            const result = commit(repo, `${PR_CREATE} ${flags}`);
            assert.equal(result.status, 2, flags);
            assert.match(result.stderr, /only the checked-out branch/u);
        }
    });

    test('reads --base the way gh does: operands, last one wins, -B=x', () => {
        const repo = makePrRepo();
        git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
        git(repo, 'update-ref', 'refs/remotes/origin/release', 'HEAD~1');

        // From main's own tip nothing differs (passes); against release the branch work differs (blocks).
        assert.equal(commit(repo, `${PR_CREATE} --title --base=release`).status, 0);
        assert.equal(commit(repo, `${PR_CREATE} --base nope --base release`).status, 2);
        assert.equal(commit(repo, `${PR_CREATE} --base release --base main`).status, 0);

        for (const flags of ['-B=release', ['-B', 'release'].join(''), '--base=release']) {
            assert.equal(commit(repo, `${PR_CREATE} ${flags}`).status, 2, flags);
        }
    });

    test('a branch switch in the same command cannot be checked, so it is refused', () => {
        const repo = makePrRepo();
        reviewBoth(repo);

        for (const command of ['git switch feature', 'git checkout feature', 'git -C . switch -c x']) {
            const result = commit(repo, `${command} && ${PR_CREATE}`);
            assert.equal(result.status, 2, command);
            assert.match(result.stderr, /separate call/u);
        }

        // Other git commands leave the normal checks in place.
        assert.equal(commit(repo, `git log --grep switch && ${PR_CREATE}`).status, 0);
    });

    test('keeps a commit block when a pull request entry in the same command cannot be resolved', () => {
        const repo = makePrRepo();
        write(repo, SOURCE, 'five\n');
        git(repo, 'add', '-A');

        for (const command of [`${COMMIT} && ${PR_CREATE} --base nope`, `${PR_CREATE} --base nope && ${COMMIT}`]) {
            const result = commit(repo, command);
            assert.equal(result.status, 2, command);
            assert.match(result.stderr, /this commit contains changes/u);
        }
    });

    test('without --base, uses the branch gh-merge-base, then the remote default branch', () => {
        const repo = makePrRepo();
        git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
        git(repo, 'update-ref', 'refs/remotes/origin/release', 'HEAD~1');
        git(repo, 'update-ref', 'refs/remotes/origin/trunk', 'HEAD~1');

        // origin/main equals HEAD, so a main base has nothing to review.
        assert.equal(commit(repo, PR_CREATE).status, 0);

        git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
        assert.equal(commit(repo, PR_CREATE).status, 2);

        git(repo, 'config', `branch.${git(repo, 'branch', '--show-current').trim()}.gh-merge-base`, 'main');
        assert.equal(commit(repo, PR_CREATE).status, 0);
    });

    test('reads short clusters and treats an empty base as omitted', () => {
        const repo = makePrRepo();
        git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
        git(repo, 'update-ref', 'refs/remotes/origin/release', 'HEAD~1');

        for (const flags of ['-dB release', '-dB=release', '-d -B release', ['-fdB', 'release'].join('')]) {
            assert.equal(commit(repo, `${PR_CREATE} ${flags}`).status, 2, flags);
        }

        // An empty --base falls back to the default base (main here, equal to HEAD), and a later empty one resets.
        for (const flags of ['--base=', '-B=', '--base release --base=']) {
            assert.equal(commit(repo, `${PR_CREATE} ${flags}`).status, 0, flags);
        }
    });

    test('refuses when the PR base cannot be determined, instead of guessing main', () => {
        const repo = makePrRepo();
        git(repo, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
        reviewBoth(repo);

        const result = commit(repo, PR_CREATE);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /base cannot be determined/u);
        assert.equal(commit(repo, `${PR_CREATE} --base main`).status, 0);
    });

    test('stops short-flag scanning at a boolean assignment', () => {
        const repo = makePrRepo();
        git(repo, 'update-ref', 'refs/remotes/origin/release', 'HEAD~1');
        git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

        // -d=t is draft mode; its "t" must not read as -t (title) and swallow -B.
        assert.equal(commit(repo, `${PR_CREATE} -d=t -B release`).status, 2);
    });

    test('refuses a --repo override it cannot check', () => {
        const repo = makePrRepo();
        reviewBoth(repo);

        for (const command of ['gh pr -R owner/upstream create --base main', 'gh --repo=owner/upstream pr create']) {
            const result = commit(repo, command);
            assert.equal(result.status, 2, command);
            assert.match(result.stderr, /only this checkout's own PRs/u);
        }
    });

    test('a switch from a subdirectory, or before a cd, is still refused', () => {
        const repo = makePrRepo();
        write(repo, 'scripts/x.txt', 'x\n');
        reviewBoth(repo);

        for (const command of [
            `git -C scripts switch feature && ${PR_CREATE}`,
            `git switch feature && cd scripts && ${PR_CREATE}`,
        ]) {
            assert.equal(commit(repo, command).status, 2, command);
        }
    });

    test('one pull request command cannot hide another in the same command line', () => {
        const repo = makePrRepo();
        reviewBoth(repo);

        for (const command of [
            `gh pr -R owner/upstream create --base main && ${PR_CREATE} --base main`,
            `${PR_CREATE} --base main && gh pr create --head feature`,
        ]) {
            assert.equal(commit(repo, command).status, 2, command);
        }
    });

    test('keeps the outer command across a command substitution in its arguments', () => {
        const repo = makePrRepo();
        git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
        git(repo, 'update-ref', 'refs/remotes/origin/release', 'HEAD~1');

        // The arguments after the substitution (--base release) must still reach the PR's target.
        for (const command of [
            `${PR_CREATE} --title "$(printf t)" --base release`,
            `gh pr create --title $(printf t) --base=release --body "$(date)"`,
            `gh pr create --title "$(echo "$(printf t)")" -B release`,
        ]) {
            assert.equal(commit(repo, command).status, 2, command);
        }

        assert.equal(commit(repo, `${PR_CREATE} --title "$(printf t)"`).status, 0);
    });

    test('fails open when origin/main does not exist', () => {
        const repo = makeRepo();
        write(repo, SOURCE, 'two\n');
        git(repo, 'add', '-A');

        const result = commit(repo, `${PR_CREATE} --base main`);

        assert.equal(result.status, 0);
        assert.match(result.stderr, /review-gate: internal error, allowing/u);
    });
});

describe('review-gate command substitutions', () => {
    test('refuses a base that comes from a command substitution', () => {
        const repo = makePrRepo();
        reviewBoth(repo);

        for (const flags of [
            '--base "$(printf release)"',
            '--base=$(printf release)',
            '-B "$(printf release)"',
            '--base "rel$(printf ease)"',
            '--base rel$(printf ease)',
            '--base "$(printf rel)ease"',
            '-B=re$(printf lease)',
        ]) {
            const result = commit(repo, `${PR_CREATE} ${flags}`);
            assert.equal(result.status, 2, flags);
            assert.match(result.stderr, /pass the base name literally/u, flags);
        }
    });

    test('a substitution that never closes still leaves its outer commit or PR judged', () => {
        const repo = makePrRepo();
        write(repo, SOURCE, 'six\n');
        git(repo, 'add', '-A');

        for (const command of [
            `git commit -m "$(cat <<'EOF'\nit's (not closed\nEOF`,
            'git commit -m "$(cat',
            `${PR_CREATE} --title "$(printf`,
        ]) {
            assert.equal(commit(repo, command).status, 2, command);
        }
    });

    test('refuses a PR command that an unclosed substitution cuts off, such as a heredoc with an apostrophe', () => {
        const repo = makePrRepo();
        git(repo, 'update-ref', 'refs/remotes/origin/release', 'HEAD~1');
        git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
        reviewBoth(repo);

        const command = `gh pr create --body "$(cat <<'EOF'\nIt's ready.\nEOF\n)" --base release`;
        const result = commit(repo, command);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /never closes/u);
    });

    test('ignores a shell comment, so its apostrophe does not swallow the PR command', () => {
        const repo = makePrRepo();

        for (const command of [
            `# Don't forget the description.\n${PR_CREATE}`,
            `echo hi # it's fine\n${PR_CREATE}`,
            `${COMMIT.replace('commit', 'status')} # don't\n${PR_CREATE}`,
        ]) {
            assert.equal(commit(repo, command).status, 2, command);
        }

        // A hash inside a word or a quoted string is not a comment.
        assert.equal(commit(repo, `echo a#b "# c"; ${PR_CREATE}`).status, 2);
        assert.equal(commit(repo, 'echo a#b "x # y" && echo done').status, 0);
    });

    test('refuses an unterminated PR command even from a directory that is not a repository', () => {
        const repo = makePrRepo();
        const elsewhere = mkdtempSync(join(tmpdir(), 'review-gate-cwd-'));
        fixtures.push(elsewhere);

        const result = commit(repo, `cd ${elsewhere} && gh pr create --title "$(cat`);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /never closes/u);
    });

    test('still runs a substitution that sits in comment-looking text, as an unquoted heredoc does', () => {
        const repo = makePrRepo();

        for (const command of [
            `cat <<EOF\n# PR $(${PR_CREATE})\nEOF`,
            `# note $(${PR_CREATE}) it's\n`,
            `echo x # it's $(${PR_CREATE})`,
        ]) {
            assert.equal(commit(repo, command).status, 2, command);
        }

        assert.equal(commit(repo, "# it's just a comment about gh pr create\necho done").status, 0);
    });

    test('refuses gh pr create after a cd whose target comes from a substitution', () => {
        const repo = makePrRepo();
        reviewBoth(repo);

        for (const command of [`cd "$(mktemp -d)" && ${PR_CREATE}`, `cd x$(pwd) && ${PR_CREATE} --base main`]) {
            const result = commit(repo, command);
            assert.equal(result.status, 2, command);
            assert.match(result.stderr, /directory from a command substitution/u, command);
        }

        // A subshell restores the directory, and a reviewed branch passes.
        assert.equal(commit(repo, `(cd "$(mktemp -d)"); ${PR_CREATE}`).status, 0);
        assert.equal(commit(repo, `cd "$(git rev-parse --show-toplevel)" && ${COMMIT}`).status, 0);
    });

    test('a directory taken from a substitution leaves the directory unchanged', () => {
        const repo = makePrRepo();
        write(repo, SOURCE, 'six\n');
        git(repo, 'add', '-A');

        for (const command of [
            `cd "$(git rev-parse --show-toplevel)" && ${COMMIT}`,
            `git -C "$(pwd)" commit -m change`,
        ]) {
            const result = commit(repo, command);
            assert.equal(result.status, 2, command);
            assert.doesNotMatch(result.stderr, /internal error/u, command);
        }
    });
});
