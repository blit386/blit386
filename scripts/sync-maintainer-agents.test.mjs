import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    findOrphanMaintainerPaths,
    kitHookLinkTarget,
    OWNED_DIRS,
    OWNED_EXACT_FILES,
    planMaintainerEntries,
    symlinkHookBasename,
    SKIP_PATHS,
} from './sync-maintainer-agents.mjs';

describe('sync-maintainer-agents', () => {
    describe('SKIP_PATHS', () => {
        it('skips the root MCP config and the Copilot setup workflow', () => {
            assert.ok(SKIP_PATHS.has('.mcp.json'));
            assert.ok(SKIP_PATHS.has('.github/workflows/copilot-setup-steps.yml'));
        });
    });

    describe('symlinkHookBasename', () => {
        const kit = new Map([['guard-core.cjs', 'shared\n']]);
        const readKit = (name) => kit.get(name) ?? null;

        it('returns the basename for a hooks-dir script whose bytes match the kit copy', () => {
            assert.equal(symlinkHookBasename('.codex/hooks/guard-core.cjs', 'shared\n', readKit), 'guard-core.cjs');
        });

        it('returns null when the content was rendered differently', () => {
            assert.equal(symlinkHookBasename('.codex/hooks/guard-core.cjs', 'different\n', readKit), null);
        });

        it('returns null for JSON, TOML, or TypeScript outputs', () => {
            assert.equal(symlinkHookBasename('.codex/hooks.json', '{}', readKit), null);
            assert.equal(symlinkHookBasename('.codex/config.toml', 'x = 1\n', readKit), null);
            assert.equal(symlinkHookBasename('.opencode/plugins/kit-guard.ts', 'export {}\n', readKit), null);
        });

        it('returns null for a matching basename outside a hooks directory', () => {
            assert.equal(symlinkHookBasename('guard-core.cjs', 'shared\n', readKit), null);
        });
    });

    describe('kitHookLinkTarget', () => {
        it('walks up two levels from an agent hooks directory', () => {
            assert.equal(
                kitHookLinkTarget('.codex/hooks/guard-core.cjs', 'guard-core.cjs'),
                '../../packages/kit/content/hooks/guard-core.cjs',
            );
            assert.equal(
                kitHookLinkTarget('.github/hooks/copilot-hook.cjs', 'copilot-hook.cjs'),
                '../../packages/kit/content/hooks/copilot-hook.cjs',
            );
        });
    });

    describe('planMaintainerEntries', () => {
        const kit = new Map([
            ['guard-core.cjs', 'core\n'],
            ['session-start.sh', 'start\n'],
        ]);
        const readKit = (name) => kit.get(name) ?? null;

        it('skips SKIP_PATHS, symlinks matching hooks, and writes the rest', () => {
            const plan = planMaintainerEntries(
                [
                    { path: '.mcp.json', content: '{}\n' },
                    { path: '.github/workflows/copilot-setup-steps.yml', content: 'name: x\n' },
                    { path: '.codex/hooks/guard-core.cjs', content: 'core\n' },
                    { path: '.codex/hooks.json', content: '{"hooks":{}}\n' },
                    { path: '.opencode/plugins/kit-guard.ts', content: 'export {}\n' },
                    { path: '.opencode/hooks/session-start.sh', content: 'start\n' },
                ],
                readKit,
            );

            assert.deepEqual(
                plan.map((entry) => [entry.path, entry.kind]),
                [
                    ['.codex/hooks.json', 'write'],
                    ['.codex/hooks/guard-core.cjs', 'symlink'],
                    ['.opencode/hooks/session-start.sh', 'symlink'],
                    ['.opencode/plugins/kit-guard.ts', 'write'],
                ],
            );
            assert.equal(
                plan.find((entry) => entry.path === '.codex/hooks/guard-core.cjs')?.linkTarget,
                '../../packages/kit/content/hooks/guard-core.cjs',
            );
            assert.equal(plan.find((entry) => entry.path === '.codex/hooks.json')?.content, '{"hooks":{}}\n');
        });
    });

    describe('findOrphanMaintainerPaths', () => {
        it('flags files under owned dirs and exact owned paths that are not expected', () => {
            const orphans = findOrphanMaintainerPaths(
                [
                    '.codex/hooks/old.cjs',
                    '.codex/hooks/guard-core.cjs',
                    '.agents/hooks.json',
                    '.agents/skills/format/SKILL.md',
                    'README.md',
                ],
                new Set(['.codex/hooks/guard-core.cjs']),
                OWNED_DIRS,
                OWNED_EXACT_FILES,
            );

            assert.deepEqual(orphans, ['.agents/hooks.json', '.codex/hooks/old.cjs']);
        });

        it('returns an empty array when every owned path is expected', () => {
            assert.deepEqual(
                findOrphanMaintainerPaths(
                    ['.codex/hooks.json', 'opencode.json'],
                    new Set(['.codex/hooks.json', 'opencode.json']),
                    OWNED_DIRS,
                    OWNED_EXACT_FILES,
                ),
                [],
            );
        });
    });
});
