/**
 * The manifest's Gemini CLI guard commands block when they cannot run (BT-791): with no `node` on PATH, and with the
 * guard script missing. They also find the script from a project path with a space in it, which the old
 * `"$GEMINI_PROJECT_DIR/..."` form broke, because Gemini substitutes the variable as an already-quoted path.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { hooksDir } from './hook-harness.mjs';

const HARD_RESET = ['git', 'reset', '--hard'].join(' ');

// POSIX only: Gemini runs these through `bash -c` there; its PowerShell path on Windows is BT-847.
describe("the manifest's Gemini CLI guard commands", { skip: process.platform === 'win32' }, () => {
    const manifest = JSON.parse(readFileSync(join(hooksDir, '..', 'hooks.manifest.json'), 'utf8'));
    const commandFor = (id) => manifest.hooks.find((hook) => hook.id === id).gemini.command;
    const shellCommand = commandFor('block-dangerous-shell');
    const filesCommand = commandFor('protect-generated-and-secret-files');

    const tmp = mkdtempSync(join(tmpdir(), 'blit-gemini-guard-'));
    const root = join(tmp, 'my game');
    const bare = join(tmp, 'bare game');
    // A PATH with `bash` and nothing else: the shell Gemini starts on POSIX is there, `node` is not.
    const bashOnlyBin = join(tmp, 'bash-only-bin');

    mkdirSync(join(root, '.gemini', 'hooks'), { recursive: true });
    for (const script of ['shell-guard.cjs', 'protect-files.cjs', 'guard-core.cjs']) {
        cpSync(join(hooksDir, script), join(root, '.gemini', 'hooks', script));
    }
    mkdirSync(join(bare, '.gemini', 'hooks'), { recursive: true });
    mkdirSync(bashOnlyBin);
    symlinkSync(
        spawnSync('/bin/sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim(),
        join(bashOnlyBin, 'bash'),
    );

    after(() => rmSync(tmp, { recursive: true, force: true }));

    // Gemini replaces the variable in the command text with the shell-quoted dir (hookRunner.ts `expandCommand`).
    const expand = (command, dir) =>
        command.replaceAll('$GEMINI_PROJECT_DIR', () => `'${dir.replaceAll("'", "'\\''")}'`);

    /** Run one settings.json command as Gemini does on POSIX: expanded, then `bash -c` from the project dir. */
    const run = (command, input, { cwd = root, path = process.env.PATH } = {}) =>
        spawnSync('bash', ['-c', expand(command, cwd)], {
            cwd,
            env: { ...process.env, PATH: path, GEMINI_PROJECT_DIR: cwd },
            input: JSON.stringify(input),
            encoding: 'utf8',
        });
    const shell = (command) => ({
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
        tool_input: { command },
    });
    const write = (file) => ({
        hook_event_name: 'BeforeTool',
        tool_name: 'write_file',
        tool_input: { file_path: file },
    });

    it('pass the guard verdicts through unchanged', () => {
        assert.equal(run(shellCommand, shell(HARD_RESET)).status, 2);
        assert.equal(run(shellCommand, shell('ls')).status, 0);
        assert.equal(run(filesCommand, write(join(root, '.env'))).status, 2);
        assert.equal(run(filesCommand, write(join(root, 'src', 'game.js'))).status, 0);
    });

    it('block when node cannot be found', () => {
        for (const command of [shellCommand, filesCommand]) {
            const result = spawnSync(join(bashOnlyBin, 'bash'), ['-c', expand(command, root)], {
                cwd: root,
                env: { PATH: bashOnlyBin, GEMINI_PROJECT_DIR: root },
                // No payload: bash exits before reading stdin, so writing one races into EPIPE.
                encoding: 'utf8',
            });

            // Gemini blocks on any exit other than 0 or 1 that prints text (hookRunner.ts `convertPlainTextToHookOutput`).
            assert.equal(result.error, undefined, command);
            assert.equal(result.status, 127, command);
            assert.match(result.stderr, /node: command not found/, command);
        }
    });

    it('block, with a message, when the guard script is missing', () => {
        for (const command of [shellCommand, filesCommand]) {
            // No payload, for the same EPIPE race: the loader fails before anything reads stdin.
            const result = run(command, undefined, { cwd: bare });

            assert.equal(result.status, 2, command);
            assert.match(result.stderr, /\[BLOCKED\] The blit386 guard could not run/, command);
        }
    });
});
