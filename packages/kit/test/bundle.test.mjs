/** Integration tests for the single-file Vite build. Run after the kit build. */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { parse } from 'parse5';

const cli = join(dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');

function game() {
    const root = mkdtempSync(join(tmpdir(), 'blit-bundle-'));
    mkdirSync(join(root, 'public', 'sprites'), { recursive: true });
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'package.json'), '{"name":"test-game","type":"module"}');
    writeFileSync(join(root, 'dist', 'existing.txt'), 'keep me');
    writeFileSync(join(root, 'public', 'sprites', 'hero.png'), Buffer.from('sample image bytes'));
    writeFileSync(
        join(root, 'index.html'),
        '<!doctype html><html><head><style>body { margin: 0px 0px; }</style></head><body><span>one <b>two</b> three</span><pre>  keep</pre><img src="/sprites/hero.png"><script type="module" src="/main.js"></script></body></html>',
    );
    writeFileSync(
        join(root, 'main.js'),
        "import { used } from './module.js'; import './style.css'; document.body.dataset.value = used; fetch('/sprites/hero.png');",
    );
    writeFileSync(
        join(root, 'module.js'),
        "export const used = 'USED_VALUE'; export const unused = 'UNUSED_MARKER_98453';",
    );
    writeFileSync(join(root, 'style.css'), 'body { background-image: url(/sprites/hero.png); }');
    return root;
}

/** The text of the first inline (src-less) script, read with a real HTML parser. */
function inlineScript(html) {
    const stack = [parse(html)];
    while (stack.length) {
        const node = stack.shift();
        if (node.tagName === 'script' && !node.attrs.some((attr) => attr.name === 'src')) {
            return node.childNodes.map((child) => child.value ?? '').join('');
        }
        stack.push(...(node.childNodes ?? []), ...(node.content ? [node.content] : []));
    }
    return undefined;
}

function expectFailure(root, html, message) {
    writeFileSync(join(root, 'index.html'), html);
    const result = run(root, '--single');
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, message);
    assert.equal(existsSync(join(root, 'dist', 'bundle.html')), false);
}

function run(root, ...args) {
    const result = spawnSync(process.execPath, [cli, 'bundle', ...args], { cwd: root, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test('exports a minified single file with public assets and preserves an existing build', () => {
    const root = game();
    try {
        const result = run(root, '--single');
        assert.equal(result.status, 0, result.output);
        const html = readFileSync(join(root, 'dist', 'bundle.html'), 'utf8');
        assert.match(html, /USED_VALUE/);
        assert.doesNotMatch(html, /UNUSED_MARKER_98453/);
        assert.match(html, /data:image\/png;base64,/);
        assert.match(html, /one <b>two<\/b> three/);
        assert.match(html, /<pre> {2}keep<\/pre>/);
        assert.doesNotMatch(html, /<script[^>]+src=/);
        assert.equal(readFileSync(join(root, 'dist', 'existing.txt'), 'utf8'), 'keep me');
        assert.match(result.output, /bytes/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('fails on an external page resource without replacing a previous bundle', () => {
    const root = game();
    try {
        writeFileSync(join(root, 'dist', 'bundle.html'), 'previous');
        writeFileSync(
            join(root, 'index.html'),
            '<html><head><script src="https://example.com/game.js"></script></head><body></body></html>',
        );
        const result = run(root, '--single');
        assert.notEqual(result.status, 0);
        assert.match(result.output, /External resource/);
        assert.equal(readFileSync(join(root, 'dist', 'bundle.html'), 'utf8'), 'previous');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('requires --single and does not write output on an invalid invocation', () => {
    const root = game();
    try {
        const result = run(root);
        assert.notEqual(result.status, 0);
        assert.match(result.output, /blit bundle --single/);
        assert.equal(existsSync(join(root, 'dist', 'bundle.html')), false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('the embedded loader resolves root and page-relative paths without redirecting other origins', () => {
    const root = game();
    try {
        const result = run(root, '--single');
        assert.equal(result.status, 0, result.output);
        const html = readFileSync(join(root, 'dist', 'bundle.html'), 'utf8');
        const code = inlineScript(html);
        assert.ok(code);
        assert.ok(html.indexOf('charset="utf-8"') < html.indexOf('<script>'));
        const calls = [];
        class Image {
            set src(value) {
                this.value = value;
            }
            get src() {
                return this.value;
            }
        }
        const window = {
            fetch: (url) => {
                calls.push(url);
            },
        };
        runInNewContext(code, {
            window,
            document: { baseURI: 'file:///tmp/game/bundle.html' },
            HTMLImageElement: Image,
            URL,
            Request,
        });
        window.fetch('/sprites/hero.png?x=1');
        window.fetch('sprites/hero.png');
        const image = new Image();
        image.src = 'file:///tmp/game/sprites/hero.png';
        window.fetch('https://elsewhere.invalid/sprites/hero.png');
        window.fetch('/sprites/hero.png', { method: 'POST' });
        window.fetch(new Request('file:///tmp/game/sprites/hero.png'));
        assert.match(calls[0], /^data:image\/png;base64,/);
        assert.match(image.src, /^data:image\/png;base64,/);
        assert.match(calls[1], /^data:image\/png;base64,/);
        assert.equal(calls[2], 'https://elsewhere.invalid/sprites/hero.png');
        assert.equal(calls[3], '/sprites/hero.png');
        assert.match(calls[4].url, /^data:image\/png;base64,/);

        // A folder name with a space is percent-encoded in document.baseURI; relative paths must still resolve.
        const spaced = { fetch: (url) => url };
        runInNewContext(code, {
            window: spaced,
            document: { baseURI: 'file:///Users/Jane%20Doe/My%20Game/bundle.html' },
            HTMLImageElement: Image,
            URL,
            Request,
        });
        assert.match(spaced.fetch('sprites/hero.png'), /^data:image\/png;base64,/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('rejects a CSP meta tag instead of producing an unusable bundle', () => {
    const root = game();
    try {
        writeFileSync(
            join(root, 'index.html'),
            '<html><head><meta http-equiv="Content-Security-Policy" content="script-src \'self\'"></head><body><script type="module" src="/main.js"></script></body></html>',
        );
        const result = run(root, '--single');
        assert.notEqual(result.status, 0);
        assert.match(result.output, /Content-Security-Policy/);
        assert.equal(existsSync(join(root, 'dist', 'bundle.html')), false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('rejects <base>, srcset, CSS @import, and local links it cannot embed', () => {
    const root = game();
    try {
        const body = '<body><script type="module" src="/main.js"></script></body>';
        expectFailure(root, `<html><head><base href="/x/"></head>${body}</html>`, /<base>/);
        expectFailure(root, `<html><head></head><body><img srcset="/sprites/hero.png 1x"></body></html>`, /srcset/);
        expectFailure(
            root,
            `<html><head><style>@import "https://example.com/x.css";</style></head>${body}</html>`,
            /@import/,
        );
        expectFailure(
            root,
            `<html><head><link rel="manifest" href="/app.webmanifest"></head>${body}</html>`,
            /<link> pointing at a local file/,
        );
        expectFailure(root, `<html><head></head><body><svg><use href="/icons.svg#a"/></svg>${body.slice(6)}`, /<use>/);
        expectFailure(
            root,
            `<html><head></head><body><template><img src="/missing.png"></template>${body.slice(6)}`,
            /missing\.png/,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('rejects a symlinked public folder', () => {
    const root = game();
    try {
        rmSync(join(root, 'public'), { recursive: true });
        mkdirSync(join(root, 'elsewhere'));
        symlinkSync(join(root, 'elsewhere'), join(root, 'public'));
        expectFailure(root, readFileSync(join(root, 'index.html'), 'utf8'), /symbolic link/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('embeds SVG images, keeps one charset, skips dotfiles, and leaves quoted data URLs intact', () => {
    const root = game();
    try {
        writeFileSync(join(root, 'public', '.DS_Store'), 'DOTFILE_MARKER_51207');
        const svg = `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>')`;
        writeFileSync(
            join(root, 'index.html'),
            `<!doctype html><html><head><meta charset="UTF-8"><title>t</title></head><body><div style="background:${svg.replaceAll('"', '&quot;')}"></div><svg><image href="/sprites/hero.png"/></svg><script type="module" src="/main.js"></script></body></html>`,
        );
        const result = run(root, '--single');
        assert.equal(result.status, 0, result.output);
        const html = readFileSync(join(root, 'dist', 'bundle.html'), 'utf8');
        assert.equal(html.match(/charset=/gi)?.length, 1);
        assert.ok(html.search(/charset=/i) < html.indexOf('<script>'));
        assert.match(html, /<image href="data:image\/png;base64,/);
        assert.ok(!html.includes(Buffer.from('DOTFILE_MARKER_51207').toString('base64')));
        assert.ok(html.includes(svg.replaceAll('"', '&quot;')), 'the data URL style is unchanged');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('embeds image inputs, objects, feImage, and multi-word icon links; ignores @import in strings', () => {
    const root = game();
    try {
        writeFileSync(
            join(root, 'index.html'),
            '<!doctype html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><link rel="shortcut icon" href="/sprites/hero.png"></head><body><input type="image" src="/sprites/hero.png"><object data="/sprites/hero.png"></object><svg><filter><feImage href="/sprites/hero.png"/></filter></svg><div style="content:&quot;@import tips&quot;"></div><script type="module" src="/main.js"></script></body></html>',
        );
        const result = run(root, '--single');
        assert.equal(result.status, 0, result.output);
        const html = readFileSync(join(root, 'dist', 'bundle.html'), 'utf8');
        for (const pattern of [
            /<link rel="shortcut icon" href="data:/,
            /<input type="image" src="data:/,
            /<object data="data:/,
            /<feImage href="data:/,
        ]) {
            assert.match(html, pattern);
        }
        assert.equal(html.match(/charset=/gi)?.length, 1);
        assert.ok(html.search(/charset=/i) < html.indexOf('<script>'));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('embeds public files referenced from HTML in a game with a non-root base', () => {
    const root = game();
    try {
        writeFileSync(join(root, 'vite.config.js'), "export default { base: '/game/' };");
        const result = run(root, '--single');
        assert.equal(result.status, 0, result.output);
        assert.match(readFileSync(join(root, 'dist', 'bundle.html'), 'utf8'), /<img src="data:image\/png;base64,/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
