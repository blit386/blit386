/**
 * Unit tests for the caret-range helpers used by `blit doctor` (D14 kit vs engine range).
 *
 * Imports the built dist module; the package `pretest` script runs `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { gitEnv } from '../../../scripts/lib/git-env.mjs';
import { exceedsCaretRange, gitState, satisfiesCaretRange } from '../dist/env.js';

const RANGE = '^1.4.0';

test('satisfiesCaretRange accepts same-major versions at or above the floor', () => {
    assert.equal(satisfiesCaretRange('1.4.0', RANGE), true);
    assert.equal(satisfiesCaretRange('1.9.0', RANGE), true);
});

test('satisfiesCaretRange rejects lower same-major, other-major, and above-major versions', () => {
    assert.equal(satisfiesCaretRange('1.3.9', RANGE), false);
    assert.equal(satisfiesCaretRange('0.9.0', RANGE), false);
    assert.equal(satisfiesCaretRange('2.0.0', RANGE), false);
});

test('exceedsCaretRange is true only when installed major is above the range major', () => {
    assert.equal(exceedsCaretRange('2.0.0', RANGE), true);
    assert.equal(exceedsCaretRange('1.9.0', RANGE), false);
    assert.equal(exceedsCaretRange('1.3.9', RANGE), false);
    assert.equal(exceedsCaretRange('0.9.0', RANGE), false);
});

// #region gitState

/** Run git in `cwd` with a fixed identity so a commit works on a machine with none configured. */
function git(cwd, ...args) {
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
        cwd,
        env: gitEnv(),
        stdio: 'pipe',
    });
}

function tempDir() {
    return realpathSync(mkdtempSync(join(tmpdir(), 'blit-git-state-')));
}

test('gitState is none when there is no .git', () => {
    const dir = tempDir();

    try {
        assert.equal(gitState(dir), 'none');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('gitState is no-commit for a repository that was only initialized', () => {
    const dir = tempDir();

    try {
        git(dir, 'init');
        assert.equal(gitState(dir), 'no-commit');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('gitState is committed once there is a commit, loose or packed', () => {
    const dir = tempDir();

    try {
        git(dir, 'init');
        git(dir, 'commit', '--allow-empty', '-m', 'first');
        assert.equal(gitState(dir), 'committed');

        git(dir, 'pack-refs', '--all', '--prune');
        assert.equal(gitState(dir), 'committed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('gitState follows a linked worktree .git file', () => {
    const dir = tempDir();

    try {
        git(dir, 'init');
        git(dir, 'commit', '--allow-empty', '-m', 'first');
        mkdirSync(join(dir, 'sub'));
        git(dir, 'worktree', 'add', join(dir, 'sub', 'wt'), '-b', 'other');
        assert.equal(gitState(join(dir, 'sub', 'wt')), 'committed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('gitState follows a relative gitdir pointer with no commondir (submodule layout)', () => {
    const dir = tempDir();

    try {
        mkdirSync(join(dir, 'modules', 'x'), { recursive: true });
        writeFileSync(join(dir, '.git'), 'gitdir: modules/x\n');
        writeFileSync(join(dir, 'modules', 'x', 'HEAD'), 'ref: refs/heads/main\n');
        assert.equal(gitState(dir), 'no-commit');

        mkdirSync(join(dir, 'modules', 'x', 'refs', 'heads'), { recursive: true });
        writeFileSync(join(dir, 'modules', 'x', 'refs', 'heads', 'main'), 'abc123\n');
        assert.equal(gitState(dir), 'committed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('gitState is committed for a detached HEAD', () => {
    const dir = tempDir();

    try {
        mkdirSync(join(dir, '.git'));
        writeFileSync(join(dir, '.git', 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n');
        assert.equal(gitState(dir), 'committed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

// #endregion
