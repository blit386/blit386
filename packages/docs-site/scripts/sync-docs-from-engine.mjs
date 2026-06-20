#!/usr/bin/env node
/**
 * Generate the public documentation mirror from the canonical engine docs.
 *
 * The engine repository (`blit386`) is the single source of truth for public
 * API and guide prose under `docs/`. This script reads that subset and writes
 * the matching Fumadocs MDX pages into `content/docs/`, applying frontmatter,
 * dropping the source H1, and rewriting links to site-relative or GitHub URLs.
 *
 * The generated files are committed artifacts: never hand-edit them. Edit the
 * canonical source in `blit386/docs/` and re-run `pnpm run sync:docs`. CI uses
 * `pnpm run sync:docs:check` to fail when the mirror drifts from the source.
 *
 * Source location resolves from `ENGINE_DOCS_DIR` (used by CI with a checked-out
 * engine repo); locally it defaults to the sibling workspace path
 * `../blit386/docs`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_DOCS = resolve(ROOT, process.env.ENGINE_DOCS_DIR ?? '../blit386/docs');
const CONTENT_DOCS = join(ROOT, 'content', 'docs');
const GITHUB_BASE = 'https://github.com/blit386/blit386';

/**
 * Canonical engine doc (repo-relative path) to published site path. This is the
 * single source of truth for URLs: it drives both link rewriting and the set of
 * pages that may be generated. Keep it in sync with the migration plan URL map.
 */
const SITE_PATHS = {
    'docs/api-core.md': '/docs/api/core',
    'docs/api-rendering.md': '/docs/api/rendering',
    'docs/api-palette.md': '/docs/api/palette',
    'docs/api-assets.md': '/docs/api/assets',
    'docs/input.md': '/docs/guides/input',
    'docs/palette-guide.md': '/docs/guides/palette',
    'docs/palette-presets.md': '/docs/guides/palette-presets',
    'docs/overlay.md': '/docs/guides/overlay',
    'docs/post-process-effects.md': '/docs/guides/post-process-effects',
    'docs/bitmap-fonts.md': '/docs/guides/bitmap-fonts',
    'docs/performance-best-practices.md': '/docs/performance/best-practices',
    'docs/performance-testing.md': '/docs/performance/testing',
    'docs/software-fallback-smoke-matrix.md': '/docs/performance/smoke-matrix',
    'docs/deprecations.md': '/docs/reference/deprecations',
    'docs/testing.md': '/docs/reference/testing',
};

/** Human-readable titles for the generated section `meta.json` sidebars. */
const SECTION_TITLES = {
    api: 'API',
    guides: 'Guides',
    performance: 'Performance',
    reference: 'Reference',
};

/**
 * Pages to generate, in sidebar order within each section. Descriptions are the
 * page subtitle (frontmatter `description`); titles come from the source H1.
 * Enable more pages by adding entries here as each migration phase lands.
 */
const PAGES = [
    {
        source: 'api-core.md',
        description: 'Bootstrap, initialization, game loop timing, camera, and core types.',
    },
    {
        source: 'input.md',
        description: 'Pointer, keyboard, gamepad, and text-accumulation input in BLIT386.',
    },
    {
        source: 'deprecations.md',
        description: 'Central tracker for public API compatibility aliases and planned removals.',
    },
];

/** Resolve the published site path for a source file, or throw if unmapped. */
const sitePathFor = (source) => {
    const key = `docs/${source}`;
    const sitePath = SITE_PATHS[key];

    if (!sitePath) {
        throw new Error(`No site path mapped for engine doc "${key}". Add it to SITE_PATHS.`);
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
 * - Links to other ported docs become site-relative paths (`/docs/...`).
 * - Everything else (contributor-only docs, repo config, source files) becomes
 *   an absolute GitHub URL resolved against the engine repo root.
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

/** Rewrite every Markdown link on lines outside fenced code blocks. */
const rewriteLinks = (markdown, sourceRepoDir) => {
    const linkPattern = /(\[[^\]]*\])\(([^)]+)\)/gu;
    let isInFence = false;

    const lines = markdown.split('\n').map((line) => {
        if (/^\s*```/u.test(line)) {
            isInFence = !isInFence;

            return line;
        }

        if (isInFence) {
            return line;
        }

        return line.replace(
            linkPattern,
            (_match, label, target) => `${label}(${rewriteTarget(target, sourceRepoDir)})`,
        );
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
const renderPage = ({ source, description }) => {
    const sourcePath = join(ENGINE_DOCS, source);
    const raw = readFileSync(sourcePath, 'utf8');
    const { title, body } = extractTitleAndBody(raw, source);
    const sourceRepoDir = posix.dirname(`docs/${source}`);
    const trimmedBody = dropDuplicateIntro(body, description);
    const rewritten = rewriteLinks(trimmedBody, sourceRepoDir);
    const banner = [
        `# Generated from blit386/docs/${source} by scripts/sync-docs-from-engine.mjs.`,
        '# Do not edit by hand: edit the engine source, then run `pnpm run sync:docs`.',
    ].join('\n');
    const frontmatter = `---\n${banner}\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---`;

    return `${frontmatter}\n\n${rewritten.trimEnd()}\n`;
};

/** Group generated pages by their top-level section, preserving PAGES order. */
const groupBySection = () => {
    const sections = new Map();

    for (const page of PAGES) {
        const sitePath = sitePathFor(page.source);
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
