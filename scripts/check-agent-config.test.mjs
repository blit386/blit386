import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    findAgentsPointerFailures,
    findRulesParityFailures,
    findSkillsSymlinkFailures,
} from './check-agent-config.mjs';

describe('check-agent-config', () => {
    describe('findRulesParityFailures', () => {
        it('passes when cursor and claude rule names match exactly', () => {
            const failures = findRulesParityFailures(
                ['american-english-spelling', 'bt-api-getters'],
                ['american-english-spelling', 'bt-api-getters'],
            );
            assert.deepEqual(failures, []);
        });

        it('fails when a .cursor/rules/*.mdc has no .claude/rules/*.md mirror', () => {
            const failures = findRulesParityFailures(
                ['american-english-spelling', 'new-rule'],
                ['american-english-spelling'],
            );
            assert.equal(failures.length, 1);
            assert.match(failures[0], /\.cursor\/rules\/new-rule\.mdc has no matching \.claude\/rules\/new-rule\.md/);
        });

        it('fails when a .claude/rules/*.md has no .cursor/rules/*.mdc mirror', () => {
            const failures = findRulesParityFailures(
                ['american-english-spelling'],
                ['american-english-spelling', 'orphaned-rule'],
            );
            assert.equal(failures.length, 1);
            assert.match(
                failures[0],
                /\.claude\/rules\/orphaned-rule\.md has no matching \.cursor\/rules\/orphaned-rule\.mdc/,
            );
        });

        it('reports both directions when both sides drift', () => {
            const failures = findRulesParityFailures(['cursor-only'], ['claude-only']);
            assert.equal(failures.length, 2);
        });
    });

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
});
