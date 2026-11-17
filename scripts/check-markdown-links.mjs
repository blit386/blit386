#!/usr/bin/env node
/**
 * Check every tracked Markdown file for dead links, fully offline.
 *
 * The file list comes from `git ls-files "*.md" "*.mdx"`, so enumeration honors
 * `.gitignore` and only covers tracked markdown (no recursive walk / denylist).
 * Symlinked `.agents/skills/*` entries are intentionally skipped: git tracks them
 * as symlink blobs and lists the underlying `.claude/skills/*` markdown directly,
 * so those files are checked exactly once and never double-processed.
 *
 * Generated doc pages under `packages/website/content/docs/<section>/**` are
 * gitignored build output (`pnpm run sync:docs`), so `git ls-files` never lists
 * them; their source in `packages/blit386/docs/` is checked instead. The path
 * pattern below still skips them should one ever be force-added. The hand-authored
 * hub (`content/docs/index.mdx`) and root `content/docs/meta.json` stay in scope.
 *
 * Test fixtures (any `__fixtures__/` directory) are skipped too: they are test input,
 * and some link to missing files on purpose (the docs-mirror generator's fallback tests).
 *
 * Two passes, neither touching the network (BT-846):
 *
 *   - `deadLinks` (Markdown links, reference definitions, and `href="..."` attributes):
 *     relative targets must be tracked paths; BLIT386's own URLs must name a
 *     real page - `/docs/...` and `blit386.dev/docs/...` against the docs sitemap and the
 *     hand-authored docs pages, other site routes against `packages/website/content/`,
 *     `demos.blit386.dev/<slug>` against `DEMO_ORDER`, and
 *     `github.com/blit386/blit386/(blob|tree)/main/<path>` against tracked paths. A
 *     root-relative `/route` Markdown link is only accepted under `packages/website/content/`,
 *     since on GitHub it points at the repository root (a `<Card href>` renders only on the
 *     site, so it is exempt). Every
 *     other URL (third-party sites, issues, PRs, `mailto:`) is deliberately not checked:
 *     a gate that fails on someone else's uptime blocks unrelated PRs.
 *   - `deadAnchors`: every relative `#frag` / `file.md#frag` must name a heading on the
 *     target page, slugged by `headingAnchors`, the rule blit386.dev and GitHub both use.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_ORDER } from '../packages/demos/plugins/demo-order.js';
import { RESERVED_SLUGS } from '../packages/demos/plugins/demo-registry.js';
import {
    DOCS_ROUTE,
    decodeOrRaw,
    findDemoLinkFailures,
    findDocsLinkFailures,
    readSitemap,
    SITE_HOST,
    tryParseUrl,
} from './lib/blit386-links.mjs';
import { gitEnv } from './lib/git-env.mjs';
import { headingAnchors } from './lib/heading-anchors.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, 'packages/blit386/docs');
const SITE_CONTENT_PREFIX = 'packages/website/content/';
const SITE_ORIGIN = `https://${SITE_HOST}`;
const GITHUB_MAIN_PATTERN = /^https:\/\/github\.com\/blit386\/blit386\/(?:blob|tree)\/main\/([^?#]*)/u;

/** Site routes the website serves without a `content/` page behind them. */
const SITE_ROUTE_ALLOWLIST = ['sitemap.xml', 'llms.txt', 'llms-full.txt'];

// shortcut: `build-a-game` pages are generated from `packages/kit/content` at build time, so only
// the section root is accepted; add a check here once a link points at a page inside it.
const GENERATED_DOCS_SECTIONS = ['build-a-game'];

/** Repo-relative path patterns to skip; see the file header for what and why. */
const IGNORED_PATH_PATTERNS = [/^packages\/website\/content\/docs\/[^/]+\//u, /(?:^|\/)__fixtures__\//u];

const FENCED_BLOCK_PATTERN = /^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1/gmu;
const CODE_SPAN_PATTERN = /`[^`\n]*`/gu;
// An inline link target, a reference definition at the start of a line, or an HTML / JSX
// `href="..."` attribute (the docs' `<Card href="/docs/...">` See also links).
// An inline target keeps one level of balanced parentheses, as CommonMark allows (`guide(v2).md`).
const LINK_TARGET_PATTERN =
    /\]\(\s*<?((?:[^()\s>]|\([^()\s>]*\))+)|^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)|\bhref="([^"\s]+)"/gmu;
// A scheme (`https:`, `mailto:`) or a site route (`/docs/...`): not a file in this repo.
const NON_FILE_TARGET_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/)/iu;
const MARKDOWN_FILE_PATTERN = /\.mdx?$/u;

/** @type {Map<string, Set<string>>} */
const anchorCache = new Map();

/** @param {string} path @returns {Set<string>} */
function anchorsOf(path) {
    let anchors = anchorCache.get(path);

    if (anchors === undefined) {
        anchors = headingAnchors(readFileSync(path, 'utf8'));
        anchorCache.set(path, anchors);
    }

    return anchors;
}

/** @param {string} source @returns {string} `source` without fenced blocks and code spans. */
function proseOf(source) {
    return source.replace(FENCED_BLOCK_PATTERN, '').replace(CODE_SPAN_PATTERN, '');
}

/**
 * Relative `#frag` and `file.md#frag` link targets in one page whose fragment names no heading
 * on the target page. A missing target file is `deadLinks`' to report, not this pass's.
 *
 * @param {string} filePath Absolute path of the page.
 * @param {string} source The page's Markdown.
 * @returns {string[]} The dead link targets, as written.
 */
export function deadAnchors(filePath, source) {
    const dead = [];

    for (const match of proseOf(source).matchAll(LINK_TARGET_PATTERN)) {
        const target = match[1] ?? match[2] ?? match[3];
        const hashAt = target.indexOf('#');

        if (hashAt < 0 || NON_FILE_TARGET_PATTERN.test(target)) {
            continue;
        }

        const path = target.slice(0, hashAt);
        const page = path === '' ? filePath : resolve(dirname(filePath), path);

        if (!MARKDOWN_FILE_PATTERN.test(page) || !existsSync(page)) {
            continue;
        }

        if (!anchorsOf(page).has(decodeOrRaw(target.slice(hashAt + 1)))) {
            dead.push(target);
        }
    }

    return dead;
}

/**
 * @typedef {object} LinkRegistries
 * @property {Set<string>} docsPaths Routes below `/docs/` (`api/core`, `faq`, `api` for a section index).
 * @property {Map<string, Set<string>>} docsAnchors Heading ids per docs route.
 * @property {Set<string>} sitePages Site routes outside `/docs` (`''`, `community`, `blog/<slug>`).
 * @property {Set<string>} demoSlugs Pages on demos.blit386.dev.
 * @property {string} root Absolute path the tracked paths are relative to.
 * @property {Set<string>} trackedPaths Tracked files and every directory above one, repo-relative.
 * @property {string} siteContentDir Absolute path of `packages/website/content/`, the only place a
 *   root-relative `/route` link resolves (on GitHub it points at the repository root instead).
 */

/**
 * The route a `/route` link or a `https://blit386.dev/route` URL names, without leading or
 * trailing slash, or `null` when `target` does not point at blit386.dev.
 *
 * @param {string} target
 * @returns {{ route: string, url: string } | null}
 */
function siteRouteOf(target) {
    const isRootRelative = target.startsWith('/') && !target.startsWith('//');
    const parsed = tryParseUrl(isRootRelative ? SITE_ORIGIN + target : target);

    if (parsed === null || parsed.protocol !== 'https:' || parsed.hostname !== SITE_HOST) {
        return null;
    }

    return { route: parsed.pathname.replace(/^\/|\/$/gu, ''), url: parsed.href };
}

/**
 * @param {string} filePath
 * @param {string} target
 * @param {LinkRegistries} registries
 * @param {boolean} isHref Whether `target` came from an `href="..."` attribute.
 * @returns {string | null} Why `target` is dead, or `null` when it resolves or is not checked.
 */
function deadLinkReason(filePath, target, registries, isHref) {
    if (target.startsWith('#')) {
        return null;
    }

    if (!NON_FILE_TARGET_PATTERN.test(target)) {
        // Tracked, not merely on disk: a fresh CI checkout has no build output or generated mirror
        // pages, and its Linux file system is case-sensitive where macOS is not.
        const path = resolve(dirname(filePath), decodeOrRaw(target.split(/[?#]/u)[0]));

        return registries.trackedPaths.has(normalizeRelSep(relative(registries.root, path)))
            ? null
            : 'no such tracked file';
    }

    const site = siteRouteOf(target);

    if (site !== null) {
        // A `<Card href>` renders only on the site, so it may use a root-relative route anywhere.
        if (!isHref && target.startsWith('/') && !filePath.startsWith(registries.siteContentDir)) {
            return `root-relative route only resolves on ${SITE_HOST} - use ${SITE_ORIGIN}${target}`;
        }

        if (site.route === DOCS_ROUTE) {
            return null;
        }

        if (site.route.startsWith(`${DOCS_ROUTE}/`)) {
            if (GENERATED_DOCS_SECTIONS.includes(site.route.slice(DOCS_ROUTE.length + 1))) {
                return null;
            }

            return findDocsLinkFailures([site.url], registries.docsPaths, registries.docsAnchors)[0] ?? null;
        }

        return registries.sitePages.has(site.route) ? null : `no page under ${SITE_CONTENT_PREFIX}`;
    }

    const demoFailure = findDemoLinkFailures([target], registries.demoSlugs)[0];

    if (demoFailure !== undefined) {
        return demoFailure;
    }

    const github = GITHUB_MAIN_PATTERN.exec(target);

    if (github !== null) {
        const path = decodeOrRaw(github[1]).replace(/\/$/u, '');

        return path === '' || registries.trackedPaths.has(path) ? null : 'no such tracked path';
    }

    return null;
}

/**
 * Link targets in one page that point at nothing: a missing relative file, or a BLIT386 URL
 * naming no page. Fragments on relative links are `deadAnchors`' job, and every URL outside
 * BLIT386's own sites is skipped.
 *
 * @param {string} filePath Absolute path of the page.
 * @param {string} source The page's Markdown.
 * @param {LinkRegistries} registries
 * @returns {{ target: string, reason: string }[]} The dead targets, as written, with why.
 */
export function deadLinks(filePath, source, registries) {
    const dead = [];

    for (const match of proseOf(source).matchAll(LINK_TARGET_PATTERN)) {
        const target = match[1] ?? match[2] ?? match[3];
        const reason = deadLinkReason(filePath, target, registries, match[3] !== undefined);

        if (reason !== null) {
            dead.push({ target, reason });
        }
    }

    return dead;
}

/** @param {Set<string>} set @param {string} path Adds `path` and every folder above it (`a`, `a/b`, `a/b/c`). */
function addWithAncestors(set, path) {
    const parts = path.split('/');

    for (let i = 1; i <= parts.length; i += 1) {
        set.add(parts.slice(0, i).join('/'));
    }
}

/**
 * The site route a tracked `packages/website/content/` page is served at: `''` for the home page,
 * `docs` for the docs hub, `docs/faq`, `blog/<slug>`.
 *
 * @param {string} path Repo-relative tracked path.
 * @returns {string | null} The route, or `null` for anything that is not a hand-authored `.mdx` page.
 */
export function contentRouteOf(path) {
    if (!path.startsWith(SITE_CONTENT_PREFIX) || !path.endsWith('.mdx') || isIgnoredFile(join(ROOT, path))) {
        return null;
    }

    return path.slice(SITE_CONTENT_PREFIX.length, -'.mdx'.length).replace(/(?:^|\/)index$/u, '');
}

/**
 * Builds the registries `deadLinks` checks against, from the working tree alone.
 *
 * @param {string[]} trackedPaths Repo-relative tracked paths.
 * @returns {LinkRegistries}
 */
function buildRegistries(trackedPaths) {
    const { sitemapPaths, anchorsByPath, sections } = readSitemap(DOCS_DIR);
    const docsPaths = new Set([...sitemapPaths, ...sections]);
    const docsAnchors = new Map(anchorsByPath);
    const sitePages = new Set(SITE_ROUTE_ALLOWLIST);
    const trackedWithDirs = new Set(['']); // '' is the repository root itself

    for (const path of trackedPaths) {
        addWithAncestors(trackedWithDirs, path);

        const route = contentRouteOf(path);

        if (route === null || route === DOCS_ROUTE) {
            continue;
        }

        if (route.startsWith(`${DOCS_ROUTE}/`)) {
            const docsRoute = route.slice(DOCS_ROUTE.length + 1);

            docsPaths.add(docsRoute);
            docsAnchors.set(docsRoute, anchorsOf(join(ROOT, path)));
        } else {
            // Each folder above a page is a section index the site renders (`/blog` for `blog/<slug>`).
            addWithAncestors(sitePages, route);
        }
    }

    return {
        root: ROOT,
        docsPaths,
        docsAnchors,
        sitePages,
        demoSlugs: new Set([...DEMO_ORDER, ...RESERVED_SLUGS]),
        trackedPaths: trackedWithDirs,
        siteContentDir: join(ROOT, SITE_CONTENT_PREFIX),
    };
}

/**
 * Runs one pass over every file and prints one block per file with a dead target.
 *
 * @param {string[]} files
 * @param {(filePath: string, source: string) => string[]} findDead Dead-target lines for one page.
 * @returns {number} the number of files with a dead target
 */
function checkFiles(files, findDead) {
    let failed = 0;

    for (const filePath of files) {
        const dead = findDead(filePath, readFileSync(filePath, 'utf8'));

        if (dead.length > 0) {
            failed += 1;
            console.log(`\nFILE: ./${relative(ROOT, filePath)}`);

            for (const line of dead) {
                console.log(`  [x] ${line}`);
            }
        }
    }

    return failed;
}

/** @param {string} rel @returns {string} */
export const normalizeRelSep = (rel) => rel.split('\\').join('/');

/** @param {string} filePath @returns {boolean} */
export function isIgnoredFile(filePath) {
    const rel = normalizeRelSep(relative(ROOT, filePath));

    return IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(rel));
}

/**
 * Lists every git-tracked path under the repo root, repo-relative.
 *
 * @returns {string[]} Repo-relative tracked paths.
 */
function listTrackedPaths() {
    let output;

    try {
        // `-z`: NUL-separated and unquoted, so a non-ASCII or oddly named path is kept as written.
        output = execFileSync('git', ['ls-files', '-z'], {
            cwd: ROOT,
            encoding: 'utf8',
            env: gitEnv(),
        });
    } catch {
        console.error('ERROR: docs:links requires a git repository to enumerate tracked markdown.');
        process.exit(1);
    }

    return output.split('\0').filter((entry) => entry.length > 0);
}

/**
 * Tracked markdown files as absolute paths, excluding generated doc-mirror pages (see `isIgnoredFile`).
 *
 * @param {string[]} trackedPaths Repo-relative tracked paths.
 * @returns {string[]} Absolute paths to tracked markdown files.
 */
function markdownFilesOf(trackedPaths) {
    const files = trackedPaths
        .filter((entry) => MARKDOWN_FILE_PATTERN.test(entry))
        .map((entry) => join(ROOT, entry))
        .filter((filePath) => !isIgnoredFile(filePath));

    if (files.length === 0) {
        console.error('ERROR: docs:links found no tracked markdown files (git ls-files "*.md" "*.mdx").');
        process.exit(1);
    }

    return files;
}

function main() {
    const trackedPaths = listTrackedPaths();
    const files = markdownFilesOf(trackedPaths).sort((a, b) => a.localeCompare(b));
    const registries = buildRegistries(trackedPaths);

    const failed =
        checkFiles(files, (filePath, source) =>
            deadLinks(filePath, source, registries).map(({ target, reason }) => `${target} -> ${reason}`),
        ) +
        checkFiles(files, (filePath, source) => deadAnchors(filePath, source).map((t) => `${t} -> no such heading`));

    if (failed > 0) {
        console.error(`\nERROR: ${failed} check(s) found dead links or anchors!`);
        process.exit(1);
    }

    console.log(`\n${files.length} markdown file(s) checked.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
