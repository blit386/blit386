import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    MAINTAINER_CONFIG_SPECS,
    checkRootSkillsLayout,
    discoverPackageAgentRoots,
    findAgentsPointerFailures,
    findCopilotPointerFailures,
    findCursorMcpFailures,
    findMaintainerConfigFailures,
    findMaintainerHookSymlinkFailures,
    findProjectMcpFailures,
    findRulesParityFailures,
    findSkillsSymlinkFailures,
    findZedSettingsFailures,
    isPathIgnoredByGit,
    isRootMcpIgnoredByGit,
    resolveSkillSymlinkTarget,
} from './check-agent-config.mjs';

/** @param {string} path */
function maintainerSpec(path) {
    const spec = MAINTAINER_CONFIG_SPECS.find((entry) => entry.path === path);
    if (!spec) {
        throw new Error(`missing MAINTAINER_CONFIG_SPECS entry for ${path}`);
    }
    return spec;
}

describe('check-agent-config', () => {
    describe('findSkillsSymlinkFailures', () => {
        it('passes when every symlink resolves to a same-named claude skill directory', () => {
            const failures = findSkillsSymlinkFailures(
                [
                    { name: 'bt-format', isSymlink: true, resolvedName: 'bt-format' },
                    { name: 'bt-test', isSymlink: true, resolvedName: 'bt-test' },
                ],
                ['bt-format', 'bt-test'],
            );
            assert.deepEqual(failures, []);
        });

        it('fails when an .agents/skills entry is not a symlink', () => {
            const failures = findSkillsSymlinkFailures(
                [{ name: 'bt-format', isSymlink: false, resolvedName: null }],
                [],
            );
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.agents\/skills\/bt-format is not a symlink/);
        });

        it('fails when a symlink is broken (target missing)', () => {
            const failures = findSkillsSymlinkFailures(
                [{ name: 'bt-format', isSymlink: true, resolvedName: null }],
                [],
            );
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.agents\/skills\/bt-format is a broken symlink/);
        });

        it('fails when a symlink resolves to a differently named claude skill', () => {
            const failures = findSkillsSymlinkFailures(
                [{ name: 'bt-format', isSymlink: true, resolvedName: 'bt-other' }],
                [],
            );
            assert.equal(failures.length, 1);
            assert.match(
                failures[0],
                /\.agents\/skills\/bt-format resolves to \.claude\/skills\/bt-other, expected bt-format/,
            );
        });

        it('fails when a .claude/skills directory has no matching .agents/skills symlink', () => {
            const failures = findSkillsSymlinkFailures(
                [{ name: 'bt-format', isSymlink: true, resolvedName: 'bt-format' }],
                ['bt-format', 'bt-new-skill'],
            );
            assert.equal(failures.length, 1);
            assert.match(
                failures[0],
                /\.claude\/skills\/bt-new-skill has no matching \.agents\/skills\/bt-new-skill symlink/,
            );
        });
    });

    describe('resolveSkillSymlinkTarget', () => {
        it('returns the skill name for a direct child skill directory', () => {
            const resolved = resolveSkillSymlinkTarget('/repo/.claude/skills/bt-format', true, '/repo/.claude/skills');
            assert.equal(resolved, 'bt-format');
        });

        it('rejects a target nested more than one level below .claude/skills', () => {
            const resolved = resolveSkillSymlinkTarget(
                '/repo/.claude/skills/bt-format-extra/nested/bt-format',
                true,
                '/repo/.claude/skills',
            );
            assert.equal(resolved, null);
        });

        it('rejects a target that is a file rather than a directory', () => {
            const resolved = resolveSkillSymlinkTarget('/repo/.claude/skills/bt-format', false, '/repo/.claude/skills');
            assert.equal(resolved, null);
        });
    });

    describe('findAgentsPointerFailures', () => {
        it('passes when AGENTS.md links to an existing CLAUDE.md', () => {
            const content = 'This repository uses [`CLAUDE.md`](CLAUDE.md) as the canonical policy document.';
            assert.deepEqual(findAgentsPointerFailures(content, true), []);
        });

        it('fails when AGENTS.md is missing', () => {
            const failures = findAgentsPointerFailures(null, true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /AGENTS\.md is missing/);
        });

        it('fails when AGENTS.md does not reference CLAUDE.md', () => {
            const failures = findAgentsPointerFailures('This repository has no pointer.', true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /AGENTS\.md does not reference CLAUDE\.md/);
        });

        it('fails when CLAUDE.md is missing even though AGENTS.md references it', () => {
            const content = 'This repository uses [`CLAUDE.md`](CLAUDE.md) as the canonical policy document.';
            const failures = findAgentsPointerFailures(content, false);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /CLAUDE\.md is missing/);
        });
    });

    describe('findCopilotPointerFailures', () => {
        const validContent = 'See [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md) before non-trivial work.';

        it('passes when Copilot instructions link to existing AGENTS.md and CLAUDE.md', () => {
            assert.deepEqual(findCopilotPointerFailures(validContent, true, true), []);
        });

        it('fails when .github/copilot-instructions.md is missing', () => {
            const failures = findCopilotPointerFailures(null, true, true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.github\/copilot-instructions\.md is missing/);
        });

        it('fails when Copilot instructions do not reference AGENTS.md', () => {
            const content = 'See [`CLAUDE.md`](../CLAUDE.md) only.';
            const failures = findCopilotPointerFailures(content, true, true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /does not reference AGENTS\.md/);
        });

        it('fails when Copilot instructions do not reference CLAUDE.md', () => {
            const content = 'See [`AGENTS.md`](../AGENTS.md) only.';
            const failures = findCopilotPointerFailures(content, true, true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /does not reference CLAUDE\.md/);
        });

        it('fails when AGENTS.md is missing even though Copilot instructions reference it', () => {
            const failures = findCopilotPointerFailures(validContent, false, true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /AGENTS\.md is missing/);
        });

        it('fails when CLAUDE.md is missing even though Copilot instructions reference it', () => {
            const failures = findCopilotPointerFailures(validContent, true, false);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /CLAUDE\.md is missing/);
        });
    });

    describe('findZedSettingsFailures', () => {
        // Deliberately the literal wire value, not the checker's constant - pinning it is the point.
        const ZED_SETTINGS_WITH_MCP =
            '{\n  "context_servers": { "blit386-docs": { "url": "https://blit386.dev/mcp" } }\n}\n';

        it('passes when .zed/settings.json is valid JSON and .agents/skills layout exists', () => {
            const content = `// Project-level Zed settings\n${ZED_SETTINGS_WITH_MCP}`;
            assert.deepEqual(findZedSettingsFailures(content, true), []);
        });

        it('fails when the Zed MCP server points away from the pinned URL', () => {
            const content = ZED_SETTINGS_WITH_MCP.replace('https://blit386.dev/mcp', 'https://evil.example/mcp');
            const failures = findZedSettingsFailures(content, true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /context_servers\.blit386-docs\.url is "https:\/\/evil\.example\/mcp"/);
        });

        it('fails when the Zed settings do not declare the MCP server', () => {
            const failures = findZedSettingsFailures('{\n  "agent": {}\n}\n', true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /context_servers\.blit386-docs\.url is undefined/);
        });

        it('fails when .zed/settings.json is missing', () => {
            const failures = findZedSettingsFailures(null, true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.zed\/settings\.json is missing/);
        });

        it('fails when .zed/settings.json is not parseable as JSON', () => {
            const failures = findZedSettingsFailures('{not json', true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.zed\/settings\.json is not parseable as JSON/);
        });

        it('fails when .agents/skills layout is missing while .zed/settings.json exists', () => {
            const failures = findZedSettingsFailures(ZED_SETTINGS_WITH_MCP, false);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.agents\/skills layout is missing while \.zed\/settings\.json exists/);
        });
    });

    describe('findRulesParityFailures', () => {
        it('passes when cursor and claude rule sets match by basename', () => {
            const failures = findRulesParityFailures(
                ['docs-sync-required', 'named-constants'],
                ['docs-sync-required', 'named-constants'],
            );
            assert.deepEqual(failures, []);
        });

        it('fails when a .cursor/rules entry has no matching .claude/rules file', () => {
            const failures = findRulesParityFailures(['docs-sync-required', 'orphan-rule'], ['docs-sync-required']);
            assert.equal(failures.length, 1);
            assert.match(
                failures[0],
                /\.cursor\/rules\/orphan-rule\.mdc has no matching \.claude\/rules\/orphan-rule\.md/,
            );
        });

        it('fails when a .claude/rules entry has no matching .cursor/rules file', () => {
            const failures = findRulesParityFailures(['docs-sync-required'], ['docs-sync-required', 'new-rule']);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.claude\/rules\/new-rule\.md has no matching \.cursor\/rules\/new-rule\.mdc/);
        });

        it('sorts failures and reports both directions in one call', () => {
            const failures = findRulesParityFailures(['cursor-only'], ['claude-only']);
            assert.deepEqual(failures, [
                '.claude/rules/claude-only.md has no matching .cursor/rules/claude-only.mdc',
                '.cursor/rules/cursor-only.mdc has no matching .claude/rules/cursor-only.md',
            ]);
        });
    });

    describe('findProjectMcpFailures', () => {
        const MCP_CONFIG = JSON.stringify({
            mcpServers: { 'blit386-docs': { type: 'http', url: 'https://blit386.dev/mcp' } },
        });
        const SERVER_CARD = JSON.stringify({
            serverInfo: { name: 'blit386-docs', version: '1.0.0' },
            url: 'https://blit386.dev/mcp',
        });
        const NOT_IGNORED = false;

        it('passes when the config and the discovery card agree and git does not ignore the file', () => {
            assert.deepEqual(findProjectMcpFailures(MCP_CONFIG, SERVER_CARD, NOT_IGNORED), []);
        });

        it('fails when .mcp.json is missing', () => {
            const failures = findProjectMcpFailures(null, SERVER_CARD, NOT_IGNORED);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.mcp\.json is missing/);
        });

        it('fails when .mcp.json is not parseable as JSON', () => {
            const failures = findProjectMcpFailures('{not json', SERVER_CARD, NOT_IGNORED);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.mcp\.json is not parseable as JSON/);
        });

        it('fails when the mcpServers object is absent', () => {
            const failures = findProjectMcpFailures('{}', SERVER_CARD, NOT_IGNORED);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /no mcpServers object/);
        });

        it('fails when the blit386-docs server is not declared', () => {
            const config = JSON.stringify({ mcpServers: { other: { type: 'http', url: 'https://example.com/mcp' } } });
            const failures = findProjectMcpFailures(config, SERVER_CARD, NOT_IGNORED);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /does not declare the `blit386-docs` server/);
        });

        it('fails when the transport type is not http', () => {
            const config = JSON.stringify({
                mcpServers: { 'blit386-docs': { type: 'sse', url: 'https://blit386.dev/mcp' } },
            });
            const failures = findProjectMcpFailures(config, SERVER_CARD, NOT_IGNORED);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /has type "sse", expected "http"/);
        });

        it('fails when .mcp.json drifts off the pinned URL', () => {
            const config = JSON.stringify({
                mcpServers: { 'blit386-docs': { type: 'http', url: 'https://blit386.dev/mcp/v2' } },
            });
            const failures = findProjectMcpFailures(config, SERVER_CARD, NOT_IGNORED);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.mcp\.json declares URL .*expected the pinned/);
        });

        it('fails when the discovery card drifts off the pinned URL', () => {
            const card = JSON.stringify({
                serverInfo: { name: 'blit386-docs', version: '1.0.0' },
                url: 'https://blit386.dev/mcp/v2',
            });
            const failures = findProjectMcpFailures(MCP_CONFIG, card, NOT_IGNORED);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /discovery card declares URL .*expected the pinned/);
        });

        it('fails a coordinated change of both files to another host', () => {
            const url = 'https://evil.example.com/mcp';
            const config = JSON.stringify({ mcpServers: { 'blit386-docs': { type: 'http', url } } });
            const card = JSON.stringify({ serverInfo: { name: 'blit386-docs', version: '1.0.0' }, url });

            // Parity alone would have passed this: the two copies agree with each other.
            const failures = findProjectMcpFailures(config, card, NOT_IGNORED);
            assert.equal(failures.length, 2);
            assert.ok(failures.every((failure) => /expected the pinned/.test(failure)));
        });

        it('fails when the discovery card is missing', () => {
            const failures = findProjectMcpFailures(MCP_CONFIG, null, NOT_IGNORED);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /server-card\.json is missing/);
        });

        it('fails when git reports the root .mcp.json as ignored', () => {
            const failures = findProjectMcpFailures(MCP_CONFIG, SERVER_CARD, true);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.mcp\.json is ignored by git/);
        });

        it('does not fail when git could not answer whether the file is ignored', () => {
            assert.deepEqual(findProjectMcpFailures(MCP_CONFIG, SERVER_CARD, null), []);
        });
    });

    describe('findMaintainerConfigFailures', () => {
        it('passes Antigravity MCP when serverUrl is pinned', () => {
            const content = JSON.stringify({
                mcpServers: { 'blit386-docs': { serverUrl: 'https://blit386.dev/mcp' } },
            });
            assert.deepEqual(findMaintainerConfigFailures(maintainerSpec('.agents/mcp_config.json'), content), []);
        });

        it('fails Antigravity MCP when the file is missing', () => {
            assert.match(findMaintainerConfigFailures(maintainerSpec('.agents/mcp_config.json'), null)[0], /missing/);
        });

        it('fails Antigravity MCP when url is used instead of serverUrl', () => {
            const content = JSON.stringify({
                mcpServers: { 'blit386-docs': { url: 'https://blit386.dev/mcp' } },
            });
            const failures = findMaintainerConfigFailures(maintainerSpec('.agents/mcp_config.json'), content);
            assert.ok(failures.some((failure) => /serverUrl/.test(failure)));
        });

        it('passes Antigravity hooks when antigravity-guard.cjs is wired', () => {
            const content = JSON.stringify({
                'blit-block': {
                    PreToolUse: [{ type: 'command', command: 'node .agents/hooks/antigravity-guard.cjs shell' }],
                },
            });
            assert.deepEqual(findMaintainerConfigFailures(maintainerSpec('.agents/hooks.json'), content), []);
        });

        it('fails Antigravity hooks when the guard is absent', () => {
            assert.match(
                findMaintainerConfigFailures(maintainerSpec('.agents/hooks.json'), '{"ok":true}\n')[0],
                /antigravity-guard/,
            );
        });

        it('passes Codex config.toml when the TOML table is pinned', () => {
            const content = `[mcp_servers.blit386-docs]\nurl = "https://blit386.dev/mcp"\n`;
            assert.deepEqual(findMaintainerConfigFailures(maintainerSpec('.codex/config.toml'), content), []);
        });

        it('fails Codex config.toml when the URL drifts', () => {
            assert.match(
                findMaintainerConfigFailures(
                    maintainerSpec('.codex/config.toml'),
                    `[mcp_servers.blit386-docs]\nurl = "https://evil.example/mcp"\n`,
                )[0],
                /does not pin url/,
            );
        });

        it('passes Codex hooks when codex-guard.cjs is wired', () => {
            const content = JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            matcher: 'Bash',
                            hooks: [{ type: 'command', command: 'node .codex/hooks/codex-guard.cjs shell' }],
                        },
                    ],
                },
            });
            assert.deepEqual(findMaintainerConfigFailures(maintainerSpec('.codex/hooks.json'), content), []);
        });

        it('fails Codex hooks when missing', () => {
            assert.match(findMaintainerConfigFailures(maintainerSpec('.codex/hooks.json'), null)[0], /missing/);
        });

        it('passes Gemini settings when httpUrl is pinned and shell-guard is wired', () => {
            const content = JSON.stringify({
                mcpServers: { 'blit386-docs': { httpUrl: 'https://blit386.dev/mcp' } },
                hooks: { BeforeTool: [{ hooks: [{ command: 'node shell-guard.cjs' }] }] },
            });
            assert.deepEqual(findMaintainerConfigFailures(maintainerSpec('.gemini/settings.json'), content), []);
        });

        it('fails Gemini settings when url is used instead of httpUrl', () => {
            const content = JSON.stringify({
                mcpServers: { 'blit386-docs': { url: 'https://blit386.dev/mcp' } },
                hooks: {},
            });
            const failures = findMaintainerConfigFailures(maintainerSpec('.gemini/settings.json'), content);
            assert.ok(failures.some((failure) => /httpUrl/.test(failure)));
        });

        it('passes Copilot hooks when both shells wire copilot-hook.cjs', () => {
            const content = JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: 'command',
                            bash: 'node .github/hooks/copilot-hook.cjs pre-tool',
                            powershell: 'node .github/hooks/copilot-hook.cjs pre-tool',
                        },
                    ],
                },
            });
            assert.deepEqual(findMaintainerConfigFailures(maintainerSpec('.github/hooks/blit.json'), content), []);
        });

        it('fails Copilot hooks when powershell is absent', () => {
            const content = JSON.stringify({
                hooks: { preToolUse: [{ bash: 'node .github/hooks/copilot-hook.cjs pre-tool' }] },
            });
            assert.ok(
                findMaintainerConfigFailures(maintainerSpec('.github/hooks/blit.json'), content).some((failure) =>
                    /powershell/.test(failure),
                ),
            );
        });

        it('passes OpenCode when remote MCP and bash deny are present', () => {
            const content = JSON.stringify({
                permission: { bash: { 'git reset --hard*': 'deny' } },
                mcp: { 'blit386-docs': { type: 'remote', url: 'https://blit386.dev/mcp', enabled: true } },
            });
            assert.deepEqual(findMaintainerConfigFailures(maintainerSpec('opencode.json'), content), []);
        });

        it('fails OpenCode when type is not remote', () => {
            const content = JSON.stringify({
                permission: { bash: { 'git reset --hard*': 'deny' } },
                mcp: { 'blit386-docs': { type: 'http', url: 'https://blit386.dev/mcp' } },
            });
            assert.match(
                findMaintainerConfigFailures(maintainerSpec('opencode.json'), content)[0],
                /expected "remote"/,
            );
        });

        it('passes kit-guard for a regular file containing pnpm install', () => {
            assert.deepEqual(
                findMaintainerConfigFailures(
                    maintainerSpec('.opencode/plugins/kit-guard.ts'),
                    "BLIT_PM_INSTALL: 'pnpm install'",
                    { isSymlink: false },
                ),
                [],
            );
        });

        it('fails kit-guard when the file is a symlink', () => {
            assert.match(
                findMaintainerConfigFailures(
                    maintainerSpec('.opencode/plugins/kit-guard.ts'),
                    "BLIT_PM_INSTALL: 'pnpm install'",
                    { isSymlink: true },
                )[0],
                /regular file/,
            );
        });
    });

    describe('findMaintainerHookSymlinkFailures', () => {
        it('passes when every entry resolves to the same basename under the kit hooks dir', () => {
            assert.deepEqual(
                findMaintainerHookSymlinkFailures([
                    { path: '.codex/hooks/guard-core.cjs', isSymlink: true, resolvedBasename: 'guard-core.cjs' },
                ]),
                [],
            );
        });

        it('fails when an entry is not a symlink', () => {
            assert.match(
                findMaintainerHookSymlinkFailures([
                    { path: '.codex/hooks/guard-core.cjs', isSymlink: false, resolvedBasename: null },
                ])[0],
                /is not a symlink/,
            );
        });
    });

    describe('isPathIgnoredByGit', () => {
        it('reports .codex/hooks.json as not ignored in this repository', () => {
            const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
            assert.equal(isPathIgnoredByGit(repoRoot, '.codex/hooks.json'), false);
        });
    });

    describe('findCursorMcpFailures', () => {
        const VALID_CURSOR_MCP = JSON.stringify({
            mcpServers: { 'blit386-docs': { url: 'https://blit386.dev/mcp' } },
        });

        it('passes when .cursor/mcp.json declares the pinned server with no type field', () => {
            assert.deepEqual(findCursorMcpFailures(VALID_CURSOR_MCP), []);
        });

        it('fails when .cursor/mcp.json is missing', () => {
            const failures = findCursorMcpFailures(null);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.cursor\/mcp\.json is missing/);
        });

        it('fails when .cursor/mcp.json is not parseable as JSON', () => {
            const failures = findCursorMcpFailures('{not json');
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.cursor\/mcp\.json is not parseable as JSON/);
        });

        it('fails when the mcpServers object is absent', () => {
            const failures = findCursorMcpFailures('{}');
            assert.equal(failures.length, 1);
            assert.match(failures[0], /no mcpServers object/);
        });

        it('fails when the blit386-docs server is not declared', () => {
            const config = JSON.stringify({ mcpServers: { other: { url: 'https://example.com/mcp' } } });
            const failures = findCursorMcpFailures(config);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /does not declare the `blit386-docs` server/);
        });

        it('fails when the server entry carries a type field (Cursor reserves it for local stdio servers)', () => {
            const config = JSON.stringify({
                mcpServers: { 'blit386-docs': { type: 'http', url: 'https://blit386.dev/mcp' } },
            });
            const failures = findCursorMcpFailures(config);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /must not have a `type` field/);
        });

        it('fails when .cursor/mcp.json drifts off the pinned URL', () => {
            const config = JSON.stringify({ mcpServers: { 'blit386-docs': { url: 'https://blit386.dev/mcp/v2' } } });
            const failures = findCursorMcpFailures(config);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /declares URL .*expected the pinned/);
        });
    });

    describe('isRootMcpIgnoredByGit', () => {
        /**
         * Builds a throwaway repository whose `.gitignore` is exactly `rules`, with `.mcp.json`
         * committed - so the tracked-file case the real repo is in gets exercised too.
         *
         * @param {string} rules Contents of the throwaway repo's `.gitignore`.
         * @returns {string} Absolute path to the repository root.
         */
        function makeRepo(rules) {
            const root = mkdtempSync(join(tmpdir(), 'agent-config-mcp-'));
            const run = (...args) => spawnSync('git', args, { cwd: root });

            run('init', '--quiet');
            run('config', 'user.email', 'test@example.com');
            run('config', 'user.name', 'Test');
            writeFileSync(join(root, '.gitignore'), rules);
            writeFileSync(join(root, '.mcp.json'), '{}\n');
            run('add', '--force', '.gitignore', '.mcp.json');
            run('commit', '--quiet', '--no-gpg-sign', '-m', 'init');

            return root;
        }

        it('reports not-ignored when a root-anchored negation follows the blanket rule', () => {
            const root = makeRepo('.mcp.json\nmcp.json\n!/.mcp.json\n');

            try {
                assert.equal(isRootMcpIgnoredByGit(root), false);
            } finally {
                rmSync(root, { recursive: true, force: true });
            }
        });

        it('reports ignored when a later broad rule re-ignores the file', () => {
            const root = makeRepo('.mcp.json\nmcp.json\n!/.mcp.json\n*.json\n');

            try {
                assert.equal(isRootMcpIgnoredByGit(root), true);
            } finally {
                rmSync(root, { recursive: true, force: true });
            }
        });

        it('reports ignored when a later bare rule re-ignores the file', () => {
            const root = makeRepo('.mcp.json\nmcp.json\n!/.mcp.json\n.mcp.json\n');

            try {
                assert.equal(isRootMcpIgnoredByGit(root), true);
            } finally {
                rmSync(root, { recursive: true, force: true });
            }
        });

        it('returns null when the directory is not a git repository', () => {
            const root = mkdtempSync(join(tmpdir(), 'agent-config-nogit-'));

            try {
                assert.equal(isRootMcpIgnoredByGit(root), null);
            } finally {
                rmSync(root, { recursive: true, force: true });
            }
        });
    });

    describe('checkRootSkillsLayout', () => {
        it('reports .agents/skills and .zed/settings.json failures even when .claude/skills is missing', () => {
            const root = mkdtempSync(join(tmpdir(), 'agent-config-test-'));

            try {
                const agentsSkillsDir = join(root, '.agents', 'skills');
                const zedDir = join(root, '.zed');

                mkdirSync(agentsSkillsDir, { recursive: true });
                writeFileSync(join(agentsSkillsDir, 'bt-format'), 'not a symlink');
                mkdirSync(zedDir, { recursive: true });
                writeFileSync(join(zedDir, 'settings.json'), '{not json');

                const failures = checkRootSkillsLayout(root);
                assert.equal(failures.length, 3);
                assert.ok(failures.some((failure) => /\.claude\/skills directory is missing/.test(failure)));
                assert.ok(failures.some((failure) => /\.agents\/skills\/bt-format is not a symlink/.test(failure)));
                assert.ok(failures.some((failure) => /\.zed\/settings\.json is not parseable as JSON/.test(failure)));
            } finally {
                rmSync(root, { recursive: true, force: true });
            }
        });
    });

    describe('discoverPackageAgentRoots', () => {
        it('discovers a package with AGENTS.md but no CLAUDE.md, and the missing pointer target still surfaces', () => {
            const packagesDir = mkdtempSync(join(tmpdir(), 'agent-config-test-'));
            const packageDir = join(packagesDir, 'no-claude-md');
            mkdirSync(packageDir, { recursive: true });
            writeFileSync(
                join(packageDir, 'AGENTS.md'),
                'This repository uses [`CLAUDE.md`](CLAUDE.md) as the canonical policy document.\n',
            );

            try {
                const roots = discoverPackageAgentRoots(packagesDir);
                assert.deepEqual(roots, ['no-claude-md']);

                // The same regression this discovery fix targets: once discovered, the missing
                // CLAUDE.md pointer target must actually be reported, not silently skipped.
                const agentsMdContent =
                    'This repository uses [`CLAUDE.md`](CLAUDE.md) as the canonical policy document.';
                const failures = findAgentsPointerFailures(agentsMdContent, false);
                assert.equal(failures.length, 1);
                assert.match(failures[0], /CLAUDE\.md is missing/);
            } finally {
                rmSync(packagesDir, { recursive: true, force: true });
            }
        });

        it('does not discover a package with none of the agent-config markers', () => {
            const packagesDir = mkdtempSync(join(tmpdir(), 'agent-config-test-'));
            mkdirSync(join(packagesDir, 'plain-package'), { recursive: true });

            try {
                assert.deepEqual(discoverPackageAgentRoots(packagesDir), []);
            } finally {
                rmSync(packagesDir, { recursive: true, force: true });
            }
        });
    });
});
