import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
    collectAdvertisedPaths,
    extractFetchPaths,
    extractJsonUrls,
    extractMarkdownPaths,
    normalizeToSitePath,
} from '../check-well-known-urls.mjs';

describe('check-well-known-urls', () => {
    describe('normalizeToSitePath', () => {
        test('strips the origin from an absolute site URL', () => {
            assert.equal(normalizeToSitePath('https://blit386.dev/docs/getting-started'), '/docs/getting-started');
        });

        test('maps the bare origin to the root path', () => {
            assert.equal(normalizeToSitePath('https://blit386.dev/'), '/');
            assert.equal(normalizeToSitePath('https://blit386.dev'), '/');
        });

        test('passes an already-relative path through unchanged', () => {
            assert.equal(normalizeToSitePath('/mcp'), '/mcp');
        });
    });

    describe('extractFetchPaths', () => {
        test('finds every literal fetch() argument', () => {
            const source = `
                async function go() {
                    const a = await fetch('/mcp', { method: 'POST' });
                    const b = await fetch("/llms.txt");
                }
            `;
            assert.deepEqual(extractFetchPaths(source), ['/mcp', '/llms.txt']);
        });

        test('returns an empty array when there are no fetch calls', () => {
            assert.deepEqual(extractFetchPaths('const x = 1;'), []);
        });
    });

    describe('extractMarkdownPaths', () => {
        test('finds absolute site URLs in a markdown table and backtick paths in prose', () => {
            const source = `
                | Resource | URL |
                | --- | --- |
                | Docs | https://blit386.dev/docs |
                | Sitemap | https://blit386.dev/sitemap.xml |

                - \`/docs\` - Documentation hub
                - \`/docs/getting-started\` - Installation and first steps
            `;
            assert.deepEqual(extractMarkdownPaths(source), [
                'https://blit386.dev/docs',
                'https://blit386.dev/sitemap.xml',
                '/docs',
                '/docs/getting-started',
            ]);
        });

        test('ignores backtick spans that are not root-relative paths', () => {
            const source = 'Query the active backend at runtime: `BT.activeBackend`, or call `tools/list`.';
            assert.deepEqual(extractMarkdownPaths(source), []);
        });

        test('would have caught the BT-248 /docs/api/ regression', () => {
            // SKILL.md used to advertise `/docs/api/` (a trailing-slash section index)
            // with no matching page in the build. This fixture proves the extractor
            // surfaces that exact path so check-well-known-urls.mjs's live GET would
            // have failed it, rather than the check silently missing the class of bug
            // it exists to catch.
            const source = '- `/docs/api/` - Full API reference for the `BT` namespace';
            assert.deepEqual(extractMarkdownPaths(source), ['/docs/api/']);
        });

        test('does not match a non-blit386.dev origin', () => {
            assert.deepEqual(extractMarkdownPaths('Source: https://github.com/blit386/blit386'), []);
        });
    });

    describe('extractJsonUrls', () => {
        test('recursively collects absolute site URLs from nested objects and arrays', () => {
            const doc = {
                url: 'https://blit386.dev/mcp',
                linkset: [
                    { anchor: 'https://blit386.dev/mcp', 'service-doc': [{ href: 'https://blit386.dev/mcp-server' }] },
                ],
                unrelated: 'not a url',
            };
            assert.deepEqual(extractJsonUrls(doc), [
                'https://blit386.dev/mcp',
                'https://blit386.dev/mcp',
                'https://blit386.dev/mcp-server',
            ]);
        });

        test('ignores non-blit386.dev strings', () => {
            assert.deepEqual(extractJsonUrls({ href: 'https://example.com/other' }), []);
        });

        test('returns an empty array for primitives with no matching strings', () => {
            assert.deepEqual(extractJsonUrls(42), []);
            assert.deepEqual(extractJsonUrls(null), []);
        });
    });

    describe('collectAdvertisedPaths', () => {
        test('normalizes, dedupes, and sorts across all three source kinds', () => {
            const paths = collectAdvertisedPaths({
                webmcpSource: "fetch('/mcp'); fetch('/llms.txt');",
                skillMdSource: '| MCP | https://blit386.dev/mcp | JSON-RPC |\n- `/docs` - hub',
                jsonDocs: [{ url: 'https://blit386.dev/mcp' }, { resource: 'https://blit386.dev/' }],
            });
            assert.deepEqual(paths, ['/', '/docs', '/llms.txt', '/mcp']);
        });
    });
});
