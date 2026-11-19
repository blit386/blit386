/**
 * Differential test of the shell guard's `git config` rules against real git (BT-800). The guard reads command text
 * with regexes; git has its own option parser, and every place the two disagree is a bypass (`--get` after the key is a
 * value pattern, `--comment` eats the next word). So each `git config` command below runs in a throwaway repo, the
 * test reads back which alias or push / mirror keys git actually wrote, and the guard must have refused every write:
 * deny for an alias, ask or deny for a push refspec or mirror. A guard refusal of a command that wrote nothing is only
 * reported, not failed - refusing a read costs little.
 */

import { strict as assert } from 'node:assert';
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gitEnv } from '../../../scripts/lib/git-env.mjs';
import { SHELL_CASES } from './shell-cases.mjs';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const { isDangerousCommand } = createRequire(import.meta.url)(join(here, '..', 'content', 'hooks', 'guard-core.cjs'));

const gitVersion = (() => {
    try {
        return execFileSync('git', ['--version'], { encoding: 'utf8', env: gitEnv() }).trim();
    } catch {
        return null;
    }
})();

// Canonical key names, as `git config --get-regexp` prints them (section and key lowercased).
const WRITTEN_KEY = '^alias\\.|^remote\\..*\\.(push|mirror)$';
const READ_OPTIONS = ['--get', '--get-all', '--get-regexp', '--unset', '--unset-all', '-l', '--list'];
// Given bare, each of these takes the next word as its value - the `--comment --get` bypass.
const VALUE_TAKING = ['--comment', '--file', '-f', '--type', '--default', '--value'];
const OTHER_OPTIONS = [
    '--comment=x',
    '--file=cfg',
    '--type=bool',
    '--default=x',
    '--value=x',
    '--add',
    '--replace-all',
    '--local',
    '--global',
    '--fixed-value',
];
const ALL_OPTIONS = [...READ_OPTIONS, ...VALUE_TAKING, ...OTHER_OPTIONS];

/** `git config [sub] [options] key [value] [options]` in every shape worth probing, as plain command strings. */
const permutations = () => {
    const before = [
        [],
        ...ALL_OPTIONS.map((one) => [one]),
        ...VALUE_TAKING.flatMap((v) => READ_OPTIONS.map((r) => [v, r])),
    ];
    const after = ALL_OPTIONS.map((one) => [one]);
    const keys = [
        ['alias.n', 'reset'],
        ['remote.origin.push', '+main'],
    ];
    const commands = [];
    for (const sub of [[], ['set'], ['get'], ['unset']]) {
        for (const [key, value] of keys) {
            for (const tail of [[key, value], [key]]) {
                for (const options of before) commands.push([...sub, ...options, ...tail]);
                for (const options of after) commands.push([...sub, ...tail, ...options]);
            }
        }
    }
    return commands.map((args) => ['git', 'config', ...args].join(' '));
};

/** Every alias / push / mirror key found in any file under `dir` that git reads as config. */
const writtenKeys = async (dir, env) => {
    const files = readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name !== 'HEAD')
        .map((entry) => join(entry.parentPath, entry.name));
    const found = [];
    for (const file of files) {
        try {
            const { stdout } = await run('git', ['config', '--file', file, '--get-regexp', WRITTEN_KEY], { env });
            found.push(...stdout.split('\n').filter(Boolean));
        } catch (error) {
            // Exit 1 is "no matching key"; anything else is a file git does not read as config. Both mean none here.
            if (typeof error.code !== 'number') throw error;
        }
    }
    return found;
};

/** Run one command in a fresh repo with a throwaway HOME and global config, and report what it wrote. */
const probe = async (command) => {
    const root = mkdtempSync(join(tmpdir(), 'guard-differential-'));
    try {
        const home = join(root, 'home');
        mkdirSync(home);
        const env = gitEnv({
            HOME: home,
            XDG_CONFIG_HOME: join(home, '.config'),
            GIT_CONFIG_GLOBAL: join(home, '.gitconfig'),
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_TERMINAL_PROMPT: '0',
            GIT_EDITOR: 'false',
        });
        const repo = join(root, 'repo');
        await run('git', ['init', '-q', '--template=', repo], { env });
        // The table's `git -C game config ...` row needs the directory to exist to write anything.
        mkdirSync(join(repo, 'game'));
        let succeeded = true;
        try {
            await run('sh', ['-c', command], { cwd: repo, env, timeout: 10_000 });
        } catch (error) {
            if (typeof error.code !== 'number') throw error;
            succeeded = false;
        }
        const keys = await writtenKeys(root, env);
        return {
            command,
            succeeded,
            alias: keys.some((line) => line.startsWith('alias.')),
            push: keys.some((line) => line.startsWith('remote.')),
        };
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
};

/** Map `items` through `fn`, at most `limit` at a time, keeping order. */
const pool = async (items, limit, fn) => {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    };
    await Promise.all(Array.from({ length: limit }, worker));
    return results;
};

describe(`shell guard vs ${gitVersion ?? 'git (not found)'}`, {
    // Each probe runs through `sh -c`, which native Windows does not guarantee.
    skip: process.platform === 'win32' ? 'needs a POSIX sh' : gitVersion ? false : 'git is not installed',
}, () => {
    it('refuses every git config command that writes an alias, push refspec, or mirror key', async (t) => {
        const tableRows = SHELL_CASES.map(([command]) => command).filter((command) =>
            /\bgit\b.*\bconfig\b/.test(command),
        );
        const commands = [...new Set([...tableRows, ...permutations()])];
        const results = await pool(commands, availableParallelism(), probe);

        // The readback must see a plain write, or every assertion below passes vacuously.
        const plainWrites = [
            'git -C game config alias.n reset',
            'git config alias.n reset',
            'git config remote.origin.push +main',
        ];
        const plain = results.filter((r) => plainWrites.includes(r.command));
        assert.deepEqual(
            plain.map((r) => r.alias || r.push),
            [true, true, true],
            'the readback should find the keys a plain git config write sets',
        );

        const bypasses = [];
        const overReach = [];
        for (const { command, succeeded, alias, push } of results) {
            const decision = isDangerousCommand(command)?.decision ?? 'allow';
            if ((alias && decision !== 'deny') || (push && decision === 'allow')) {
                bypasses.push(`${decision}: ${command} (git wrote ${alias ? 'an alias' : 'a push or mirror key'})`);
            } else if (!alias && !push && succeeded && decision !== 'allow') {
                overReach.push(`${decision}: ${command}`);
            }
        }
        if (overReach.length > 0) {
            t.diagnostic(`guard refuses ${overReach.length} commands git ran without writing a guarded key:`);
            for (const line of overReach) t.diagnostic(`  ${line}`);
        }
        assert.deepEqual(
            bypasses,
            [],
            `${bypasses.length} of ${results.length} commands wrote a key the guard let through`,
        );
    });
});
