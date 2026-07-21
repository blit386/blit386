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
            const content = ['---', 'name: bt-format', 'description: Format code', '---', '', '# Format Code', ''].join(
                '\n',
            );
            assert.equal(stripFrontmatter(content), '# Format Code\n');
        });

        it('returns content unchanged when there is no frontmatter', () => {
            const content = '# Format Code\n\nNo frontmatter here.\n';
            assert.equal(stripFrontmatter(content), content);
        });

        it('returns content unchanged when the opening --- is never closed', () => {
            const content = '---\nname: bt-format\n\n# Format Code\n';
            assert.equal(stripFrontmatter(content), content);
        });

        it('handles CRLF line endings', () => {
            const content = '---\r\nname: bt-format\r\n---\r\n\r\n# Format Code\r\n';
            assert.equal(stripFrontmatter(content), '# Format Code\r\n');
        });

        it('does not treat a closing marker with trailing text as the frontmatter close', () => {
            const content = '---\nname: bt-format\n--- not a close\n---\n\n# Format Code\n';
            assert.equal(stripFrontmatter(content), '# Format Code\n');
        });
    });

    describe('rewriteParentLinks', () => {
        it('re-relativizes a ../../../ link so it still resolves from .cursor/commands/', () => {
            const content = 'See [security runbook](../../../docs/security/security-runbook.md).';
            const rewritten = rewriteParentLinks(content, '.claude/skills/bt-security-run');
            assert.equal(rewritten, 'See [security runbook](../../docs/security/security-runbook.md).');
        });

        it('rewrites every matching link in the content', () => {
            const content = '[a](../../../docs/a.md) and [b](../../../docs/b.md)';
            const rewritten = rewriteParentLinks(content, '.claude/skills/bt-security-run');
            assert.equal(rewritten, '[a](../../docs/a.md) and [b](../../docs/b.md)');
        });

        it('leaves anchor links untouched', () => {
            const content = '[jump](#some-heading)';
            assert.equal(rewriteParentLinks(content, '.claude/skills/bt-release'), content);
        });

        it('leaves absolute URLs untouched', () => {
            const content = '[docs](https://blit386.dev/docs)';
            assert.equal(rewriteParentLinks(content, '.claude/skills/bt-release'), content);
        });

        it('does not rewrite a literal "..." placeholder inside inline code', () => {
            const content = 'markdown image links (`[![...](...)](...)` patterns)';
            assert.equal(rewriteParentLinks(content, '.claude/skills/bt-release'), content);
        });

        it('leaves a same-directory relative link untouched', () => {
            const content = '[sibling](sibling-file.md)';
            assert.equal(rewriteParentLinks(content, '.claude/skills/bt-release'), content);
        });
    });

    describe('buildCommandFiles', () => {
        it('strips frontmatter from every skill and keeps the skill name', () => {
            const files = buildCommandFiles([
                { name: 'bt-format', skillMdContent: '---\nname: bt-format\n---\n\n# Format Code\n' },
                { name: 'bt-test', skillMdContent: '# Run Tests\n' },
            ]);

            assert.deepEqual(files, [
                { name: 'bt-format', content: '# Format Code\n' },
                { name: 'bt-test', content: '# Run Tests\n' },
            ]);
        });

        it('re-relativizes ../ links using the skill name to build the source directory', () => {
            const files = buildCommandFiles([
                {
                    name: 'bt-security-run',
                    skillMdContent: '[runbook](../../../docs/security/security-runbook.md)\n',
                },
            ]);

            assert.deepEqual(files, [
                { name: 'bt-security-run', content: '[runbook](../../docs/security/security-runbook.md)\n' },
            ]);
        });

        it('returns an empty array for an empty skill list', () => {
            assert.deepEqual(buildCommandFiles([]), []);
        });
    });

    describe('findOrphanCommandNames', () => {
        it('returns an empty array when every command has a matching skill', () => {
            const orphans = findOrphanCommandNames(['bt-format', 'bt-test'], ['bt-format', 'bt-test']);
            assert.deepEqual(orphans, []);
        });

        it('finds a command with no matching skill directory', () => {
            const orphans = findOrphanCommandNames(['bt-format', 'bt-retired'], ['bt-format']);
            assert.deepEqual(orphans, ['bt-retired']);
        });

        it('sorts multiple orphans', () => {
            const orphans = findOrphanCommandNames(['bt-zeta', 'bt-alpha'], []);
            assert.deepEqual(orphans, ['bt-alpha', 'bt-zeta']);
        });

        it('does not flag a skill with no existing command as an orphan', () => {
            const orphans = findOrphanCommandNames(['bt-format'], ['bt-format', 'bt-new-skill']);
            assert.deepEqual(orphans, []);
        });
    });
});
