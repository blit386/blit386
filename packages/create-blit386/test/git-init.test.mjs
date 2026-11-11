/**
 * The CLI's git and install steps, run against fake `git` and `npm` executables placed first on PATH. Each fake
 * appends what it was asked to a log, so the tests can check the order: install first (so the first commit carries
 * the lockfile the optional CI's frozen install needs), then `git init` on a `main` branch (the branch that CI runs
 * on), then the commit - and the warning printed when the commit fails, for example because git has no identity.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

import { cli } from './helpers.mjs';

// The fakes are POSIX shell scripts; Windows has no `sh` to run them.
const skip = process.platform === 'win32' ? 'fake executables are shell scripts' : false;

const FAKE_NPM = `#!/bin/sh
echo "npm $*" >> "$FAKE_LOG"
echo '{}' > package-lock.json
`;

const FAKE_GIT = `#!/bin/sh
if [ "$1" = add ]; then
    if [ -f package-lock.json ]; then echo "git add lockfile=yes" >> "$FAKE_LOG"; else echo "git add lockfile=no" >> "$FAKE_LOG"; fi
    exit 0
fi
echo "git $*" >> "$FAKE_LOG"
if [ "$1" = commit ] && [ -n "$FAKE_GIT_COMMIT_FAILS" ]; then exit 1; fi
exit 0
`;

/** Run the CLI with the fakes on PATH and return its output plus the fakes' log lines. */
function runWithFakes(commitFails) {
    const work = mkdtempSync(join(tmpdir(), 'cbt-git-init-'));

    try {
        const bin = join(work, 'bin');
        mkdirSync(bin);
        for (const [name, body] of [
            ['npm', FAKE_NPM],
            ['git', FAKE_GIT],
        ]) {
            writeFileSync(join(bin, name), body);
            chmodSync(join(bin, name), 0o755);
        }

        const log = join(work, 'fake.log');
        const result = spawnSync(process.execPath, [cli, 'git-game', '--yes'], {
            cwd: work,
            encoding: 'utf8',
            env: {
                ...process.env,
                PATH: `${bin}${delimiter}${process.env.PATH}`,
                FAKE_LOG: log,
                npm_config_user_agent: 'npm/10.9.2 node/v22.18.0 linux x64',
                ...(commitFails ? { FAKE_GIT_COMMIT_FAILS: '1' } : {}),
            },
        });

        return { output: `${result.stdout}${result.stderr}`, calls: readFileSync(log, 'utf8').trim().split('\n') };
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

test('installs first, then starts git on main and commits the lockfile', { skip }, () => {
    const { calls, output } = runWithFakes(false);

    assert.deepEqual(
        calls.map((call) => call.split(' ').slice(0, 2).join(' ')),
        ['npm install', 'git init', 'git symbolic-ref', 'git add', 'git commit'],
    );
    assert.ok(
        calls.includes('git symbolic-ref HEAD refs/heads/main'),
        `the branch should be main, got: ${calls.join(' | ')}`,
    );
    assert.ok(calls.includes('git add lockfile=yes'), 'the first commit should include the lockfile');
    assert.match(output, /saved the first version/);
});

test('a failed first commit prints the git identity hint', { skip }, () => {
    const { output } = runWithFakes(true);

    assert.match(output, /git could not save the first version/);
    assert.match(output, /git config --global user\.name/);
    assert.doesNotMatch(output, /Started a git repository and saved the first version/);
});
