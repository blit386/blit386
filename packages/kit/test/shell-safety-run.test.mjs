/**
 * Cursor starts shell-safety.sh through this runner because `sh` is not on the Windows hook PATH.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const runner = join(here, '..', 'content', 'hooks', 'shell-safety-run.cjs');
const script = join(here, '..', 'content', 'hooks', 'shell-safety.sh');

/**
 * @param {string} command
 */
/**
 * @param {string} payload
 */
function runRaw(payload) {
    const result = spawnSync(process.execPath, [runner, script], { input: payload, encoding: 'utf8' });

    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * @param {string} command
 */
function run(command) {
    return runRaw(
        JSON.stringify({
            hook_event_name: 'beforeShellExecution',
            command,
            cwd: here,
            sandbox: false,
        }),
    );
}

describe('cursor shell-safety runner', () => {
    it('allows a harmless command', () => {
        const result = run('echo test');
        assert.equal(result.status, 0);
        assert.equal(JSON.parse(result.stdout).permission, 'allow');
    });

    it('allows git diff --cached', () => {
        const result = run('git diff --cached');
        assert.equal(result.status, 0);
        assert.equal(JSON.parse(result.stdout).permission, 'allow');
    });

    it('denies git reset --hard', () => {
        const result = run('git reset --hard');
        assert.equal(result.status, 0);
        assert.equal(JSON.parse(result.stdout).permission, 'deny');
    });

    it('asks before a force push', () => {
        const result = run('git push --force');
        assert.equal(result.status, 0);
        assert.equal(JSON.parse(result.stdout).permission, 'ask');
    });

    it('denies a payload that does not parse', () => {
        const result = runRaw('not-json');
        assert.equal(result.status, 0);
        assert.equal(JSON.parse(result.stdout).permission, 'deny');
    });

    it('allows a payload prefixed with a UTF-8 BOM', () => {
        const payload = `\uFEFF${JSON.stringify({
            hook_event_name: 'beforeShellExecution',
            command: 'echo test',
        })}`;
        const result = runRaw(payload);
        assert.equal(result.status, 0);
        assert.equal(JSON.parse(result.stdout).permission, 'allow');
    });

    it('allows a payload with no command', () => {
        const result = runRaw(JSON.stringify({ hook_event_name: 'beforeShellExecution' }));
        assert.equal(result.status, 0);
        assert.equal(JSON.parse(result.stdout).permission, 'allow');
    });
});
