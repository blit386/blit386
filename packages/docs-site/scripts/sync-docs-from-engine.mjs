#!/usr/bin/env node
/**
 * Generate the public documentation mirror from the canonical engine docs.
 *
 * The engine repository (`blit386`) is the single source of truth for public
 * API and guide prose under `docs/`. This script reads the subset listed in the
 * engine repo's sitemap manifest (`docs/_sitemap.json`) and writes the matching
 * Fumadocs MDX pages into `content/docs/`, applying frontmatter, dropping the
 * source H1, and rewriting links to site-relative or GitHub URLs.
 *
 * The manifest is the single source of truth for which docs publish, their site
 * URL, sidebar order, and subtitle. This script carries no per-page knowledge:
 * editing doc prose, adding a page, or reordering the sidebar is done entirely
 * in the engine repo (`docs/_sitemap.json`), never here. See that file's schema
 * (`docs/_sitemap.schema.json`) for the contract.
 *
 * The generated files are committed artifacts: never hand-edit them. Edit the
 * canonical source in `blit386/docs/` and re-run `pnpm run sync:docs`. CI uses
 * `pnpm run sync:docs:check` to fail when the mirror drifts from the source.
 *
 * Source location resolves from `ENGINE_DOCS_DIR` (used by CI with a checked-out
 * engine repo); locally it defaults to the sibling workspace path
 * `../blit386/docs`.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_DOCS = resolve(ROOT, process.env.ENGINE_DOCS_DIR ?? '../blit386/docs');
const CONTENT_DOCS = join(ROOT, 'content', 'docs');
const GITHUB_BASE = 'https://github.com/blit386/blit386';
const SITEMAP_FILE = join(ENGINE_DOCS, '_sitemap.json');

/**
 * Load and validate the sitemap manifest from the engine repo. Presence in
 * `pages` means a doc publishes; array order is the sidebar order. Validation is
 * fail-fast with a precise message so a malformed manifest never produces a
 * silently broken mirror.
 */
const loadSitemap = () => {
    let raw;

    try {
        raw = readFileSync(SITEMAP_FILE, 'utf8');
    } catch {
        throw new Error(`Cannot read sitemap manifest at ${SITEMAP_FILE}. Expected it in the engine docs directory.`);
    }

    let manifest;

    try {
        manifest = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Sitemap manifest ${SITEMAP_FILE} is not valid JSON: ${error.message}`);
    }

    const { sections, pages } = manifest;

    if (!sections || typeof sections !== 'object') {
        throw new Error('Sitemap manifest must define a "sections" object (section id -> title).');
    }

    if (!Array.isArray(pages) || pages.length === 0) {
        throw new Error('Sitemap manifest must define a non-empty "pages" array.');
    }

    const seenSrc = new Set();
    const seenPath = new Set();

    pages.forEach((page, index) => {
        const where = `pages[${index}]`;

        for (const field of ['src', 'path', 'description']) {
            if (typeof page[field] !== 'string' || page[field].trim() === '') {
                throw new Error(`Sitemap ${where} is missing a non-empty "${field}".`);
            }
        }

        if (page.path.split('/').length !== 2) {
            throw new Error(`Sitemap ${where} path "${page.path}" must be "<section>/<topic>".`);
        }

        const [section] = page.path.split('/');

        if (!sections[section]) {
            throw new Error(
                `Sitemap ${where} path "${page.path}" uses unknown section "${section}". Add it to "sections".`,
            );
        }

        if (seenSrc.has(page.src)) {
            throw new Error(`Sitemap ${where} repeats src "${page.src}".`);
        }

        if (seenPath.has(page.path)) {
            throw new Error(`Sitemap ${where} repeats path "${page.path}".`);
        }

        seenSrc.add(page.src);
        seenPath.add(page.path);
    });

    return { sections, pages };
};

const { sections: SECTION_TITLES, pages: PAGES } = loadSitemap();

/**
 * Canonical engine doc (repo-relative path) to published site path, derived from
 * the manifest. Drives link rewriting: a link resolving to one of these keys
 * upgrades to a site-relative `/docs/...` URL; everything else falls back to
 * GitHub. Only published docs appear here, so there is no dead-route risk.
 */
const SITE_PATHS = Object.fromEntries(PAGES.map((page) => [`docs/${page.src}`, `/docs/${page.path}`]));

/** Resolve the published site path for a source file, or throw if unmapped. */
const sitePathFor = (src) => {
    const sitePath = SITE_PATHS[`docs/${src}`];

    if (!sitePath) {
        throw new Error(`No site path mapped for engine doc "${src}". Add it to the sitemap manifest.`);
    }

    return sitePath;
};

/** Split a link target into its path and (optional) `#fragment` suffix. */
const splitFragment = (target) => {
    const hashIndex = target.indexOf('#');

    if (hashIndex === -1) {
        return { path: target, fragment: '' };
    }

    return { path: target.slice(0, hashIndex), fragment: target.slice(hashIndex) };
};

/**
 * Rewrite a single Markdown link target found in a source file.
 *
 * - External, anchor-only, and mail links pass through unchanged.
 * - Links to published docs (those in the manifest) become site-relative
 *   (`/docs/...`).
 * - Everything else (unpublished docs, contributor-only docs, repo config,
 *   source files) becomes an absolute GitHub URL resolved against the repo root.
 */
const rewriteTarget = (target, sourceRepoDir) => {
    const trimmed = target.trim();

    if (/^(https?:|mailto:|#)/u.test(trimmed)) {
        return trimmed;
    }

    const { path, fragment } = splitFragment(trimmed);

    if (path === '') {
        return trimmed;
    }

    const repoRelative = posix.normalize(posix.join(sourceRepoDir, path));
    const sitePath = SITE_PATHS[repoRelative];

    if (sitePath) {
        return `${sitePath}${fragment}`;
    }

    const kind = extname(repoRelative) ? 'blob' : 'tree';

    return `${GITHUB_BASE}/${kind}/main/${repoRelative}${fragment}`;
};

/**
 * Escape characters that MDX would otherwise parse as JSX or expressions. The
 * mirror is plain prose plus code, never intentional JSX, so a bare `<` (for
 * example `<50`) or `{` in text must render literally. Applied only to text
 * outside inline code and fenced blocks.
 */
const escapeMdxText = (text) => text.replaceAll('<', '&lt;').replaceAll('{', '&#123;').replaceAll('}', '&#125;');

/**
 * Transform body lines outside fenced code blocks: strip HTML comments (MDX
 * does not support them, and source comments such as cspell directives are
 * meaningless in the mirror), rewrite Markdown links, and escape MDX-hostile
 * characters in prose. Fenced blocks and inline code spans are left untouched
 * so example snippets keep their literal content.
 */
const transformBody = (markdown, sourceRepoDir) => {
    const linkPattern = /(\[[^\]]*\])\(([^)]+)\)/gu;
    const inlineCodePattern = /(`[^`]*`)/u;
    let isInFence = false;
    let isInHtmlComment = false;

    // Remove HTML comments by consuming `<!--` ... `-->` delimiters, tracking
    // open state across lines so multi-line comments are fully stripped. Walking
    // the delimiters (rather than a single regex replace) leaves no partial
    // `<!--` / `-->` behind.
    const stripComments = (line) => {
        let result = '';
        let rest = line;

        while (rest.length > 0) {
            if (isInHtmlComment) {
                const end = rest.indexOf('-->');

                if (end === -1) {
                    return result;
                }

                rest = rest.slice(end + 3);
                isInHtmlComment = false;
            } else {
                const start = rest.indexOf('<!--');

                if (start === -1) {
                    return result + rest;
                }

                result += rest.slice(0, start);
                rest = rest.slice(start + 4);
                isInHtmlComment = true;
            }
        }

        return result;
    };

    const lines = markdown.split('\n').map((line) => {
        if (/^\s*```/u.test(line)) {
            isInFence = !isInFence;

            return line;
        }

        if (isInFence) {
            return line;
        }

        // Split on inline code spans (odd indices) so links and escaping apply
        // only to prose, leaving `code` spans such as `texture_2d<u32>` intact.
        return stripComments(line)
            .split(inlineCodePattern)
            .map((segment, index) => {
                if (index % 2 === 1) {
                    return segment;
                }

                const linked = segment.replace(
                    linkPattern,
                    (_match, label, target) => `${label}(${rewriteTarget(target, sourceRepoDir)})`,
                );

                return escapeMdxText(linked);
            })
            .join('');
    });

    return lines.join('\n');
};

/** Strip the leading H1 and return the title plus the remaining body. */
const extractTitleAndBody = (markdown, source) => {
    const lines = markdown.split('\n');
    const headingIndex = lines.findIndex((line) => /^#\s+/u.test(line));

    if (headingIndex === -1) {
        throw new Error(`Source doc "${source}" has no H1 to use as the page title.`);
    }

    const title = lines[headingIndex].replace(/^#\s+/u, '').trim();
    const body = lines.filter((_line, index) => index !== headingIndex).join('\n');

    return { title, body: body.replace(/^\n+/u, '') };
};

/**
 * Drop the lead paragraph when it duplicates the frontmatter description, which
 * Fumadocs already renders as the page subtitle. Only an exact match is removed.
 */
const dropDuplicateIntro = (body, description) => {
    const breakIndex = body.indexOf('\n\n');
    const firstParagraph = (breakIndex === -1 ? body : body.slice(0, breakIndex)).trim();

    if (firstParagraph !== description.trim()) {
        return body;
    }

    return breakIndex === -1 ? '' : body.slice(breakIndex).replace(/^\n+/u, '');
};

/** Build the MDX file contents for one page. */
const renderPage = ({ src, description }) => {
    const sourcePath = join(ENGINE_DOCS, src);
    const raw = readFileSync(sourcePath, 'utf8');
    const { title, body } = extractTitleAndBody(raw, src);
    const sourceRepoDir = posix.dirname(`docs/${src}`);
    const trimmedBody = dropDuplicateIntro(body, description);
    const rewritten = transformBody(trimmedBody, sourceRepoDir);
    const banner = [
        `# Generated from blit386/docs/${src} by scripts/sync-docs-from-engine.mjs.`,
        '# Do not edit by hand: edit the engine source, then run `pnpm run sync:docs`.',
    ].join('\n');
    const frontmatter = `---\n${banner}\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---`;

    return `${frontmatter}\n\n${rewritten.trimEnd()}\n`;
};

/** Group generated pages by their top-level section, preserving manifest order. */
const groupBySection = () => {
    const sections = new Map();

    for (const page of PAGES) {
        const sitePath = sitePathFor(page.src);
        const segments = sitePath.replace(/^\/docs\//u, '').split('/');
        const [section, topic] = segments;

        if (!SECTION_TITLES[section]) {
            throw new Error(`No section title for "${section}" (from ${sitePath}).`);
        }

        const topics = sections.get(section) ?? [];
        sections.set(section, [...topics, { topic, page }]);
    }

    return sections;
};

const main = () => {
    const sections = groupBySection();
    const written = [];

    // Clear generator-managed section directories so renamed or removed pages do
    // not linger. Hand-authored files (content/docs/index.mdx, the root
    // meta.json) live directly under content/docs and are left untouched.
    for (const section of Object.keys(SECTION_TITLES)) {
        rmSync(join(CONTENT_DOCS, section), { recursive: true, force: true });
    }

    for (const [section, entries] of sections) {
        const sectionDir = join(CONTENT_DOCS, section);
        mkdirSync(sectionDir, { recursive: true });

        const meta = { title: SECTION_TITLES[section], pages: entries.map(({ topic }) => topic) };
        const metaPath = join(sectionDir, 'meta.json');
        writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
        written.push(metaPath);

        for (const { topic, page } of entries) {
            const pageDir = join(sectionDir, topic);
            mkdirSync(pageDir, { recursive: true });

            const pagePath = join(pageDir, 'index.mdx');
            writeFileSync(pagePath, renderPage(page));
            written.push(pagePath);
        }
    }

    for (const file of written) {
        console.log(`generated ${relative(ROOT, file)}`);
    }

    console.log(`\n${written.length} file(s) generated from ${relative(ROOT, ENGINE_DOCS)}.`);
};

main();
