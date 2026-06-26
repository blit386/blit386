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
import { fileURLToPath, pathToFileURL } from 'node:url';

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

        const segments = page.path.split('/');

        if (segments.length !== 2 || segments.some((segment) => segment === '')) {
            throw new Error(
                `Sitemap ${where} path "${page.path}" must be "<section>/<topic>" with both parts non-empty.`,
            );
        }

        const [section] = segments;

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
const rewriteTarget = (target, sourceRepoDir, sitePaths = SITE_PATHS) => {
    const trimmed = target.trim();

    if (/^(https?:|mailto:|#)/u.test(trimmed)) {
        return trimmed;
    }

    const { path, fragment } = splitFragment(trimmed);

    if (path === '') {
        return trimmed;
    }

    const repoRelative = posix.normalize(posix.join(sourceRepoDir, path));
    const sitePath = sitePaths[repoRelative];

    if (sitePath) {
        return `${sitePath}${fragment}`;
    }

    const kind = extname(repoRelative) ? 'blob' : 'tree';

    return `${GITHUB_BASE}/${kind}/main/${repoRelative}${fragment}`;
};

/**
 * Escape characters that MDX would otherwise parse as JSX or expressions. A
 * bare `<` (e.g. `<50`) or `{` in prose must render literally, but MDX
 * component tags (PascalCase opening tags such as `<Callout>` and their
 * closing counterparts `</Callout>`) are intentional and must pass through
 * unchanged. Applied only to text outside inline code and fenced blocks.
 */
const escapeMdxText = (text) =>
    text
        .replace(/<(?![A-Z]|\/[A-Z])/gu, '&lt;')
        .replaceAll('{', '&#123;')
        .replaceAll('}', '&#125;');

/**
 * Transform body lines outside fenced code blocks: strip HTML comments (MDX
 * does not support them, and source comments such as cspell directives are
 * meaningless in the mirror), rewrite Markdown links, and escape MDX-hostile
 * characters in prose. Fenced blocks and inline code spans are left untouched
 * so example snippets keep their literal content. Returns the transformed body
 * together with the text of every stripped comment, so the caller can warn
 * about comments that look like real content rather than tooling directives.
 */
const transformBody = (markdown, sourceRepoDir) => {
    // Matches an inline code span (group 1) OR a full markdown link whose label
    // may itself contain inline code, e.g. [`code`](url) (groups 2+3). Processing
    // left-to-right means code spans are consumed first, so link-like text inside
    // a code span is never mistaken for a real link target.
    const linkTokenPattern = /(`[^`]*`)|(\[(?:`[^`]*`|[^\]`])*\])\(([^)]+)\)/gu;
    const inlineCodePattern = /(`[^`]*`)/u;
    const strippedComments = [];
    let isInFence = false;
    let isInHtmlComment = false;
    let commentBuffer = '';

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
                    commentBuffer += `${rest}\n`;

                    return result;
                }

                commentBuffer += rest.slice(0, end);
                strippedComments.push(commentBuffer);
                commentBuffer = '';
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

    // Depth of open MDX component blocks (PascalCase elements such as <Callout>,
    // <Tabs>, <TypeTable>). Inside a component, JSX expression attributes like
    // `type={{ ... }}` and `items={[ ... ]}` must pass through verbatim; escaping
    // their braces as prose would corrupt the JSX. Counted on prose segments only
    // so tags inside `inline code` never affect the depth.
    let mdxDepth = 0;

    /** Count opening, closing, and self-closing PascalCase tags in a prose segment. */
    const countMdxTags = (segment) => ({
        opens: (segment.match(/<[A-Z][A-Za-z0-9]*/gu) ?? []).length,
        closes: (segment.match(/<\/[A-Z][A-Za-z0-9]*/gu) ?? []).length,
        selfCloses: (segment.match(/\/>/gu) ?? []).length,
    });

    const lines = markdown.split('\n').map((line) => {
        if (/^\s*```/u.test(line)) {
            isInFence = !isInFence;

            return line;
        }

        if (isInFence) {
            return line;
        }

        // Rewrite links on the full line first (before the code-span split) so
        // that labels containing inline code, e.g. [`code`](url), are matched
        // correctly. Code spans are consumed by the combined pattern and left
        // unchanged; only complete link targets are rewritten.
        const withLinks = stripComments(line).replace(linkTokenPattern, (match, codeSpan, label, target) =>
            codeSpan ? match : `${label}(${rewriteTarget(target, sourceRepoDir)})`,
        );

        // Split on inline code spans (odd indices) so MDX escaping applies
        // only to prose, leaving `code` spans such as `texture_2d<u32>` intact.
        const segments = withLinks.split(inlineCodePattern);

        let opens = 0;
        let closes = 0;
        let selfCloses = 0;

        for (let index = 0; index < segments.length; index += 1) {
            if (index % 2 === 0) {
                const counts = countMdxTags(segments[index]);
                opens += counts.opens;
                closes += counts.closes;
                selfCloses += counts.selfCloses;
            }
        }

        // A line is "inside MDX" when an enclosing block is still open or when the
        // line itself opens or closes a component. Such lines keep their braces and
        // angle brackets verbatim; only plain prose gets MDX-escaped.
        const isMdxLine = mdxDepth > 0 || opens > 0 || closes > 0;

        const rendered = segments
            .map((segment, index) => {
                if (index % 2 === 1) {
                    return segment;
                }

                return isMdxLine ? segment : escapeMdxText(segment);
            })
            .join('');

        mdxDepth = Math.max(0, mdxDepth + opens - closes - selfCloses);

        return rendered;
    });

    return { body: lines.join('\n'), comments: strippedComments };
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

/**
 * Match the "read this on blit386.dev" banner block (sentinels and all) that the
 * engine repo injects below each published doc's H1, plus the blank lines around
 * it. The banner is a GitHub-only signpost; the live site must never tell its
 * own readers to go to the site, so it is stripped before anything else runs.
 * Owned upstream by `blit386/scripts/sync-doc-banners.mjs`.
 */
const SITE_BANNER_REGION = /\n*<!-- blit386\.dev-banner:start -->[\s\S]*?<!-- blit386\.dev-banner:end -->\n*/u;

/** Remove the engine's GitHub-only site banner, leaving the body flush at its first real line. */
const stripSiteBanner = (markdown) => markdown.replace(SITE_BANNER_REGION, '\n').replace(/^\n+/u, '');

/** Build the MDX file contents for one page, plus any HTML comments stripped from it. */
const renderPage = ({ src, description }) => {
    const sourcePath = join(ENGINE_DOCS, src);
    const raw = readFileSync(sourcePath, 'utf8');
    const { title, body } = extractTitleAndBody(raw, src);
    const sourceRepoDir = posix.dirname(`docs/${src}`);
    const trimmedBody = dropDuplicateIntro(stripSiteBanner(body), description);
    const { body: rewritten, comments } = transformBody(trimmedBody, sourceRepoDir);
    const banner = [
        `# Generated from blit386/docs/${src} by scripts/sync-docs-from-engine.mjs.`,
        '# Do not edit by hand: edit the engine source, then run `pnpm run sync:docs`.',
    ].join('\n');
    const frontmatter = `---\n${banner}\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---`;

    return { contents: `${frontmatter}\n\n${rewritten.trimEnd()}\n`, comments };
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

/**
 * Comments that are lint/spell/format tooling directives, not prose. These are
 * meaningless in the mirror and expected to be dropped, so they are suppressed
 * from the stripped-comment warning.
 */
const TOOLING_DIRECTIVE_PATTERN =
    /^(?:cspell|prettier-ignore|prettier|markdownlint(?:-disable|-enable)?|eslint|stylelint|vale|noqa)\b/iu;

/** Whether a stripped comment is a tooling directive rather than real content. */
const isToolingDirective = (text) => TOOLING_DIRECTIVE_PATTERN.test(text.trim());

/** Collapse a (possibly multi-line) comment to a single trimmed, truncated line. */
const summarizeComment = (text) => {
    const collapsed = text.replace(/\s+/gu, ' ').trim();

    return collapsed.length > 120 ? `${collapsed.slice(0, 117)}...` : collapsed;
};

/**
 * Warn (console only) about HTML comments dropped from the mirror that look like
 * real content rather than tooling directives. HTML comments render nowhere -
 * not on GitHub, not on the site - so this is a maintainer heads-up, never a
 * user-facing marker, for the rare case where prose was hidden in a comment and
 * silently left out of blit386.dev. Recognized lint/spell directives are
 * suppressed so the warning only fires on comments worth a second look.
 */
const warnStrippedComments = (strippedComments) => {
    const meaningful = strippedComments.filter(({ text }) => !isToolingDirective(text));

    if (meaningful.length === 0) {
        return;
    }

    console.warn(`\nwarning: ${meaningful.length} HTML comment(s) stripped; they will not appear on blit386.dev:`);

    for (const { src, text } of meaningful) {
        console.warn(`  docs/${src}: ${summarizeComment(text)}`);
    }

    console.warn('If any held real content, move it into the page body; otherwise ignore this notice.');
};

const main = () => {
    const sections = groupBySection();
    const written = [];
    const strippedComments = [];

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
            const { contents, comments } = renderPage(page);
            writeFileSync(pagePath, contents);
            written.push(pagePath);

            for (const text of comments) {
                strippedComments.push({ src: page.src, text });
            }
        }
    }

    for (const file of written) {
        console.log(`generated ${relative(ROOT, file)}`);
    }

    console.log(`\n${written.length} file(s) generated from ${relative(ROOT, ENGINE_DOCS)}.`);

    warnStrippedComments(strippedComments);
};

export {
    splitFragment,
    rewriteTarget,
    escapeMdxText,
    transformBody,
    extractTitleAndBody,
    dropDuplicateIntro,
    stripSiteBanner,
    isToolingDirective,
    summarizeComment,
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
