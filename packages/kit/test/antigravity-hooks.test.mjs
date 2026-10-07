/**
 * The Antigravity adapter's emitted hooks: the hooks.json shape, the fail-closed guard entry, the
 * once-per-conversation bootstrap, and format-on-edit reading Antigravity's payload.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { generateAntigravityAdapter, kitRoot } from '../dist/adapters.js';

const hooksDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'hooks');
const WRITE_TOOLS = 'write_to_file|replace_file_content|multi_replace_file_content';

/** Run an entry script with `input` on stdin (a string is sent as-is, anything else as JSON). */
function run(script, args, input) {
    return spawnSync(process.execPath, [join(hooksDir, script), ...args], {
        input: typeof input === 'string' ? input : JSON.stringify(input),
        encoding: 'utf8',
    });
}

const guard = (mode, input) => {
    const result = run('antigravity-guard.cjs', [mode], input);

    assert.equal(result.status, 0);

    return JSON.parse(result.stdout);
};

const writeCall = (TargetFile) => ({ toolCall: { name: 'write_to_file', args: { TargetFile } } });
const shellCall = (CommandLine) => ({ toolCall: { name: 'run_command', args: { CommandLine } } });

describe('.agents/hooks.json', () => {
    const files = generateAntigravityAdapter(kitRoot(), { pmInstall: 'pnpm install' });
    const hooks = JSON.parse(files.find((file) => file.path === '.agents/hooks.json').content);

    it('keys each guard by group name, then event, with the right tool matcher', () => {
        const handler = (group, event) => hooks[group][event][0];

        assert.equal(handler('blit-block-dangerous-shell', 'PreToolUse').matcher, 'run_command');
        assert.equal(handler('blit-protect-generated-and-secret-files', 'PreToolUse').matcher, WRITE_TOOLS);
        assert.equal(handler('blit-format-on-edit', 'PostToolUse').matcher, WRITE_TOOLS);

        // PreInvocation takes bare handlers, not a matcher group around a `hooks` array.
        const bootstrap = handler('blit-session-start-bootstrap', 'PreInvocation');

        assert.equal(bootstrap.type, 'command');
        assert.equal(bootstrap.hooks, undefined);
        assert.match(bootstrap.command, /"pnpm install"$/);
    });

    it('ships every script it runs, plus the guard core, and nothing Claude-only', () => {
        const paths = files.map((file) => file.path);

        for (const script of [
            'antigravity-guard',
            'antigravity-bootstrap',
            'bootstrap-core',
            'format-file',
            'guard-core',
        ]) {
            assert.ok(paths.includes(`.agents/hooks/${script}.cjs`), script);
        }

        assert.ok(!paths.some((path) => path.endsWith('.sh') || path.includes('protect-files')));
        assert.ok(!paths.some((path) => path.startsWith('.agents/workflows/') || path.startsWith('.gemini/')));
    });
});

describe('antigravity-guard.cjs', () => {
    it('denies lock files and .env, and hands an ordinary edit back to the approval flow', () => {
        assert.equal(guard('files', writeCall('/game/pnpm-lock.yaml')).decision, 'deny');
        assert.equal(guard('files', writeCall('/game/.env')).decision, 'deny');
        assert.deepEqual(guard('files', writeCall('/game/src/game.ts')), { decision: 'ask' });
    });

    it('denies a hard reset, asks on force push, never auto-approves an ordinary command', () => {
        assert.equal(guard('shell', shellCall('git reset --hard HEAD~1')).decision, 'deny');
        assert.equal(guard('shell', shellCall('git push --force')).decision, 'ask');
        assert.equal(guard('shell', shellCall('git status')).decision, 'ask');
    });

    it('fails closed on every unreadable request', () => {
        const unreadable = [
            ['files', 'not json'],
            ['files', {}],
            ['files', { toolCall: { args: { CommandLine: 'x' } } }],
            ['shell', { toolCall: { args: { TargetFile: 'x' } } }],
            ['unknown', writeCall('src/a.ts')],
            [undefined, writeCall('src/a.ts')],
        ];

        for (const [mode, input] of unreadable) {
            const result = run('antigravity-guard.cjs', mode === undefined ? [] : [mode], input);

            assert.equal(result.status, 0);
            assert.equal(JSON.parse(result.stdout).decision, 'deny', JSON.stringify([mode, input]));
        }
    });
});

describe('antigravity-bootstrap.cjs', () => {
    it('runs once per conversation, not on every model call', () => {
        const root = mkdtempSync(join(tmpdir(), 'blit-bootstrap-'));
        const conversationId = `test-${Date.now()}-${Math.random()}`;
        const payload = { conversationId, workspacePaths: [root], invocationNum: 0 };
        const bootstrap = (input) => JSON.parse(run('antigravity-bootstrap.cjs', ['npm install'], input).stdout);

        try {
            mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
            writeFileSync(join(root, 'node_modules', '.bin', 'blit'), '#!/bin/sh\necho checkup-ok\n', { mode: 0o755 });

            const first = bootstrap(payload);
            const second = bootstrap(payload);
            const other = bootstrap({ ...payload, conversationId: `${conversationId}-b` });
            // A UTF-8 BOM in front of the payload is stripped by the shared parser, not by a copy of that rule here.
            const bom = bootstrap(`﻿${JSON.stringify({ ...payload, conversationId: `${conversationId}-c` })}`);

            assert.match(first.injectSteps[0].ephemeralMessage, /checkup-ok/);
            assert.deepEqual(second, {});
            assert.ok(other.injectSteps, 'a new conversation runs the bootstrap again');
            assert.ok(bom.injectSteps, 'a BOM-prefixed payload is read like any other');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('answers {} and never fails on an unreadable payload', () => {
        const result = run('antigravity-bootstrap.cjs', [], 'nope');

        assert.equal(result.status, 0);
        assert.deepEqual(JSON.parse(result.stdout), {});
    });
});

describe('format-file.cjs under .agents/hooks/', () => {
    it('formats the file named in toolCall.args.TargetFile', () => {
        const root = mkdtempSync(join(tmpdir(), 'blit-agy-fmt-'));
        const biome = join(root, 'node_modules', '@biomejs', 'biome');

        try {
            mkdirSync(join(root, '.agents', 'hooks'), { recursive: true });
            mkdirSync(join(biome, 'bin'), { recursive: true });
            mkdirSync(join(root, 'src'));
            cpSync(join(hooksDir, 'format-file.cjs'), join(root, '.agents', 'hooks', 'format-file.cjs'));
            writeFileSync(join(biome, 'package.json'), JSON.stringify({ bin: { biome: 'bin/biome' } }));
            writeFileSync(
                join(biome, 'bin', 'biome'),
                "const fs = require('node:fs'); const f = process.argv.at(-1); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').toUpperCase());",
            );
            writeFileSync(join(root, 'src', 'game.js'), 'edited');

            const result = spawnSync(process.execPath, [join(root, '.agents', 'hooks', 'format-file.cjs')], {
                input: JSON.stringify(writeCall(join(root, 'src', 'game.js'))),
                encoding: 'utf8',
            });

            assert.equal(result.status, 0);
            assert.equal(readFileSync(join(root, 'src', 'game.js'), 'utf8'), 'EDITED');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
