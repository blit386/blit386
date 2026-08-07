import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { findDashTypographyIssues, isIgnoredFile } from './check-dash-typography.mjs';

// isIgnoredFile resolves paths relative to this file's real repo root, so the fixture
// paths below must actually live under it for the relative-path regex to match.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('findDashTypographyIssues', () => {
    describe('em dash', () => {
        it('flags a bare em dash used as a parenthetical break', () => {
            const issues = findDashTypographyIssues('one thing — another thing');
            assert.equal(issues.length, 1);
            assert.equal(issues[0].kind, 'em-dash');
        });

        it('does not flag an em dash naming itself in parens, like this file and CLAUDE.md do', () => {
            const issues = findDashTypographyIssues('never use the em dash (—) here');
            assert.deepEqual(issues, []);
        });

        it('flags a parenthesized em dash that is not naming the character', () => {
            const issues = findDashTypographyIssues('some odd punctuation (—) here');
            assert.equal(issues.length, 1);
            assert.equal(issues[0].kind, 'em-dash');
        });
    });

    describe('hyphen as a parenthetical break', () => {
        it('flags a hyphen surrounded by spaces between words', () => {
            const issues = findDashTypographyIssues('one thing - another thing');
            assert.equal(issues.length, 1);
            assert.equal(issues[0].kind, 'hyphen-as-dash');
        });

        it('does not flag a markdown list bullet', () => {
            assert.deepEqual(findDashTypographyIssues('- first item'), []);
            assert.deepEqual(findDashTypographyIssues('  - indented item'), []);
        });

        it('flags a later parenthetical-break hyphen on a list-item line', () => {
            const issues = findDashTypographyIssues('- First item - second item');
            assert.equal(issues.length, 1);
            assert.equal(issues[0].kind, 'hyphen-as-dash');
        });

        it('does not flag a JSDoc/comment-prefixed bullet', () => {
            assert.deepEqual(findDashTypographyIssues('// - bullet in a comment'), []);
            assert.deepEqual(findDashTypographyIssues(' * - bullet in a JSDoc block'), []);
        });

        it('does not flag a CLI flag or a double-hyphen divider', () => {
            assert.deepEqual(findDashTypographyIssues('run with --verbose or -s'), []);
            assert.deepEqual(findDashTypographyIssues('git diff A -- B'), []);
        });

        it('does not flag a hyphenated compound word or an unspaced numeric range', () => {
            assert.deepEqual(findDashTypographyIssues('a type-safe, well-known range 10-20'), []);
        });

        it('does not flag a bare hyphen placeholder in a table cell', () => {
            assert.deepEqual(findDashTypographyIssues('| foo | - | bar |'), []);
        });

        it('does not flag content inside a fenced code block', () => {
            const text = ['```text', 'input - output', '```'].join('\n');
            assert.deepEqual(findDashTypographyIssues(text), []);
        });

        it('does not flag content inside a tilde-fenced code block', () => {
            const text = ['~~~text', 'input - output', '~~~'].join('\n');
            assert.deepEqual(findDashTypographyIssues(text), []);
        });

        it('does not flag content inside a JSDoc-prefixed fenced code block', () => {
            const code = ['/**', ' * Example:', ' * ```text', ' * input - output', ' * ```', ' */'].join('\n');
            assert.deepEqual(findDashTypographyIssues(code, { commentsOnly: true }), []);
        });

        it('does not flag content inside an inline code span', () => {
            assert.deepEqual(findDashTypographyIssues('see `word - word` for the anti-pattern'), []);
        });

        it('does not flag prose inside a wider inline code span containing a literal narrower one', () => {
            const text = 'see `` `literal backtick` inside - not code `` here';
            assert.deepEqual(findDashTypographyIssues(text), []);
        });

        it('reports 1-based line and column', () => {
            const issues = findDashTypographyIssues('line one\nsecond - line');
            assert.equal(issues[0].line, 2);
            assert.equal(issues[0].column, 8);
        });
    });

    describe('commentsOnly mode (JS/TS source)', () => {
        it('does not flag a subtraction expression', () => {
            const issues = findDashTypographyIssues('const remaining = total - offset;', { commentsOnly: true });
            assert.deepEqual(issues, []);
        });

        it('does not flag dash-shaped text inside a string literal', () => {
            const code = `const url = "https://example.com/a-b - not a comment";`;
            assert.deepEqual(findDashTypographyIssues(code, { commentsOnly: true }), []);
        });

        it('does not flag a comment-like substring inside a template literal (e.g. an embedded WGSL shader)', () => {
            const code = ['const shader = `', 'intensity: f32, // per - frame knob', '`;'].join('\n');
            assert.deepEqual(findDashTypographyIssues(code, { commentsOnly: true }), []);
        });

        it('flags a real violation inside a line comment', () => {
            const issues = findDashTypographyIssues('// a real note - fix this', { commentsOnly: true });
            assert.equal(issues.length, 1);
        });

        it('flags a real violation inside a block comment', () => {
            const issues = findDashTypographyIssues('/**\n * a note - fix this\n */', { commentsOnly: true });
            assert.equal(issues.length, 1);
        });

        it('handles an escaped quote inside a string without losing sync', () => {
            const code = `const s = 'it\\'s fine'; // trailing note - real issue`;
            const issues = findDashTypographyIssues(code, { commentsOnly: true });
            assert.equal(issues.length, 1);
        });
    });
});

describe('isIgnoredFile', () => {
    it('ignores the generated docs mirror under packages/website/content/docs', () => {
        const filePath = join(REPO_ROOT, 'packages/website/content/docs/guides/hot-reload.mdx');
        assert.equal(isIgnoredFile(filePath), true);
    });

    it('does not ignore hand-authored website content outside content/docs', () => {
        const filePath = join(REPO_ROOT, 'packages/website/content/index.mdx');
        assert.equal(isIgnoredFile(filePath), false);
    });

    it('does not ignore the engine docs source', () => {
        const filePath = join(REPO_ROOT, 'packages/blit386/docs/guide-post-process-effects.md');
        assert.equal(isIgnoredFile(filePath), false);
    });
});
