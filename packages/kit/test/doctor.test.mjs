/**
 * CLI tests for `blit doctor`, focused on the D14 kit-engine range check, the .gitattributes check,
 * and the docs-server config check.
 *
 * Each case is a hand-rolled game folder with a fake `node_modules/blit386` version. Requires
 * `pnpm run build` first (the package `pretest` script does that).
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AGENT_KINDS, AGENT_SPECS } from '../dist/ownership.js';

const here = dirname(fileURLToPath(import.meta.url));
const blitCli = join(here, '..', 'dist', 'cli.js');

/**
 * @param {string} engineVersion
 * @returns {string} project root
 */
function makeGame(engineVersion) {
    const root = mkdtempSync(join(tmpdir(), 'blit-doctor-'));
    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ name: 'doctor-game', private: true, dependencies: { blit386: engineVersion } }, null, 4),
    );
    mkdirSync(join(root, 'node_modules', 'blit386'), { recursive: true });
    writeFileSync(
        join(root, 'node_modules', 'blit386', 'package.json'),
        JSON.stringify({ name: 'blit386', version: engineVersion }, null, 4),
    );
    return root;
}

/**
 * @param {string} cwd
 * @returns {{ exitCode: number, output: string }}
 */
function runDoctor(cwd) {
    let exitCode = 0;
    let output = '';
    try {
        output = execFileSync(process.execPath, [blitCli, 'doctor'], {
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

test('blit doctor reports a compatible engine range', () => {
    const root = makeGame('1.7.1');
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(output.includes('is compatible with this kit'), `expected compatible line, got:\n${output}`);
        assert.ok(
            !output.includes('guides were last checked against'),
            `did not expect a docs-review nudge when the engine matches docsReviewedAt, got:\n${output}`,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor nudges to check docs when the engine is newer than docsReviewedAt but still compatible', () => {
    // The kit's committed blit386.docsReviewedAt is "1.7.1" (packages/kit/package.json); a patch release
    // above that still satisfies the ^1.7.0 engineRange, so this exercises the compatible-but-stale branch.
    const root = makeGame('1.7.2');
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(output.includes('is compatible with this kit'), `expected compatible line, got:\n${output}`);
        assert.ok(
            output.includes('guides were last checked against blit386 1.7.1'),
            `expected docs-review nudge, got:\n${output}`,
        );
        assert.ok(
            output.includes('check the changelog if something looks off'),
            `expected docs-review next step, got:\n${output}`,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor warns when the installed engine is older than the kit range', () => {
    const root = makeGame('1.2.0');
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(output.includes('This kit needs blit386'), `expected too-old warn, got:\n${output}`);
        assert.ok(
            output.includes('npx blit upgrade') || output.includes('npm update blit386'),
            `expected update hint, got:\n${output}`,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor warns when the installed engine is newer than the kit was written for', () => {
    const root = makeGame('2.0.0');
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(
            output.includes('guides were written for an older BLIT386'),
            `expected stale-kit warn, got:\n${output}`,
        );
        assert.ok(output.includes('blit agents sync'), `expected kit sync hint, got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor warns when the game has no .gitattributes', () => {
    const root = makeGame('1.7.1');
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(output.includes('No .gitattributes file'), `expected .gitattributes warn, got:\n${output}`);
        assert.ok(output.includes('* text=auto eol=lf'), `expected .gitattributes fix hint, got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor stays quiet about .gitattributes when the game has one', () => {
    const root = makeGame('1.7.1');
    writeFileSync(join(root, '.gitattributes'), '* text=auto eol=lf\n');
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(!output.includes('No .gitattributes file'), `did not expect .gitattributes warn, got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor warns when there is no game package.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'blit-doctor-empty-'));
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(output.includes('No game found here'), `expected no-game warn, got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

function agentSetupPath(kind) {
    const spec = AGENT_SPECS[kind];
    const path = [...spec.files, ...spec.dirs.map((dir) => `${dir}kit-marker.txt`)].find(
        (candidate) => candidate !== spec.mcpConfig,
    );
    assert.ok(path, `${kind} has no private path besides ${spec.mcpConfig}`);
    return path;
}

/**
 * @param {string} root
 * @param {string[]} paths
 */
function writeManifest(root, paths) {
    mkdirSync(join(root, '.blit'), { recursive: true });
    writeFileSync(join(root, '.blit', 'manifest.json'), JSON.stringify({ files: paths.map((path) => ({ path })) }));
}

test('blit doctor warns for every assistant missing its docs server config, and stays quiet once it is there', () => {
    for (const kind of AGENT_KINDS) {
        const root = makeGame('1.7.1');
        const spec = AGENT_SPECS[kind];
        writeManifest(root, [agentSetupPath(kind)]);
        try {
            const missing = runDoctor(root);
            assert.equal(missing.exitCode, 0);
            assert.ok(
                missing.output.includes(`No ${spec.mcpConfig} file, so ${spec.label} cannot look up the BLIT386 docs.`),
                `expected a docs warning for ${kind}, got:\n${missing.output}`,
            );
            assert.ok(
                missing.output.includes('Run `npx blit agents sync` to add it.'),
                `expected the sync hint for ${kind}, got:\n${missing.output}`,
            );

            const mcpFile = join(root, spec.mcpConfig);
            mkdirSync(dirname(mcpFile), { recursive: true });
            writeFileSync(mcpFile, '{}\n');
            const present = runDoctor(root);
            assert.equal(present.exitCode, 0);
            assert.ok(
                !present.output.includes('cannot look up the BLIT386 docs'),
                `did not expect a docs warning for ${kind}, got:\n${present.output}`,
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }
});

test('blit doctor names both assistants when they share one missing docs config', () => {
    const root = makeGame('1.7.1');
    writeManifest(root, [agentSetupPath('claude'), agentSetupPath('copilot')]);
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(
            output.includes('No .mcp.json file, so Claude Code and GitHub Copilot cannot look up the BLIT386 docs.'),
            `expected one shared warning, got:\n${output}`,
        );
        assert.equal(
            output.split('No .mcp.json file').length - 1,
            1,
            `expected the shared config to be warned about once, got:\n${output}`,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor stays quiet about the docs server when the game tracks no assistant', () => {
    const root = makeGame('1.7.1');
    writeManifest(root, ['AGENTS.md', 'docs/getting-started.md']);
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(
            !output.includes('cannot look up the BLIT386 docs'),
            `did not expect a docs warning, got:\n${output}`,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
