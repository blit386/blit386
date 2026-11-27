/** `blit bundle --single` - export a Vite game as one HTML file, offline unless `--engine cdn` is given. */
// cspell:ignore mrmime

import {
    existsSync,
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    realpathSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

import type { DefaultTreeAdapterTypes } from 'parse5';
import type valueParser from 'postcss-value-parser';

import { findProjectRoot } from '../env';
import { hasSymlinkedSegment } from '../fs-safety';
import { ui } from '../messages';

const OUTPUT_DIR = 'dist';
const DEFAULT_OUTPUT = 'bundle.html';
const ENGINE_PACKAGE = 'blit386';

// Same URL form as the pinned import in packages/blit386/docs/guide-single-file.md; keep in step with
// CDN_PIN_RE in scripts/lib/cdn-pin.mjs.
const ENGINE_CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/blit386@';
const ENGINE_CDN_FILE = '/dist/blit386.js';
const ENGINE_MODES = ['inline', 'cdn'] as const;

// Written into every bundle, so --out may replace an earlier bundle but never another file in dist/.
const BUNDLE_MARKER = '<meta name="generator" content="blit bundle">';

type EngineMode = (typeof ENGINE_MODES)[number];

const HELP = `Usage: blit bundle --single [--engine inline|cdn] [--out <name>.html] [--title <text>]

Build one HTML file at ${OUTPUT_DIR}/${DEFAULT_OUTPUT}.

  --engine inline   Put the engine inside the file (default). Runs with no network.
  --engine cdn      Load the installed blit386 version from jsDelivr and put only the game
                    in the file. Smaller, but the player needs a network connection.
  --out <name>.html Write ${OUTPUT_DIR}/<name>.html instead.
  --title <text>    Set the page title.
`;

// Resolves page-relative references; anything that lands on another origin is external.
const BUNDLE_BASE = 'https://bundle.invalid/';
const BUNDLE_ORIGIN = new URL(BUNDLE_BASE).origin;
const HREF = 'href';

// SVG elements whose href loads an image a data URL can replace (parse5 keeps SVG's camelCase names).
const SVG_IMAGE_TAGS = new Set(['image', 'feImage']);

const SRC_TAGS = new Set(['script', 'img', 'source', 'audio', 'video', 'track', 'iframe', 'embed']);

const INLINE_LINK_TYPES = new Set([
    'stylesheet',
    'icon',
    'apple-touch-icon',
    'apple-touch-icon-precomposed',
    'mask-icon',
    'preload',
    'modulepreload',
]);

type AssetMap = Map<string, string>;
type Node = DefaultTreeAdapterTypes.Node;
type MimeModule = typeof import('mrmime');
type HtmlModule = typeof import('parse5');
type CssParser = typeof valueParser;

function isMissing(error: unknown): boolean {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * Every file under `public/` as a data URL keyed by its site path (`/sprites/hero.png`). All of them are included
 * because game code can construct their paths at runtime. Throws on a symlink anywhere in the tree.
 */
function readPublicFiles(publicDir: string | false, lookup: MimeModule['lookup']): AssetMap {
    const assets: AssetMap = new Map();

    if (!publicDir) {
        return assets;
    }

    try {
        if (lstatSync(publicDir).isSymbolicLink()) {
            throw new Error(`Cannot bundle a symbolic link as public/: ${publicDir}`);
        }
    } catch (error) {
        if (isMissing(error)) {
            return assets;
        }

        throw error;
    }

    function visit(dir: string): void {
        let entries;

        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch (error) {
            if (isMissing(error)) {
                return;
            }

            throw error;
        }
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            // Hidden files (.DS_Store, .gitkeep, editor swap files) are never game assets.
            if (entry.name.startsWith('.')) {
                continue;
            }

            const path = join(dir, entry.name);

            if (entry.isSymbolicLink()) {
                throw new Error(`Cannot bundle a symbolic link in public/: ${path}`);
            }

            if (entry.isDirectory()) {
                visit(path);
            } else if (entry.isFile()) {
                const key = `/${relative(publicDir as string, path)
                    .split(sep)
                    .join('/')}`;

                const mime = lookup(extname(path)) || 'application/octet-stream';

                assets.set(key, `data:${mime};base64,${readFileSync(path).toString('base64')}`);
            }
        }
    }

    visit(publicDir);

    return assets;
}

/** The parsed URL of a reference, or null when it needs no file: empty, a fragment, or a data URL. */
function referenceUrl(value: string): URL | null {
    const text = value.trim();

    if (!text || text.startsWith('#') || /^data:/i.test(text)) {
        return null;
    }

    try {
        return new URL(text, BUNDLE_BASE);
    } catch {
        throw new Error(`Cannot bundle resource: ${value}`);
    }
}

/** A reference to a file of this game, as opposed to empty, a fragment, a data URL, or another origin. */
function isLocalReference(value: string): boolean {
    return referenceUrl(value)?.origin === BUNDLE_ORIGIN;
}

/** Resolve a static HTML or CSS resource, failing if it cannot be embedded. */
function inlineResource(value: string, assets: AssetMap): string {
    const url = referenceUrl(value);

    if (!url) {
        return value;
    }

    if (url.origin !== BUNDLE_ORIGIN) {
        throw new Error(`External resource cannot be included in the offline bundle: ${value}`);
    }

    let path: string;

    try {
        path = decodeURIComponent(url.pathname);
    } catch {
        throw new Error(`Invalid resource path: ${value}`);
    }

    const asset = assets.get(path);

    if (!asset) {
        throw new Error(`Resource could not be embedded: ${value}`);
    }

    return asset + url.hash;
}

function inlineCss(css: string, assets: AssetMap, valueParser: CssParser): string {
    const parsed = valueParser(css);
    parsed.walk((node) => {
        // A word node, so `@import` inside a string or comment does not count.
        if (node.type === 'word' && node.value.toLowerCase() === '@import') {
            throw new Error('The bundle contains a CSS @import that could not be inlined.');
        }

        if (node.type !== 'function' || node.value.toLowerCase() !== 'url') {
            return;
        }

        const raw = valueParser.stringify(node.nodes).trim();
        const unquoted = raw.replace(/^(['"])([\s\S]*)\1$/, '$2');
        const inlined = inlineResource(unquoted, assets);

        // Leave data URLs and fragments exactly as written; re-quoting them could break their own quotes.
        if (inlined === unquoted) {
            return;
        }

        const value = inlined.replace(/["\\]/g, '\\$&');

        node.nodes = [{ type: 'string', quote: '"', value, sourceIndex: 0, sourceEndIndex: 0 }];
    });

    return parsed.toString();
}

/** A tiny URL adapter for the engine's fetch-based audio/fonts and Image-based sprite loaders. */
function assetBootstrap(assets: AssetMap): string {
    const entries = JSON.stringify([...assets]).replace(/</g, '\\u003c');

    return `(()=>{const a=new Map(${entries});const d=new URL('.',document.baseURI);const b=decodeURIComponent(d.pathname);function r(x){try{const u=new URL(x,document.baseURI);if(u.protocol!==d.protocol||(u.protocol!=='file:'&&u.origin!==d.origin))return null;let p=decodeURIComponent(u.pathname);if(p.startsWith(b))p='/'+p.slice(b.length);return a.get(p)||null}catch{return null}}const f=window.fetch;window.fetch=function(x,i){const q=x instanceof Request;const m=(i?.method|| (q?x.method:'GET')).toUpperCase();const v=m==='GET'&&r(q?x.url:x);return v?f.call(this,q?new Request(v,x):v,i):f.call(this,x,i)};const p=HTMLImageElement.prototype;const s=Object.getOwnPropertyDescriptor(p,'src');if(s&&s.set&&s.get)Object.defineProperty(p,'src',{...s,set(v){s.set.call(this,r(v)||v)}})})();`;
}

function inlineHtml(
    html: string,
    assets: AssetMap,
    parser: HtmlModule,
    valueParser: CssParser,
    title: string | undefined,
): string {
    const document = parser.parse(html);
    let head: DefaultTreeAdapterTypes.Element | undefined;
    let charset: DefaultTreeAdapterTypes.Element | undefined;
    let titleElement: DefaultTreeAdapterTypes.Element | undefined;

    function visit(node: Node): void {
        if ('tagName' in node) {
            const tag = node.tagName;
            const attrs = node.attrs;

            const attrValue = (name: string): string =>
                attrs.find((attr) => attr.name === name)?.value.toLowerCase() ?? '';

            if (tag === 'head') {
                head = node;
            }

            // Only the page's own title: an inline SVG's <title> is a tooltip with the same tag name.
            if (tag === 'title' && node.namespaceURI === parser.html.NS.HTML && node.parentNode === head) {
                titleElement ??= node;
            }

            if (tag === 'base') {
                throw new Error('The single-file bundle does not support an HTML <base> tag.');
            }

            if (tag === 'meta') {
                const httpEquiv = attrValue('http-equiv');

                if (httpEquiv === 'content-security-policy') {
                    throw new Error('The single-file bundle does not support a Content-Security-Policy meta tag.');
                }

                if (httpEquiv === 'content-type' || attrs.some((attr) => attr.name === 'charset')) {
                    charset ??= node;
                }
            }

            const isLink = tag === 'link';
            const rel = attrValue('rel');
            const inlineLink = rel.split(/\s+/).some((token) => INLINE_LINK_TYPES.has(token));
            const imageInput = tag === 'input' && attrValue('type') === 'image';

            for (const attr of attrs) {
                if (attr.name === 'style') {
                    attr.value = inlineCss(attr.value, assets, valueParser);
                }

                if (attr.name === 'srcset') {
                    throw new Error('The single-file bundle does not support srcset.');
                }

                const isHref = attr.name === HREF;

                const resource =
                    (attr.name === 'src' && (SRC_TAGS.has(tag) || imageInput)) ||
                    (attr.name === 'poster' && tag === 'video') ||
                    (attr.name === 'data' && tag === 'object') ||
                    (isHref && SVG_IMAGE_TAGS.has(tag)) ||
                    (isHref && isLink && inlineLink);

                if (resource) {
                    attr.value = inlineResource(attr.value, assets);
                } else if (isHref && (isLink || tag === 'use') && isLocalReference(attr.value)) {
                    // A data URL cannot stand in for these: a <use> of another file, or a link type the page fetches.
                    throw new Error(
                        `The single-file bundle does not support <${tag}> pointing at a local file: ${attr.value}`,
                    );
                }
            }

            if (node.tagName === 'style') {
                for (const child of node.childNodes) {
                    if (child.nodeName === '#text' && 'value' in child) {
                        child.value = inlineCss(child.value, assets, valueParser);
                    }
                }
            }
        }

        if ('childNodes' in node) {
            for (const child of node.childNodes) {
                visit(child);
            }
        }

        // A <template> keeps its markup in a separate fragment, not in childNodes.
        if ('content' in node) {
            visit(node.content);
        }
    }

    visit(document);

    if (!head) {
        throw new Error('The game HTML has no head element.');
    }

    if (title !== undefined) {
        const adapter = parser.defaultTreeAdapter;

        if (titleElement) {
            titleElement.childNodes = [];
        } else {
            titleElement = adapter.createElement('title', parser.html.NS.HTML, []);
            adapter.appendChild(head, titleElement);
        }

        adapter.insertText(titleElement, title);
    }

    for (const node of parser.parseFragment(BUNDLE_MARKER).childNodes) {
        parser.defaultTreeAdapter.appendChild(head, node);
    }

    if (assets.size) {
        // The asset map can be large, so the encoding declaration must precede it: reuse the page's own, moved first.
        if (charset?.parentNode) {
            const siblings = charset.parentNode.childNodes;

            siblings.splice(siblings.indexOf(charset), 1);
        }

        const meta = charset ? '' : '<meta charset="utf-8">';
        const fragment = parser.parseFragment(`${meta}<script>${assetBootstrap(assets)}</script>`);
        const nodes = charset ? [charset, ...fragment.childNodes] : fragment.childNodes;

        for (const node of nodes) {
            node.parentNode = head;
        }

        head.childNodes.unshift(...nodes);
    }

    return parser.serialize(document);
}

interface BundleOptions {
    engine: EngineMode;
    output: string;
    title: string | undefined;
}

function usageError(message: string, cause?: unknown): Error {
    return new Error(`${message}\nUse: blit bundle --single\n${HELP}`, { cause });
}

function parseBundleArgs(args: string[]): BundleOptions {
    let values;

    try {
        ({ values } = parseArgs({
            args,
            options: {
                single: { type: 'boolean' },
                engine: { type: 'string' },
                out: { type: 'string' },
                title: { type: 'string' },
            },
        }));
    } catch (error) {
        throw usageError((error as Error).message, error);
    }

    if (!values.single) {
        throw usageError('The bundle command needs --single.');
    }

    const engine = values.engine ?? 'inline';

    if (!ENGINE_MODES.some((mode) => mode === engine)) {
        throw usageError(`--engine is inline or cdn, not ${engine}.`);
    }

    const name = values.out ?? DEFAULT_OUTPUT;

    // A bare file name keeps the output inside dist/, so it can never replace the game's own files. No `:`, which
    // Windows reads as a drive (`C:demo.html`).
    if (!/^[^./\\:][^/\\:]*\.html$/.test(name)) {
        throw usageError(`--out takes a file name ending in .html, written to ${OUTPUT_DIR}/: ${name}`);
    }

    return { engine: engine as EngineMode, output: `${OUTPUT_DIR}/${name}`, title: values.title };
}

/** The jsDelivr URL of the engine version this game has installed, and the size of that file. */
function installedEngine(root: string): { url: string; bytes: number } {
    const notInstalled = (cause: unknown): Error =>
        new Error('--engine cdn needs blit386 installed in this game. Run npm install and try again.', { cause });

    let entry: string;

    try {
        entry = createRequire(join(root, 'package.json')).resolve(ENGINE_PACKAGE);
    } catch (error) {
        throw notInstalled(error);
    }

    // Walk up from the entry file to the engine's own package.json (a dist/ folder may carry its own).
    let dir = dirname(entry);
    let manifest: { name?: unknown; version?: unknown } = {};

    while (true) {
        const file = join(dir, 'package.json');

        if (existsSync(file)) {
            manifest = JSON.parse(readFileSync(file, 'utf8')) as typeof manifest;

            if (manifest.name === ENGINE_PACKAGE) {
                break;
            }
        }

        const parent = dirname(dir);

        if (parent === dir) {
            throw notInstalled(undefined);
        }

        dir = parent;
    }

    // A linked engine (a workspace or `npm link`) can be a version npm, and so jsDelivr, does not have yet.
    if (!realpathSync(dir).split(sep).includes('node_modules')) {
        throw new Error(
            `--engine cdn needs blit386 installed from npm, but this game uses a linked copy at ${dir}. Use --engine inline.`,
        );
    }

    const version = String(manifest.version);

    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error(`--engine cdn needs a published blit386 version to load from jsDelivr, found ${version}.`);
    }

    let bytes: number;

    try {
        bytes = statSync(join(dir, ENGINE_CDN_FILE)).size;
    } catch (error) {
        if (isMissing(error)) {
            throw notInstalled(error);
        }

        throw error;
    }

    return { url: `${ENGINE_CDN_PREFIX}${version}${ENGINE_CDN_FILE}`, bytes };
}

/** CLI entry point. Reports failure by throwing an `Error` with a user-facing message, which `cli.ts` prints. */
export async function runBundle(args: string[]): Promise<void> {
    if (args.includes('--help') || args.includes('-h')) {
        process.stdout.write(HELP);

        return;
    }

    const options = parseBundleArgs(args);
    const root = findProjectRoot(process.cwd());

    if (!root) {
        throw new Error("Couldn't find a game here. Run this inside your game folder.");
    }

    const engine = options.engine === 'cdn' ? installedEngine(root) : undefined;

    let vite: typeof import('vite');
    let singleFile: typeof import('vite-plugin-singlefile');
    let mime: MimeModule;
    let htmlParser: HtmlModule;
    let cssParser: { default: CssParser };

    try {
        [vite, singleFile, mime, htmlParser, cssParser] = await Promise.all([
            import('vite'),
            import('vite-plugin-singlefile'),
            import('mrmime'),
            import('parse5'),
            import('postcss-value-parser'),
        ]);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
            throw new Error(
                `The bundle command could not load a package it needs (${(error as Error).message}). Install the game dependencies and try again.`,
                { cause: error },
            );
        }

        throw error;
    }

    let publicDir: string | false = false;

    const result = await vite.build({
        root,
        plugins: [
            singleFile.viteSingleFile(),

            {
                name: 'blit-bundle-public-dir',
                configResolved(config) {
                    publicDir = config.publicDir;
                },
            },

            engine && {
                name: 'blit-bundle-engine-cdn',
                enforce: 'pre',
                resolveId(id) {
                    return id === ENGINE_PACKAGE ? { id: engine.url, external: true } : null;
                },
            },
        ],

        build: { write: false, copyPublicDir: false, minify: true, sourcemap: false },
    });
    const builds = Array.isArray(result) ? result : [result];
    const files = builds.flatMap((build) => ('output' in build ? build.output : []));

    if (files.length !== 1 || files[0]?.type !== 'asset' || !files[0].fileName.endsWith('.html')) {
        throw new Error(
            'The build did not produce exactly one HTML file. Check for additional entry points or emitted assets.',
        );
    }

    // Vite has already minified the code and styles; the HTML shell around them is small.
    const html = inlineHtml(
        String(files[0].source),
        readPublicFiles(publicDir, mime.lookup),
        htmlParser,
        cssParser.default,
        options.title,
    );

    const target = options.output;
    const output = resolve(root, target);

    if (hasSymlinkedSegment(output, root)) {
        throw new Error(`Cannot write through a symbolic link: ${target}`);
    }

    mkdirSync(dirname(output), { recursive: true });

    // Do not overwrite a directory or follow a symlink placed at the final path.
    try {
        if (!lstatSync(output).isFile()) {
            throw new Error(`Cannot replace ${target}: it is not a file.`);
        }

        // bundle.html predates the marker; any other name must hold an earlier bundle, never a build file.
        if (target !== `${OUTPUT_DIR}/${DEFAULT_OUTPUT}` && !readFileSync(output, 'utf8').includes(BUNDLE_MARKER)) {
            throw new Error(`Cannot replace ${target}: it is not a file blit bundle wrote. Pick another --out name.`);
        }
    } catch (error) {
        if (!isMissing(error)) {
            throw error;
        }
    }

    const temp = join(dirname(output), `.blit-bundle-${randomUUID()}.tmp`);

    try {
        writeFileSync(temp, html, { flag: 'wx' });
        renameSync(temp, output);
    } finally {
        rmSync(temp, { force: true });
    }

    const bytes = Buffer.byteLength(html);

    const size = engine
        ? `${bytes} bytes of game; ${bytes + engine.bytes} bytes with the engine from ${engine.url}`
        : `${bytes} bytes`;

    process.stdout.write(`${ui.info(`Wrote ${target} (${size}).`)}\n`);
}
