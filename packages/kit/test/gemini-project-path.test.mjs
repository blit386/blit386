/**
 * The manifest's Gemini CLI `format-file` and session-start commands find their script from a project path with a space
 * in it (BT-848). The old `"$GEMINI_PROJECT_DIR/..."` form broke there, because Gemini substitutes the variable as an
 * already-quoted path, so no edited file was formatted and the session bootstrap never ran.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { hooksDir } from './hook-harness.mjs';

// POSIX only: Gemini runs these through `bash -c` there; the session-start command is POSIX-only anyway.
describe("the manifest's Gemini CLI format and session-start commands", { skip: process.platform === 'win32' }, () => {
    const manifest = JSON.parse(readFileSync(join(hooksDir, '..', 'hooks.manifest.json'), 'utf8'));
    const commandFor = (id) => manifest.hooks.find((hook) => hook.gemini?.command.includes(id)).gemini.command;
    const formatCommand = commandFor('format-file.cjs');
    const sessionCommand = commandFor('session-start.sh').replaceAll('{{pmInstall}}', 'echo install-ran');

    // realpath: format-file.cjs resolves the project root through symlinks (macOS /var is /private/var).
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'blit-gemini-path-')));
    const root = join(tmp, 'my game');
    const marker = join(tmp, 'formatted.txt');

    mkdirSync(join(root, '.gemini', 'hooks'), { recursive: true });
    for (const script of ['format-file.cjs', 'session-start.sh']) {
        cpSync(join(hooksDir, script), join(root, '.gemini', 'hooks', script));
    }
    // A stand-in Biome that records the file it was asked to format, so the test needs no real formatter.
    const biomeDir = join(root, 'node_modules', '@biomejs', 'biome');
    mkdirSync(biomeDir, { recursive: true });
    writeFileSync(join(biomeDir, 'package.json'), JSON.stringify({ bin: { biome: 'fake-biome.cjs' } }));
    writeFileSync(
        join(biomeDir, 'fake-biome.cjs'),
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, process.argv.at(-1));\n`,
    );
    writeFileSync(join(root, 'game.js'), 'export {}\n');

    after(() => rmSync(tmp, { recursive: true, force: true }));

    // Gemini replaces the variable in the command text with the shell-quoted dir (hookRunner.ts `expandCommand`).
    const expand = (command, dir) =>
        command.replaceAll('$GEMINI_PROJECT_DIR', () => `'${dir.replaceAll("'", "'\\''")}'`);

    /** Run one settings.json command as Gemini does on POSIX: expanded, then `bash -c` from the project dir. */
    const run = (command, cwd, input) =>
        spawnSync('bash', ['-c', expand(command, cwd)], {
            cwd,
            env: { ...process.env, GEMINI_PROJECT_DIR: cwd },
            input: input === undefined ? undefined : JSON.stringify(input),
            encoding: 'utf8',
        });

    it('format the edited file inside the project', () => {
        const result = run(formatCommand, root, {
            hook_event_name: 'AfterTool',
            tool_name: 'write_file',
            tool_input: { file_path: join(root, 'game.js') },
        });

        assert.equal(result.status, 0, result.stderr);
        assert.equal(readFileSync(marker, 'utf8'), join(root, 'game.js'));
    });

    it('run the session bootstrap from the project dir', () => {
        // A project with no node_modules, so the bootstrap runs its install command.
        const fresh = join(tmp, 'fresh game');
        mkdirSync(join(fresh, '.gemini', 'hooks'), { recursive: true });
        cpSync(join(hooksDir, 'session-start.sh'), join(fresh, '.gemini', 'hooks', 'session-start.sh'));

        const result = run(sessionCommand, fresh);

        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /install-ran/);
    });
});
