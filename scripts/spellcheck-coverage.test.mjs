/**
 * Regression test for BT-460: cspell-gitignore's findRepoRoot() prefers a farther-up .git
 * DIRECTORY (the main checkout) over a nearer .git FILE (a linked worktree), so inside a
 * worktree it resolves to the wrong repo root. The main checkout's .gitignore then matches
 * every worktree file against its `.claude/worktrees/` rule, silently filtering all of them
 * out – each package's spellcheck script reports "Files checked: 0" and cspell exits 1 because
 * --no-must-find-files (used only in .lintstagedrc.json, not in these scripts) isn't set.
 *
 * A silent zero is the actual failure mode: exit 1 gets noticed, but a future regression that
 * keeps exit 0 while checking nothing would not. This asserts the file count directly for every
 * package with a spellcheck script, running each package.json's own "spellcheck" command exactly
 * as written (not `pnpm run` – pnpm's own reporter writes straight to the controlling terminal in
 * some nested-PTY setups, bypassing stdout capture). It intentionally does not construct a
 * synthetic worktree fixture to force the bug: cspell-gitignore resolves the repo root by
 * shelling out to git rather than pure directory-walking, so a synthetic non-git ".git" directory
 * doesn't reproduce it faithfully, and a real `git worktree add` needs its own `pnpm install`,
 * too slow and network-dependent for a regression test. Running this test itself from inside a
 * real linked worktree (any `.claude/worktrees/*` checkout) already exercises the real bug shape.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const PACKAGES_WITH_SPELLCHECK = ['blit386', 'demos', 'website'];

function filesCheckedCount(scriptString, cwd) {
    // Mirrors what `pnpm run` does: put the package's own node_modules/.bin ahead of PATH so a
    // bare command name (e.g. "cspell") resolves without going through pnpm itself. Output is
    // redirected to a file rather than captured through node's own pipe: cspell can call
    // process.exit() before an async pipe write flushes, silently truncating captured stdout – a
    // real shell redirect to a file does not race that way.
    const env = { ...process.env, PATH: `${join(cwd, 'node_modules', '.bin')}:${process.env.PATH}` };
    const outDir = mkdtempSync(join(tmpdir(), 'bt-460-cspell-out-'));
    const outFile = join(outDir, 'output.txt');
    try {
        execFileSync('sh', ['-c', `${scriptString} > "${outFile}" 2>&1`], { cwd, env, stdio: 'ignore' });
    } catch {
        // cspell exits 1 both on spelling issues and on "0 files checked" – the count we want is
        // still in the redirected output either way, so a nonzero exit alone isn't fatal here.
    }
    const output = readFileSync(outFile, 'utf8');
    rmSync(outDir, { recursive: true, force: true });
    const match = output.match(/Files checked: (\d+)/);
    assert.ok(match, `output did not report a file count:\n${output}`);
    return Number(match[1]);
}

for (const pkg of PACKAGES_WITH_SPELLCHECK) {
    test(`packages/${pkg} spellcheck checks a nonzero number of files`, () => {
        const pkgDir = join(REPO_ROOT, 'packages', pkg);
        const { scripts } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
        assert.ok(scripts.spellcheck, `packages/${pkg}/package.json has no "spellcheck" script`);

        const count = filesCheckedCount(scripts.spellcheck, pkgDir);
        assert.ok(count > 0, `expected packages/${pkg} spellcheck to check at least one file, got ${count}`);
    });
}
