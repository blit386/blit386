/**
 * Single-source guards between the scaffolder and `@blit386/kit`: the kit it resolves, the agent files it writes
 * against the adapters' in-memory output, and the manifest classes and base copies against `classifyFile`. Requires
 * `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import {
    classifyFile,
    generateClaudeAdapter,
    generateCursorAdapter,
    isKitManaged,
    kitRoot,
    resolveKitRoot,
} from '@blit386/kit/adapters';
import { scaffoldWithManifest } from './helpers.mjs';

/**
 * The scaffolder asks "which kit does this package depend on" (`resolveKitRoot`); the kit CLI asks
 * "which kit contains me" (`kitRoot`). They are different questions with different answers under
 * bundling and linking - see `packages/kit/src/kit-root.ts`. In a normal install they coincide, and
 * every drift guard below silently assumes so. Assert it once, here, so a packaging change fails with
 * this message instead of as an inscrutable byte mismatch further down.
 */
test('the kit the scaffolder resolves is the kit the loaded adapters module lives in', () => {
    assert.equal(resolveKitRoot(import.meta.url), kitRoot());
});

/**
 * Drift guard: scaffold writes must match `@blit386/kit/adapters` generate-to-memory for the same
 * vars. After the shared-adapter refactor this is the same code path; the test still fails if
 * scaffold reintroduces a local copy or skips writing a generated file.
 */
test('scaffold agent files match @blit386/kit/adapters memory output', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-adapter-parity-'));

    try {
        const root = resolveKitRoot(import.meta.url);

        for (const agent of ['claude', 'cursor']) {
            const project = join(work, `${agent}-parity`);
            scaffold({
                targetDir: project,
                projectName: `${agent}-parity`,
                pmInstall: 'pnpm install',
                pmRunDev: 'pnpm run dev',
                pmRunBuild: 'pnpm run build',
                pmRunFormat: 'pnpm run format',
                pmRunLint: 'pnpm run lint',
                agents: [agent],
                packageManager: 'pnpm@11.20.0',
            });

            const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
            assert.ok(manifest.vars, 'manifest must record scaffold-time vars');

            const generated =
                agent === 'claude'
                    ? generateClaudeAdapter(root, manifest.vars)
                    : generateCursorAdapter(root, manifest.vars);

            assert.ok(generated.length > 0, `${agent} adapter should emit files`);

            // The loop below only checks what the adapter claims to emit, so it would happily pass on an
            // adapter that stopped emitting the MCP config entirely. Pin its presence explicitly.
            const mcpPath = agent === 'claude' ? '.mcp.json' : '.cursor/mcp.json';
            assert.ok(
                generated.some((file) => file.path === mcpPath),
                `${agent} adapter should emit ${mcpPath}`,
            );

            for (const file of generated) {
                const onDisk = join(project, file.path);
                assert.ok(existsSync(onDisk), `scaffold should have written ${file.path}`);
                assert.equal(
                    readFileSync(onDisk, 'utf8'),
                    file.content,
                    `scaffold ${file.path} must match kit adapter memory output`,
                );
            }
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

/**
 * Single-source guard: the classes the scaffolder stamps into `.blit/manifest.json` must be exactly
 * what `@blit386/kit`'s shared `classifyFile` returns. These are the same code path now; the test
 * fails if the scaffolder reintroduces a local copy and the two drift.
 */
test('manifest classes match @blit386/kit classifyFile for every generated file', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-classify-'));

    try {
        for (const agent of ['claude', 'cursor']) {
            const { manifest } = scaffoldWithManifest(work, `${agent}-classify`, agent);

            for (const entry of manifest.files) {
                assert.equal(entry.class, classifyFile(entry.path), `${entry.path} class drifted from classifyFile`);
            }

            // A classifier that returned one constant for everything would pass the check above.
            const classes = new Set(manifest.files.map((entry) => entry.class));
            for (const expected of ['kit-owned', 'shared', 'user-owned']) {
                assert.ok(classes.has(expected), `expected at least one ${expected} file in the ${agent} manifest`);
            }
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

/** The pristine `.blit/base/` copy rule is driven by isKitManaged; pin it end-to-end. */
test('every kit-managed file has a pristine .blit/base copy and no user-owned file does', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-base-copies-'));

    try {
        const { project, manifest } = scaffoldWithManifest(work, 'base-copies', 'claude');

        for (const entry of manifest.files) {
            assert.equal(
                existsSync(join(project, '.blit', 'base', entry.path)),
                isKitManaged(entry.class),
                `${entry.path} (${entry.class}) has the wrong .blit/base presence`,
            );
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
