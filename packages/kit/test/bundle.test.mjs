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

/** Install a stand-in engine package so the game can import 'blit386'. */
function installEngine(root, version, engine = join(root, 'node_modules', 'blit386')) {
    mkdirSync(join(engine, 'dist'), { recursive: true });
    writeFileSync(
        join(engine, 'package.json'),
        JSON.stringify({
            name: 'blit386',
            version,
            type: 'module',
            exports: { '.': { import: './dist/blit386.js', require: './dist/blit386.cjs' } },
        }),
    );
    // A dist/package.json of its own, as some builds ship, must not be mistaken for the engine's.
    writeFileSync(join(engine, 'dist', 'package.json'), '{"type":"module"}');
    const source = "export const BT = { marker: 'ENGINE_MARKER_51734' };\n";
    writeFileSync(join(engine, 'dist', 'blit386.js'), source);
    writeFileSync(join(engine, 'dist', 'blit386.cjs'), "exports.BT = { marker: 'ENGINE_MARKER_51734' };\n");
    writeFileSync(join(root, 'main.js'), "import { BT } from 'blit386'; document.body.dataset.value = BT.marker;");
    return Buffer.byteLength(source);
}

test('--engine cdn imports the installed engine version from jsDelivr and reports both sizes', () => {
    const root = game();
    try {
        const engineBytes = installEngine(root, '9.8.7');
        const inline = run(root, '--single');
        assert.equal(inline.status, 0, inline.output);
        assert.match(readFileSync(join(root, 'dist', 'bundle.html'), 'utf8'), /ENGINE_MARKER_51734/);

        const result = run(root, '--single', '--engine', 'cdn');
        assert.equal(result.status, 0, result.output);
        const html = readFileSync(join(root, 'dist', 'bundle.html'), 'utf8');
        assert.match(html, /from"https:\/\/cdn\.jsdelivr\.net\/npm\/blit386@9\.8\.7\/dist\/blit386\.js"/);
        assert.doesNotMatch(html, /ENGINE_MARKER_51734/);
        const bytes = Buffer.byteLength(html);
        assert.match(result.output, new RegExp(`${bytes} bytes`));
        assert.match(result.output, new RegExp(`${bytes + engineBytes} bytes`));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('--engine cdn fails without an installed engine or with a version jsDelivr cannot pin', () => {
    const root = game();
    try {
        let result = run(root, '--single', '--engine', 'cdn');
        assert.notEqual(result.status, 0);
        assert.match(result.output, /blit386/);
        installEngine(root, '9.8.7');
        rmSync(join(root, 'node_modules', 'blit386', 'dist', 'blit386.js'));
        result = run(root, '--single', '--engine', 'cdn');
        assert.notEqual(result.status, 0);
        assert.match(result.output, /Run npm install/);
        installEngine(root, 'workspace:*');
        result = run(root, '--single', '--engine', 'cdn');
        assert.notEqual(result.status, 0);
        assert.match(result.output, /workspace:\*/);
        assert.equal(existsSync(join(root, 'dist', 'bundle.html')), false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('--out writes another file in dist/ and rejects paths outside it', () => {
    const root = game();
    try {
        const result = run(root, '--single', '--out', 'demo.html');
        assert.equal(result.status, 0, result.output);
        assert.ok(existsSync(join(root, 'dist', 'demo.html')));
        assert.equal(existsSync(join(root, 'dist', 'bundle.html')), false);
        assert.match(result.output, /dist\/demo\.html/);
        for (const out of ['../index.html', 'sub/demo.html', 'demo.txt', '.html', 'C:demo.html']) {
            const rejected = run(root, '--single', '--out', out);
            assert.notEqual(rejected.status, 0, out);
            assert.match(rejected.output, /--out/);
        }
        assert.match(readFileSync(join(root, 'index.html'), 'utf8'), /<!doctype html>/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('--title replaces the page title or adds one', () => {
    const root = game();
    try {
        let result = run(root, '--single', '--title', 'Fish & <Chips>');
        assert.equal(result.status, 0, result.output);
        let html = readFileSync(join(root, 'dist', 'bundle.html'), 'utf8');
        assert.equal(html.match(/<title>/g)?.length, 1);
        assert.match(html, /<title>Fish &amp; &lt;Chips&gt;<\/title>/);

        const page = readFileSync(join(root, 'index.html'), 'utf8');
        writeFileSync(join(root, 'index.html'), page.replace('<head>', '<head><title>Old</title>'));
        result = run(root, '--single', '--title', 'New');
        assert.equal(result.status, 0, result.output);
        html = readFileSync(join(root, 'dist', 'bundle.html'), 'utf8');
        assert.equal(html.match(/<title>/g)?.length, 1);
        assert.match(html, /<title>New<\/title>/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('rejects unknown options and engine modes without writing output', () => {
    const root = game();
    try {
        for (const args of [
            ['--single', '--engine', 'remote'],
            ['--single', '--splash'],
            ['--single', 'extra'],
        ]) {
            const result = run(root, ...args);
            assert.notEqual(result.status, 0, args.join(' '));
            assert.match(result.output, /blit bundle --single/);
        }
        assert.equal(existsSync(join(root, 'dist', 'bundle.html')), false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('--title leaves an inline SVG title alone and titles the page', () => {
    const root = game();
    try {
        const page = readFileSync(join(root, 'index.html'), 'utf8');
        writeFileSync(join(root, 'index.html'), page.replace('<body>', '<body><svg><title>Logo tip</title></svg>'));
        const result = run(root, '--single', '--title', 'Demo');
        assert.equal(result.status, 0, result.output);
        const html = readFileSync(join(root, 'dist', 'bundle.html'), 'utf8');
        assert.match(html, /<head>.*<title>Demo<\/title>.*<\/head>/s);
        assert.match(html, /<svg><title>Logo tip<\/title><\/svg>/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('--out replaces an earlier bundle but never another file in dist/', () => {
    const root = game();
    try {
        writeFileSync(join(root, 'dist', 'index.html'), 'hosted build');
        const refused = run(root, '--single', '--out', 'index.html');
        assert.notEqual(refused.status, 0);
        assert.match(refused.output, /not a file blit bundle wrote/);
        assert.equal(readFileSync(join(root, 'dist', 'index.html'), 'utf8'), 'hosted build');

        assert.equal(run(root, '--single', '--out', 'demo.html').status, 0);
        const again = run(root, '--single', '--out', 'demo.html', '--title', 'Again');
        assert.equal(again.status, 0, again.output);
        assert.match(readFileSync(join(root, 'dist', 'demo.html'), 'utf8'), /<title>Again<\/title>/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('--engine cdn refuses a linked engine, which jsDelivr may not have', () => {
    const root = game();
    // A workspace or `npm link` engine: a real folder outside any node_modules, symlinked in.
    const linked = mkdtempSync(join(tmpdir(), 'blit-engine-'));
    try {
        installEngine(root, '9.8.7', linked);
        mkdirSync(join(root, 'node_modules'));
        symlinkSync(linked, join(root, 'node_modules', 'blit386'));
        const result = run(root, '--single', '--engine', 'cdn');
        assert.notEqual(result.status, 0);
        assert.match(result.output, /linked copy/);
        assert.equal(existsSync(join(root, 'dist', 'bundle.html')), false);
    } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(linked, { recursive: true, force: true });
    }
});
