import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
    discoverPackageAgentRoots,
    findAgentsPointerFailures,
    findCopilotPointerFailures,
    findSkillsSymlinkFailures,
    findZedSettingsFailures,
    resolveSkillSymlinkTarget,
} from './check-agent-config.mjs';

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
        it('passes when .zed/settings.json is valid JSON and .agents/skills layout exists', () => {
            const content = '// Project-level Zed settings\n{\n  "agent": {}\n}\n';
            assert.deepEqual(findZedSettingsFailures(content, true), []);
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
            const content = '{\n  "agent": {}\n}\n';
            const failures = findZedSettingsFailures(content, false);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.agents\/skills layout is missing while \.zed\/settings\.json exists/);
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
