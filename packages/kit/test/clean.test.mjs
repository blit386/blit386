/**
 * CLI tests for `blit clean`: language detection, the scaffolded-vs-modified safety check, the
 * confirm prompt (and `--yes` bypass), and the `.blit/manifest.json` hash update after a clean.
 *
 * Requires `pnpm run build` first (the package `pretest` script does that).
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const blitCli = join(here, '..', 'dist', 'cli.js');

const DEFAULT_GAME_SOURCE = "import { bootstrap } from 'blit386';\n\nclass Game {}\n\nbootstrap(Game);\n";

function sha256(text) {
    return createHash('sha256').update(text).digest('hex');
}

/**
 * Minimal scaffolded-looking game folder.
 *
 * @param {{
 *   language?: 'ts' | 'js',
 *   gameSource?: string,
 *   withManifest?: boolean,
 *   manifestSource?: string,
 *   skipGameFile?: boolean,
 * }} [opts]
 * @returns {string}
 */
function makeGame(opts = {}) {
    const language = opts.language ?? 'ts';
    const root = mkdtempSync(join(tmpdir(), 'blit-clean-'));

    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'clean-game', private: true }, null, 4));
    writeFileSync(join(root, language === 'ts' ? 'tsconfig.json' : 'jsconfig.json'), '{}\n');

    const gameRelPath = `src/game.${language}`;
    const gameSource = opts.gameSource ?? DEFAULT_GAME_SOURCE;

    if (!opts.skipGameFile) {
        mkdirSync(join(root, 'src'), { recursive: true });
        writeFileSync(join(root, gameRelPath), gameSource);
    }

    if (opts.withManifest !== false) {
        const manifestSource = opts.manifestSource ?? gameSource;
        mkdirSync(join(root, '.blit'), { recursive: true });
        writeFileSync(
            join(root, '.blit', 'manifest.json'),
            JSON.stringify(
                {
                    kitVersion: '1.6.0',
                    createdAt: new Date().toISOString(),
                    vars: {},
                    files: [
                        { path: gameRelPath, class: 'user-owned', kitVersion: '1.6.0', sha256: sha256(manifestSource) },
                    ],
                },
                null,
                2,
            ),
        );
    }

    return { root, gameRelPath };
}

/**
 * @param {string} cwd
 * @param {string[]} [args]
 * @returns {{ exitCode: number, output: string }}
 */
function runClean(cwd, args = []) {
    let exitCode = 0;
    let output = '';
    try {
        output = execFileSync(process.execPath, [blitCli, 'clean', ...args], {
            cwd,
            encoding: 'utf8',
            env: { ...process.env, NO_COLOR: '1' },
        });
    } catch (err) {
        exitCode = err.status ?? 1;
        output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    return { exitCode, output };
}

test('blit clean replaces an unmodified TS game with the empty skeleton when passed --yes', () => {
    const { root, gameRelPath } = makeGame({ language: 'ts' });
    try {
        const { exitCode, output } = runClean(root, ['--yes']);
        assert.equal(exitCode, 0, `expected success, got ${exitCode}:\n${output}`);
        assert.ok(output.includes('Replaced'), `expected a success line, got:\n${output}`);

        const content = readFileSync(join(root, gameRelPath), 'utf8');
        assert.ok(content.includes('class Game'), 'skeleton should still declare Game');
        assert.ok(content.includes('async init(): Promise<boolean>'), 'TS skeleton should keep the typed signature');
        assert.ok(!content.includes('Catcher'), 'skeleton must not contain the old demo');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit clean replaces an unmodified JS game with the empty skeleton when passed --yes', () => {
    const { root, gameRelPath } = makeGame({ language: 'js' });
    try {
        const { exitCode, output } = runClean(root, ['--yes']);
        assert.equal(exitCode, 0, `expected success, got ${exitCode}:\n${output}`);

        const content = readFileSync(join(root, gameRelPath), 'utf8');
        assert.ok(content.includes('class Game'), 'skeleton should still declare Game');
        assert.ok(!content.includes('Promise<boolean>'), 'JS skeleton must not carry TS type annotations');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit clean updates the manifest hash after a successful clean', () => {
    const { root, gameRelPath } = makeGame({ language: 'ts' });
    try {
        runClean(root, ['--yes']);

        const manifest = JSON.parse(readFileSync(join(root, '.blit', 'manifest.json'), 'utf8'));
        const entry = manifest.files.find((f) => f.path === gameRelPath);
        const newContent = readFileSync(join(root, gameRelPath), 'utf8');

        assert.equal(entry.sha256, sha256(newContent), 'manifest hash should match the new skeleton content');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit clean declines without --yes on a non-interactive terminal, leaving the file untouched', () => {
    const { root, gameRelPath } = makeGame({ language: 'ts' });
    try {
        const { exitCode, output } = runClean(root);
        assert.equal(exitCode, 0, `expected exit 0, got ${exitCode}:\n${output}`);
        assert.ok(output.includes('No changes made'), `expected a cancel message, got:\n${output}`);

        const content = readFileSync(join(root, gameRelPath), 'utf8');
        assert.equal(content, DEFAULT_GAME_SOURCE, 'file must be untouched when the user declines');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit clean warns before discarding a game that no longer matches the scaffolded default', () => {
    const { root } = makeGame({
        language: 'ts',
        gameSource: "import { bootstrap } from 'blit386';\n\nclass Game { myOwnCode = true; }\n\nbootstrap(Game);\n",
        manifestSource: DEFAULT_GAME_SOURCE,
    });
    try {
        const { exitCode, output } = runClean(root);
        assert.equal(exitCode, 0, `expected exit 0, got ${exitCode}:\n${output}`);
        assert.ok(
            output.includes('changed since it was scaffolded'),
            `expected a modified-file warning, got:\n${output}`,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit clean fails outside a game folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'blit-clean-empty-'));
    try {
        const { exitCode, output } = runClean(root, ['--yes']);
        assert.equal(exitCode, 1);
        assert.ok(output.includes("Couldn't find a game here"), `expected a no-project error, got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit clean fails when it cannot tell JS from TS', () => {
    const root = mkdtempSync(join(tmpdir(), 'blit-clean-no-lang-'));
    try {
        writeFileSync(join(root, 'package.json'), '{}\n');
        const { exitCode, output } = runClean(root, ['--yes']);
        assert.equal(exitCode, 1);
        assert.ok(output.includes("Couldn't tell if this is a JavaScript or TypeScript project"), `got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit clean fails when the game file is missing', () => {
    const { root } = makeGame({ language: 'ts', skipGameFile: true, withManifest: false });
    try {
        const { exitCode, output } = runClean(root, ['--yes']);
        assert.equal(exitCode, 1);
        assert.ok(output.includes("Couldn't find src/game.ts"), `got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
