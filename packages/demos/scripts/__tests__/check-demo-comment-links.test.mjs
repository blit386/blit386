import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    extractHeaderComment,
    findCommentLinkFailures,
    findDemoLinkFailures,
    findDocsLinkFailures,
    findLinksInHeader,
    findPlaceholderLinkFailures,
} from '../check-demo-comment-links.mjs';

describe('check-demo-comment-links', () => {
    describe('extractHeaderComment', () => {
        it('extracts a run of consecutive // lines from the top', () => {
            const source = [
                '// Flurry: a retro screensaver.',
                '// @description A retro screensaver.',
                '//',
                '// Prerequisites:',
                '//   Basics https://demos.blit386.dev/basics',
                '',
                "import { bootstrap, BT } from 'blit386';",
            ].join('\n');

            const header = extractHeaderComment(source);
            assert.ok(header.includes('Prerequisites:'));
            assert.ok(!header.includes('import'));
        });

        it('extracts a /** */ JSDoc-style block', () => {
            const source = [
                '/**',
                ' * Basics Demo – Your very first BLIT386 program!',
                ' * @description Your first BLIT386 program.',
                ' * Live version: https://demos.blit386.dev/basics',
                ' */',
                '',
                "import { bootstrap, BT } from 'blit386';",
            ].join('\n');

            const header = extractHeaderComment(source);
            assert.ok(header.includes('Live version:'));
            assert.ok(!header.includes('import'));
        });

        it('returns an empty string when the file does not start with a comment', () => {
            assert.equal(extractHeaderComment("import { bootstrap } from 'blit386';\n"), '');
        });
    });

    describe('findLinksInHeader', () => {
        it('returns an empty array when there are no links', () => {
            assert.deepEqual(findLinksInHeader('// Hello World: the smallest possible BLIT386 program.'), []);
        });

        it('finds a single bare URL', () => {
            const header = '// Live version: https://demos.blit386.dev/basics';
            assert.deepEqual(findLinksInHeader(header), ['https://demos.blit386.dev/basics']);
        });

        it('finds every URL in a nested parenthetical, comma-separated list and trims trailing punctuation', () => {
            const header = [
                '// Prerequisites:',
                '//   Basics            https://demos.blit386.dev/basics',
                '//   Palette Animation https://demos.blit386.dev/palette-animation',
                '//     (guides: https://blit386.dev/docs/api/rendering#sprites,',
                '//      https://blit386.dev/docs/guides/palette-presets,',
                '//      https://blit386.dev/docs/guides/palette#runtime-palette-effects)',
            ].join('\n');

            assert.deepEqual(findLinksInHeader(header), [
                'https://demos.blit386.dev/basics',
                'https://demos.blit386.dev/palette-animation',
                'https://blit386.dev/docs/api/rendering#sprites',
                'https://blit386.dev/docs/guides/palette-presets',
                'https://blit386.dev/docs/guides/palette#runtime-palette-effects',
            ]);
        });
    });

    describe('findPlaceholderLinkFailures', () => {
        it('passes when no URL is on a placeholder domain', () => {
            assert.deepEqual(findPlaceholderLinkFailures(['https://demos.blit386.dev/basics']), []);
        });

        it('fails on the bare placeholder domain', () => {
            const failures = findPlaceholderLinkFailures(['https://vancura.dev/articles/blit386-animation']);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /vancura\.dev.*known-placeholder domain/);
        });

        it('fails on a subdomain of the placeholder domain', () => {
            const failures = findPlaceholderLinkFailures(['https://blit386-demos.vancura.dev/basics']);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /blit386-demos\.vancura\.dev.*known-placeholder domain/);
        });
    });

    describe('findDocsLinkFailures', () => {
        const sitemapPaths = new Set(['api/game-loop', 'guides/palette']);

        it('passes when the docs path (fragment stripped) is in the sitemap', () => {
            const urls = ['https://blit386.dev/docs/guides/palette#runtime-palette-effects'];
            assert.deepEqual(findDocsLinkFailures(urls, sitemapPaths), []);
        });

        it('ignores non-docs and non-blit386.dev URLs', () => {
            const urls = ['https://demos.blit386.dev/basics', 'https://github.com/calumr/flurry'];
            assert.deepEqual(findDocsLinkFailures(urls, sitemapPaths), []);
        });

        it('fails when the docs path has no matching sitemap page', () => {
            const urls = ['https://blit386.dev/docs/guides/nope'];
            const failures = findDocsLinkFailures(urls, sitemapPaths);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /no matching page.*guides\/nope/);
        });
    });

    describe('findDemoLinkFailures', () => {
        const demoSlugs = new Set(['basics', 'palette-animation']);

        it('passes when the slug is in DEMO_ORDER', () => {
            assert.deepEqual(findDemoLinkFailures(['https://demos.blit386.dev/basics'], demoSlugs), []);
        });

        it('ignores a bare root link with no slug', () => {
            assert.deepEqual(findDemoLinkFailures(['https://demos.blit386.dev'], demoSlugs), []);
        });

        it('fails when the slug is not in DEMO_ORDER', () => {
            const failures = findDemoLinkFailures(['https://demos.blit386.dev/retired-demo'], demoSlugs);
            assert.equal(failures.length, 1);
            assert.match(failures[0], /"retired-demo".*not in DEMO_ORDER/);
        });
    });

    describe('findCommentLinkFailures', () => {
        const registries = {
            sitemapPaths: new Set(['guides/palette']),
            demoSlugs: new Set(['basics', 'palette-animation']),
        };

        it('passes for a clean header with no links at all', () => {
            const source =
                "// Hello World: the smallest possible BLIT386 program.\n\nimport { bootstrap } from 'blit386';\n";
            assert.deepEqual(findCommentLinkFailures(source, registries), []);
        });

        it('passes for a header whose links all resolve', () => {
            const source = [
                '// Palette Animation demo.',
                '// Prerequisites:',
                '//   Basics https://demos.blit386.dev/basics',
                '//     (guide: https://blit386.dev/docs/guides/palette)',
                '// Live version: https://demos.blit386.dev/palette-animation',
                '',
                "import { bootstrap } from 'blit386';",
            ].join('\n');

            assert.deepEqual(findCommentLinkFailures(source, registries), []);
        });

        it('collects failures across all three link families in one header', () => {
            const source = [
                '// Broken demo.',
                '// Prerequisites:',
                '//   Basics https://vancura.dev/articles/basics',
                '//     (guide: https://blit386.dev/docs/guides/nope)',
                '// Live version: https://demos.blit386.dev/retired-demo',
                '',
                "import { bootstrap } from 'blit386';",
            ].join('\n');

            const failures = findCommentLinkFailures(source, registries);
            assert.equal(failures.length, 3);
        });

        it('ignores links outside the header comment', () => {
            const source = [
                '// Clean header, no links.',
                '',
                "import { bootstrap } from 'blit386';",
                '',
                '// Original source: https://vancura.dev/articles/mid-file-not-a-header-link',
            ].join('\n');

            assert.deepEqual(findCommentLinkFailures(source, registries), []);
        });
    });
});
