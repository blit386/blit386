import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildCommandFiles,
    findOrphanCommandNames,
    rewriteParentLinks,
    stripFrontmatter,
} from './sync-cursor-commands.mjs';

describe('sync-cursor-commands', () => {
    describe('stripFrontmatter', () => {
        it('removes a leading frontmatter block', () => {
            const content = [
                '---',
                'name: cbt-format',
                'description: Format code',
                '---',
                '',
                '# Format Code',
                '',
            ].join('\n');
            assert.equal(stripFrontmatter(content), '# Format Code\n');
        });

        it('returns content unchanged when there is no frontmatter', () => {
            const content = '# Format Code\n\nNo frontmatter here.\n';
            assert.equal(stripFrontmatter(content), content);
        });

        it('returns content unchanged when the opening --- is never closed', () => {
            const content = '---\nname: cbt-format\n\n# Format Code\n';
            assert.equal(stripFrontmatter(content), content);
        });

        it('handles CRLF line endings', () => {
            const content = '---\r\nname: cbt-format\r\n---\r\n\r\n# Format Code\r\n';
            assert.equal(stripFrontmatter(content), '# Format Code\r\n');
        });

        it('does not treat a closing marker with trailing text as the frontmatter close', () => {
            const content = '---\nname: cbt-format\n--- not a close\n---\n\n# Format Code\n';
            assert.equal(stripFrontmatter(content), '# Format Code\n');
        });

        it('preserves ordinary markdown whose first line merely starts with ---', () => {
            const content = '---not-frontmatter\n\nsome body\n\n---\n\nmore text\n';
            assert.equal(stripFrontmatter(content), content);
        });
    });

    describe('rewriteParentLinks', () => {
        it('re-relativizes a ../../../ link so it still resolves from .cursor/commands/', () => {
            const content = 'See [publishing](../../../PUBLISHING.md).';
            const rewritten = rewriteParentLinks(content, '.claude/skills/cbt-release');
            assert.equal(rewritten, 'See [publishing](../../PUBLISHING.md).');
        });

        it('rewrites every matching link in the content', () => {
            const content = '[a](../../../docs/a.md) and [b](../../../docs/b.md)';
            const rewritten = rewriteParentLinks(content, '.claude/skills/cbt-kit-audit');
            assert.equal(rewritten, '[a](../../docs/a.md) and [b](../../docs/b.md)');
        });

        it('leaves anchor links untouched', () => {
            const content = '[jump](#some-heading)';
            assert.equal(rewriteParentLinks(content, '.claude/skills/cbt-release'), content);
        });

        it('leaves absolute URLs untouched', () => {
            const content = '[docs](https://blit386.dev/docs)';
            assert.equal(rewriteParentLinks(content, '.claude/skills/cbt-release'), content);
        });

        it('does not rewrite a literal "..." placeholder inside inline code', () => {
            const content = 'markdown image links (`[![...](...)](...)` patterns)';
            assert.equal(rewriteParentLinks(content, '.claude/skills/cbt-release'), content);
        });

        it('leaves a same-directory relative link untouched', () => {
            const content = '[sibling](sibling-file.md)';
            assert.equal(rewriteParentLinks(content, '.claude/skills/cbt-release'), content);
        });

        it('re-relativizes a titled link while preserving the title', () => {
            const content = '[guide](../../../docs/guide.md "Guide")';
            const rewritten = rewriteParentLinks(content, '.claude/skills/cbt-kit-audit');
            assert.equal(rewritten, '[guide](../../docs/guide.md "Guide")');
        });

        it('re-relativizes a single-quote titled link while preserving the title', () => {
            const content = "[guide](../../../docs/guide.md 'Guide')";
            const rewritten = rewriteParentLinks(content, '.claude/skills/cbt-kit-audit');
            assert.equal(rewritten, "[guide](../../docs/guide.md 'Guide')");
        });
    });

    describe('buildCommandFiles', () => {
        it('strips frontmatter from every skill and keeps the skill name', () => {
            const files = buildCommandFiles([
                { name: 'cbt-format', skillMdContent: '---\nname: cbt-format\n---\n\n# Format Code\n' },
                { name: 'cbt-test', skillMdContent: '# Run Tests\n' },
            ]);

            assert.deepEqual(files, [
                { name: 'cbt-format', content: '# Format Code\n' },
                { name: 'cbt-test', content: '# Run Tests\n' },
            ]);
        });

        it('re-relativizes ../ links using the skill name to build the source directory', () => {
            const files = buildCommandFiles([
                {
                    name: 'cbt-release',
                    skillMdContent: '[publishing](../../../PUBLISHING.md)\n',
                },
            ]);

            assert.deepEqual(files, [{ name: 'cbt-release', content: '[publishing](../../PUBLISHING.md)\n' }]);
        });

        it('returns an empty array for an empty skill list', () => {
            assert.deepEqual(buildCommandFiles([]), []);
        });
    });

    describe('findOrphanCommandNames', () => {
        it('returns an empty array when every command has a matching skill', () => {
            const orphans = findOrphanCommandNames(['cbt-format', 'cbt-test'], ['cbt-format', 'cbt-test']);
            assert.deepEqual(orphans, []);
        });

        it('finds a command with no matching skill directory', () => {
            const orphans = findOrphanCommandNames(['cbt-format', 'cbt-retired'], ['cbt-format']);
            assert.deepEqual(orphans, ['cbt-retired']);
        });

        it('sorts multiple orphans', () => {
            const orphans = findOrphanCommandNames(['cbt-zeta', 'cbt-alpha'], []);
            assert.deepEqual(orphans, ['cbt-alpha', 'cbt-zeta']);
        });

        it('does not flag a skill with no existing command as an orphan', () => {
            const orphans = findOrphanCommandNames(['cbt-format'], ['cbt-format', 'cbt-new-skill']);
            assert.deepEqual(orphans, []);
        });
    });
});
