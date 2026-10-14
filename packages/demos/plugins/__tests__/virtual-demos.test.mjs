/**
 * Unit tests for the pure helpers behind the `virtual-demos` Vite plugin: the layout template
 * substitution (`renderDemoHtml`) and the dev-only vintage-URL redirect lookup
 * (`resolveVintageRedirect`). Both are pure, so every case here is a plain assertion - no fs,
 * no Vite server, no request/response objects.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderDemoHtml, renderShotsHtml, resolveVintageRedirect, SHOTS_SLUG } from '../virtual-demos.js';

const LAYOUT_TEMPLATE = [
    '<!doctype html>',
    '<html>',
    '<head><title>{{title}}</title>{{robotsMeta}}{{socialMeta}}</head>',
    '<body data-page-suffix="{{pageSuffix}}">',
    '{{channelBanner}}',
    '<script type="module" src="{{scriptFile}}{{pageSuffix}}"></script>',
    '<script>const demoList = {{demoList}};</script>',
    '<div id="demo-source">{{sourceHtml}}</div>',
    '{{sourcePanelScript}}',
    '<a href="/demos/{{slug}}{{pageSuffix}}">next</a>',
    '</body>',
    '</html>',
].join('\n');

const ENTRY = { title: 'BLIT386 Demo - Palette Cycling', scriptFile: '/src/palette-cycling', slug: 'palette-cycling' };

/**
 * Build a full options object for renderDemoHtml with sane defaults, overridable per test.
 * @param {object} [overrides]
 * @returns {object}
 */
function baseOptions(overrides = {}) {
    return {
        layoutTemplate: LAYOUT_TEMPLATE,
        entry: ENTRY,
        isDevMode: true,
        demoListJson: '[]',
        sourceHtml: '<pre>source</pre>',
        sourcePanelScript: '',
        robotsMeta: '',
        channelBanner: '',
        socialMeta: '<meta name="description" content="A demo.">',
        ...overrides,
    };
}

describe('renderDemoHtml', () => {
    it('suffixes navigation targets with .html in dev mode', () => {
        const html = renderDemoHtml(baseOptions({ isDevMode: true }));

        assert.ok(html.includes('data-page-suffix=".html"'));
        assert.ok(html.includes('src="/src/palette-cycling.html"'));
        assert.ok(html.includes('href="/demos/palette-cycling.html"'));
    });

    it('leaves navigation targets extensionless in a production build', () => {
        const html = renderDemoHtml(baseOptions({ isDevMode: false }));

        assert.ok(html.includes('data-page-suffix=""'));
        assert.ok(html.includes('src="/src/palette-cycling"'));
        assert.ok(html.includes('href="/demos/palette-cycling"'));
        assert.ok(!html.includes('.html'));
    });

    it('passes a socialMeta value containing $& and $1 through byte-for-byte', () => {
        // Guards the function-replacer contract: if `.replace('{{socialMeta}}', () => socialMeta)`
        // were changed to `.replace('{{socialMeta}}', socialMeta)` (a plain string instead of a
        // function), `$&` would be interpreted as "the matched substring" and corrupt the output.
        const socialMeta = 'Regex-ish text with $& and $1 and $` inside it, kept exactly as written.';
        const html = renderDemoHtml(baseOptions({ socialMeta }));

        assert.ok(html.includes(socialMeta));
    });

    it('passes demoListJson containing $& through byte-for-byte', () => {
        const demoListJson = '[{"slug":"weird $& $1 slug"}]';
        const html = renderDemoHtml(baseOptions({ demoListJson }));

        assert.ok(html.includes(demoListJson));
    });

    it('passes sourceHtml containing $& through byte-for-byte', () => {
        const sourceHtml = '<span>cost is $&amp; $1 here</span>';
        const html = renderDemoHtml(baseOptions({ sourceHtml }));

        assert.ok(html.includes(sourceHtml));
    });

    it('passes sourcePanelScript containing $& through byte-for-byte', () => {
        const sourcePanelScript = '<script>const price = "$& $1";</script>';
        const html = renderDemoHtml(baseOptions({ sourcePanelScript }));

        assert.ok(html.includes(sourcePanelScript));
    });

    it('passes robotsMeta and channelBanner containing $& through byte-for-byte', () => {
        const robotsMeta = '<meta name="robots" content="$& noindex">';
        const channelBanner = '<div>Banner with $1 inside</div>';
        const html = renderDemoHtml(baseOptions({ robotsMeta, channelBanner }));

        assert.ok(html.includes(robotsMeta));
        assert.ok(html.includes(channelBanner));
    });

    it('substitutes socialMeta last, after every other placeholder is already resolved', () => {
        // A socialMeta value containing another placeholder's literal text must not be mistaken
        // for that placeholder, since socialMeta is substituted last in the chain.
        const socialMeta = 'Description mentions the literal text {{title}} in prose.';
        const html = renderDemoHtml(baseOptions({ socialMeta }));

        assert.ok(html.includes(socialMeta));
    });

    it('escapes the title but substitutes scriptFile and slug verbatim', () => {
        const html = renderDemoHtml(
            baseOptions({ entry: { title: 'Tom & "Jerry"', scriptFile: '/src/basics', slug: 'basics' } }),
        );

        assert.ok(html.includes('<title>Tom &amp; &quot;Jerry&quot;</title>'));
        assert.ok(html.includes('src="/src/basics.html"'));
    });

    it('leaves no unsubstituted template placeholder behind', () => {
        const html = renderDemoHtml(baseOptions());

        assert.ok(!html.includes('{{'), `unsubstituted placeholder remains: ${html}`);
    });
});

describe('resolveVintageRedirect', () => {
    const registry = [
        { slug: 'palette-cycling', urlPath: '/demos/palette-cycling.html' },
        { slug: 'basics', urlPath: '/demos/basics.html' },
    ];

    it('returns the live target urlPath for a known vintage slug', () => {
        const vintageUrls = { '001-palette-cycling': 'palette-cycling' };
        assert.equal(
            resolveVintageRedirect('001-palette-cycling', vintageUrls, registry),
            '/demos/palette-cycling.html',
        );
    });

    it('returns null when the vintage target is not live in the registry (retired)', () => {
        const vintageUrls = { 'old-demo': 'retired-demo' };
        assert.equal(resolveVintageRedirect('old-demo', vintageUrls, registry), null);
    });

    it('returns null when the requested slug is not a vintage key at all', () => {
        const vintageUrls = { '001-palette-cycling': 'palette-cycling' };
        assert.equal(resolveVintageRedirect('basics', vintageUrls, registry), null);
    });
});

describe('renderShotsHtml', () => {
    const template =
        '<body data-demo-base="{{demoBase}}" data-page-suffix="{{pageSuffix}}">{{robotsMeta}}' +
        '<script id="demo-list" type="application/json">{{demoList}}</script></body>';

    it('stamps the dev demo base and page suffix', () => {
        const html = renderShotsHtml({
            template,
            demoListJson: '[{"slug":"basics"}]',
            isDevMode: true,
            robotsMeta: '',
        });

        assert.match(html, /data-demo-base="\/demos\/"/);
        assert.match(html, /data-page-suffix="\.html"/);
        assert.match(html, /\[{"slug":"basics"}\]/);
    });

    it('stamps the flattened build base, an empty suffix, and the noindex tag', () => {
        const html = renderShotsHtml({
            template,
            demoListJson: '[]',
            isDevMode: false,
            robotsMeta: '<meta name="robots" content="noindex">',
        });

        assert.match(html, /data-demo-base="\.\/"/);
        assert.match(html, /data-page-suffix=""/);
        assert.match(html, /noindex/);
    });

    it('does not interpret replacement patterns inside the demo list', () => {
        const html = renderShotsHtml({ template, demoListJson: '["$&"]', isDevMode: true, robotsMeta: '' });

        assert.match(html, /\["\$&"\]/);
    });

    it('reserves the shots slug', () => {
        assert.equal(SHOTS_SLUG, 'shots');
    });
});
