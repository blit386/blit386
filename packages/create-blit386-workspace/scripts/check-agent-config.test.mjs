import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findSkillsSymlinkFailures, resolveSkillSymlinkTarget } from './check-agent-config.mjs';

describe('check-agent-config', () => {
    describe('findSkillsSymlinkFailures', () => {
        it('passes when every symlink resolves to a same-named claude skill directory', () => {
            const failures = findSkillsSymlinkFailures(
                [
                    { name: 'cbt-format', isSymlink: true, resolvedName: 'cbt-format' },
                    { name: 'cbt-test', isSymlink: true, resolvedName: 'cbt-test' },
                ],
                ['cbt-format', 'cbt-test'],
            );
            assert.deepEqual(failures, []);
        });

        it('fails when an .agents/skills entry is not a symlink', () => {
            const failures = findSkillsSymlinkFailures(
                [{ name: 'cbt-format', isSymlink: false, resolvedName: null }],
                [],
            );
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.agents\/skills\/cbt-format is not a symlink/);
        });

        it('fails when a symlink is broken (target missing)', () => {
            const failures = findSkillsSymlinkFailures(
                [{ name: 'cbt-format', isSymlink: true, resolvedName: null }],
                [],
            );
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.agents\/skills\/cbt-format is a broken symlink/);
        });

        it('fails when a symlink resolves to a differently named claude skill', () => {
            const failures = findSkillsSymlinkFailures(
                [{ name: 'cbt-format', isSymlink: true, resolvedName: 'cbt-other' }],
                [],
            );
            assert.equal(failures.length, 1);
            assert.match(
                failures[0],
                /\.agents\/skills\/cbt-format resolves to \.claude\/skills\/cbt-other, expected cbt-format/,
            );
        });

        it('fails when a .claude/skills directory has no matching .agents/skills symlink', () => {
            const failures = findSkillsSymlinkFailures(
                [{ name: 'cbt-format', isSymlink: true, resolvedName: 'cbt-format' }],
                ['cbt-format', 'cbt-new-skill'],
            );
            assert.equal(failures.length, 1);
            assert.match(
                failures[0],
                /\.claude\/skills\/cbt-new-skill has no matching \.agents\/skills\/cbt-new-skill symlink/,
            );
        });
    });

    describe('resolveSkillSymlinkTarget', () => {
        it('returns the skill name for a direct child skill directory', () => {
            const resolved = resolveSkillSymlinkTarget('/repo/.claude/skills/cbt-format', true, '/repo/.claude/skills');
            assert.equal(resolved, 'cbt-format');
        });

        it('rejects a target nested more than one level below .claude/skills', () => {
            const resolved = resolveSkillSymlinkTarget(
                '/repo/.claude/skills/cbt-format-extra/nested/cbt-format',
                true,
                '/repo/.claude/skills',
            );
            assert.equal(resolved, null);
        });

        it('rejects a target that is a file rather than a directory', () => {
            const resolved = resolveSkillSymlinkTarget(
                '/repo/.claude/skills/cbt-format',
                false,
                '/repo/.claude/skills',
            );
            assert.equal(resolved, null);
        });
    });
});
