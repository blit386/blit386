#!/usr/bin/env node
// @ts-nocheck
/**
 * Generate the public documentation mirror from the canonical engine docs.
 *
 * `packages/blit386` is the single source of truth for public API and guide
 * prose under `docs/`. This script reads the subset listed in that package's
 * sitemap manifest (`docs/_sitemap.json`) and writes the matching Fumadocs MDX
 * pages into `content/docs/`, applying frontmatter, dropping the source H1, and
 * rewriting links to site-relative or GitHub URLs.
 *
 * The manifest is the single source of truth for which docs publish, their site
 * URL, sidebar order, and subtitle. This script carries no per-page knowledge:
 * editing doc prose, adding a page, or reordering the sidebar is done entirely
 * in `packages/blit386` (`docs/_sitemap.json`), never here. See that file's
 * schema (`docs/_sitemap.schema.json`) for the contract.
 *
 * The generated files are committed artifacts: never hand-edit them. Edit the
 * canonical source in `packages/blit386/docs/` and re-run `pnpm run sync:docs`.
 * `pnpm run sync:docs:check` fails when the mirror drifts from the source and is
 * enforced in two places, last in both: `pnpm run preflight` here, and the
 * `quality-website` job of `.github/workflows/ci.yml`. Last, because it
 * regenerates `content/docs` in the working tree.
 *
 * Source location defaults to the sibling package path `../blit386/docs`;
 * `ENGINE_DOCS_DIR` overrides it (the tests point it at a fixture). It must stay
 * inside the monorepo, since GitHub links are built from its path there.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gitEnv } from '../../../scripts/lib/git-env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_DOCS = resolve(ROOT, process.env.ENGINE_DOCS_DIR ?? '../blit386/docs');
const ENGINE_REPO_ROOT = resolve(ENGINE_DOCS, '..');
const REPO_ROOT = resolve(ROOT, '..', '..');
// Where the engine docs sit in the monorepo (`packages/blit386/docs`), the base every link and
// GitHub URL resolves against. scripts/sync-kit-pages.mjs resolves kit content the same way.
const ENGINE_DOCS_REPO_DIR = relative(REPO_ROOT, ENGINE_DOCS).split(sep).join(posix.sep);
if (ENGINE_DOCS_REPO_DIR.startsWith('..')) {
    throw new Error(`ENGINE_DOCS_DIR ${ENGINE_DOCS} is outside the monorepo, so its GitHub links cannot resolve.`);
}
const CONTENT_DOCS = join(ROOT, 'content', 'docs');
const GITHUB_BASE = 'https://github.com/blit386/blit386';
const SITEMAP_FILE = join(ENGINE_DOCS, '_sitemap.json');
const API_HISTORY_SRC = join(ENGINE_DOCS, '_api-history.json');
/** The API history copy, package-relative; `check-docs-sync.mjs` diffs it alongside `content/docs`. */
const API_HISTORY_MIRROR = 'src/data/api-history.generated.json';
const API_HISTORY_DEST = join(ROOT, API_HISTORY_MIRROR);

/**
 * Load and validate the sitemap manifest from `packages/blit386`. Presence in
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
 * Canonical engine doc (monorepo-relative path) to published site path, derived from
 * the manifest. Drives link rewriting: a link resolving to one of these keys
 * upgrades to a site-relative `/docs/...` URL; everything else falls back to
 * GitHub. Only published docs appear here, so there is no dead-route risk.
 */
const SITE_PATHS = Object.fromEntries(
    PAGES.map((page) => [`${ENGINE_DOCS_REPO_DIR}/${page.src}`, `/docs/${page.path}`]),
);

/** Resolve the published site path for a source file, or throw if unmapped. */
const sitePathFor = (src) => {
    const sitePath = SITE_PATHS[`${ENGINE_DOCS_REPO_DIR}/${src}`];

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
 *   source files) becomes an absolute GitHub URL resolved against the monorepo root,
 *   so `sourceRepoDir` must be monorepo-relative (`packages/blit386/docs/api`).
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
 * The PascalCase MDX components the site registers: Fumadocs' `defaultMdxComponents` plus
 * the ones `getMdxComponents` in `press.config.tsx` adds. Manual-sync copy (that file cannot
 * be imported from a build script); the sync-docs-from-engine test fails when they disagree.
 * Any other `<Name` in prose, such as `Array<T>`, is text, not a component.
 */
const MDX_COMPONENTS = new Set([
    ...['Callout', 'CalloutContainer', 'CalloutDescription', 'CalloutTitle', 'Card', 'Cards'],
    ...['CodeBlockTab', 'CodeBlockTabs', 'CodeBlockTabsList', 'CodeBlockTabsTrigger'],
    ...['Accordion', 'Accordions', 'File', 'Files', 'Folder', 'InlineTOC', 'Step', 'Steps', 'Tab', 'Tabs'],
    ...['TypeTable', 'Popup', 'PopupContent', 'PopupTrigger', 'AuthorByline', 'CommunityConnect'],
    ...['DemoEmbed', 'DemoShowcase', 'VideoEmbed', 'HomeHero', 'ApiAvailability', 'PageChangelog', 'Since'],
]);
const MDX_NAME = `(?:${[...MDX_COMPONENTS].join('|')})(?![\\w])`;
const MDX_OPEN_PATTERN = new RegExp(`<${MDX_NAME}`, 'gu');
const MDX_CLOSE_PATTERN = new RegExp(`</${MDX_NAME}`, 'gu');
/** A `<` that starts no registered component tag; it is text to MDX-escape. */
const NON_MDX_ANGLE_PATTERN = new RegExp(`<(?!/?${MDX_NAME})`, 'gu');
/** A whole registered tag on one line (open, close, or self-closing) with no `<` or `>` in its props. */
const MDX_WHOLE_TAG_PATTERN = new RegExp(`(</?${MDX_NAME}[^<>]*>)`, 'gu');
/** A self-closing tag that is not a registered component (`<br/>`), so its `/>` closes nothing. */
const NON_MDX_SELF_CLOSE_PATTERN = new RegExp(`<(?!${MDX_NAME})[A-Za-z][^<>]*/>`, 'gu');

/**
 * Escape characters that MDX would otherwise parse as JSX or expressions. A
 * bare `<` (e.g. `<50`, `Array<T>`) or `{` in prose must render literally, but
 * registered MDX component tags (`<Callout>`, `</Callout>`) are intentional and
 * must pass through unchanged. Applied only to text outside inline code and fenced blocks.
 */
const escapeMdxText = (text) =>
    text.replace(NON_MDX_ANGLE_PATTERN, '&lt;').replaceAll('{', '&#123;').replaceAll('}', '&#125;');

/** A fence line: up to any indent, a run of 3+ backticks or tildes (group 1), then the rest (group 2). */
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})(.*)$/u;

/**
 * Transform body lines outside fenced code blocks: strip HTML comments (MDX
 * does not support them, and source comments such as cspell directives are
 * meaningless in the mirror), rewrite Markdown links, and escape MDX-hostile
 * characters in prose. Fenced blocks and inline code spans are left untouched
 * so example snippets keep their literal content. Returns the transformed body
 * together with the text of every stripped comment, so the caller can warn
 * about comments that look like real content rather than tooling directives.
 */
const transformBody = (markdown, sourceRepoDir, source = sourceRepoDir) => {
    // Matches an inline code span (group 1) OR a full markdown link whose label
    // may itself contain inline code, e.g. [`code`](url) (groups 2+3), with an
    // optional title in any CommonMark form, "t", 't', or (t) (group 4). The
    // target may hold one level of balanced parentheses. Processing
    // left-to-right means code spans are consumed first,
    // so link-like text inside a code span is never mistaken for a real link target.
    const linkTokenPattern =
        /(`[^`]*`)|(\[(?:`[^`]*`|[^\]`])*\])\(\s*((?:[^()\s]|\([^()\s]*\))+)(\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/gu;
    const inlineCodePattern = /(`[^`]*`)/u;
    const strippedComments = [];
    // The opening run of the fence we are inside (e.g. "```" or "~~~~"), or '' outside one.
    let openFence = '';
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

    // Depth of open MDX component blocks (registered components such as <Callout>,
    // <Tabs>, <TypeTable>). Inside a component, JSX expression attributes like
    // `type={{ ... }}` and `items={[ ... ]}` must pass through verbatim; escaping
    // their braces as prose would corrupt the JSX. Counted on prose segments only
    // so tags inside `inline code` never affect the depth.
    let mdxDepth = 0;

    /** Count opening, closing, and self-closing registered component tags in a prose segment. */
    const countMdxTags = (segment) => ({
        opens: (segment.match(MDX_OPEN_PATTERN) ?? []).length,
        closes: (segment.match(MDX_CLOSE_PATTERN) ?? []).length,
        selfCloses: (segment.replace(NON_MDX_SELF_CLOSE_PATTERN, '').match(/\/>/gu) ?? []).length,
    });

    const lines = markdown.split('\n').map((line) => {
        // CommonMark: a fence is 3+ backticks or tildes; only a run of the same character,
        // at least as long and with nothing after it, closes it.
        const run = FENCE_PATTERN.exec(line);

        if (openFence !== '') {
            const isClose = run && run[1][0] === openFence[0] && run[1].length >= openFence.length && !run[2].trim();
            openFence = isClose ? '' : openFence;

            return line;
        }

        // A backtick fence's info string cannot itself contain a backtick (that line is inline code).
        if (run && !(run[1][0] === '`' && run[2].includes('`'))) {
            openFence = run[1];

            return line;
        }

        // Rewrite links on the full line first (before the code-span split) so
        // that labels containing inline code, e.g. [`code`](url), are matched
        // correctly. Code spans are consumed by the combined pattern and left
        // unchanged; only complete link targets are rewritten.
        const withLinks = stripComments(line).replace(linkTokenPattern, (match, codeSpan, label, target, title) =>
            codeSpan ? match : `${label}(${rewriteTarget(target, sourceRepoDir)}${title ?? ''})`,
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

        // Exception: a line that starts outside any component and whose every tag is whole on
        // this line (`Text {x} <Since symbol="A" />`) escapes the text outside its components.
        const wholeTags = segments
            .filter((_segment, index) => index % 2 === 0)
            .reduce((count, segment) => count + (segment.match(MDX_WHOLE_TAG_PATTERN) ?? []).length, 0);
        const canSplitTags = mdxDepth === 0 && isMdxLine && wholeTags === opens + closes;
        let lineDepth = 0;
        /** Escape the pieces of a prose segment that sit outside every component on this line. */
        const escapeOutsideTags = (segment) =>
            segment
                .split(MDX_WHOLE_TAG_PATTERN)
                .map((piece, index) => {
                    if (index % 2 === 0) {
                        return lineDepth > 0 ? piece : escapeMdxText(piece);
                    }

                    lineDepth += piece.startsWith('</') ? -1 : piece.endsWith('/>') ? 0 : 1;

                    return piece;
                })
                .join('');

        const rendered = segments
            .map((segment, index) => {
                if (index % 2 === 1) {
                    return segment;
                }

                if (canSplitTags) {
                    return escapeOutsideTags(segment);
                }

                return isMdxLine ? segment : escapeMdxText(segment);
            })
            .join('');

        mdxDepth += opens - closes - selfCloses;

        return rendered;
    });

    // A miscounted tag silently switches escaping off (or on) for the rest of the page, so fail here.
    if (mdxDepth !== 0) {
        throw new Error(
            `Unbalanced MDX component tags in ${source}: depth ${mdxDepth} at end of document, expected 0. ` +
                'Look for a missing close tag or a component not registered in press.config.tsx.',
        );
    }

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
 * Match the "read this on blit386.dev" banner block (sentinels and all) that
 * `packages/blit386` injects below each published doc's H1, plus the blank lines around
 * it. The banner is a GitHub-only signpost; the live site must never tell its
 * own readers to go to the site, so it is stripped before anything else runs.
 * Owned upstream by `blit386/scripts/sync-doc-banners.mjs`. Manual-sync hazard: a copy of
 * that file's `BANNER_REGION` (not exported), global so a doc with two banners loses both.
 */
const SITE_BANNER_REGION = /\n*<!-- blit386\.dev-banner:start -->[\s\S]*?<!-- blit386\.dev-banner:end -->\n*/gu;

/** Replace every match of a sentinel region with one paragraph break, leaving the body flush. */
const stripRegion = (pattern) => (markdown) => markdown.replace(pattern, '\n\n').replace(/^\n+/u, '');

/** Remove the engine's GitHub-only site banner, leaving the body flush at its first real line. */
const stripSiteBanner = stripRegion(SITE_BANNER_REGION);

/**
 * Match a "this file is generated, do not hand-edit" notice block (sentinels and all), the way a
 * generated engine doc (for example `packages/blit386/docs/reference-deprecations.md`, generated by
 * `packages/blit386/scripts/gen-deprecations.mjs`) tells a GitHub reader not to hand-edit the raw
 * source. That notice is GitHub-only signpost, same rationale as {@link SITE_BANNER_REGION}: this
 * mirror page already carries its own "generated, do not edit" frontmatter comment (see `banner` in
 * `renderPage`), so the engine doc's version would be redundant, unstripped, visible body content
 * here instead of a comment.
 */
const GENERATED_NOTE_REGION = /\n*<!-- generated:start -->[\s\S]*?<!-- generated:end -->\n*/gu;

/** Remove the engine's GitHub-only "generated, do not edit" notice, leaving the body flush. */
const stripGeneratedNote = stripRegion(GENERATED_NOTE_REGION);

/**
 * Look up the last commit date (ISO 8601, author date) that touched a source doc in
 * the engine repo. Returns `undefined` when git is unavailable, the repo has no
 * history for the path (e.g. a shallow clone), or the call otherwise fails, so a CI
 * environment without full git history still produces a valid page: the field is
 * omitted rather than written as an empty or error value.
 *
 * `--follow` walks back through renames, so a doc's real edit history survives the
 * move that put the engine under `packages/blit386/`. `--diff-filter=AM` is what makes
 * that reachable: without it `-1` stops at the move commit itself, which is genuinely
 * the most recent commit touching every path, and every page reports the merge date.
 * Selecting additions and modifications skips the rename (`R`) the move recorded.
 *
 * `AM`, not `M`. A doc added and never edited since (`docs/reference-authors.md`) has
 * no `M` commit at all, so `M` alone returns an empty string and `renderPage` silently
 * drops the frontmatter field rather than failing loudly. `A` is the fallback that
 * gives those pages their creation date.
 *
 * `packages/blit386/scripts/gen-api-history.mjs` uses `--follow` for the same reason.
 */
const getLastModified = (src, engineRepoRoot = ENGINE_REPO_ROOT) => {
    try {
        const output = execFileSync(
            'git',
            ['-C', engineRepoRoot, 'log', '-1', '--follow', '--diff-filter=AM', '--format=%aI', '--', `docs/${src}`],
            {
                encoding: 'utf8',
                env: gitEnv(),
                stdio: ['ignore', 'pipe', 'ignore'],
            },
        ).trim();

        // Newer git (2.54+) prints a UTC %aI date with a `Z` suffix, older git with `+00:00`. The
        // committed mirror would otherwise flip between the two with whoever last ran the sync, and
        // `sync:docs:check` would fail on the other machine, so settle on the `+00:00` form.
        return output === '' ? undefined : output.replace(/Z$/u, '+00:00');
    } catch {
        return undefined;
    }
};

/**
 * Build the MDX file contents for one page, plus any HTML comments stripped from it.
 * `lastModifiedFor` defaults to the real git-backed `getLastModified` and is injectable
 * so tests can assert on frontmatter shape without depending on git or a real repo.
 */
const renderPage = ({ src, description }, { lastModifiedFor = getLastModified } = {}) => {
    const sourcePath = join(ENGINE_DOCS, src);
    const raw = readFileSync(sourcePath, 'utf8');
    const { title, body } = extractTitleAndBody(raw, src);
    const sourceRepoDir = posix.dirname(`${ENGINE_DOCS_REPO_DIR}/${src}`);
    const trimmedBody = dropDuplicateIntro(stripGeneratedNote(stripSiteBanner(body)), description);
    const { body: rewritten, comments } = transformBody(trimmedBody, sourceRepoDir, `${ENGINE_DOCS_REPO_DIR}/${src}`);
    const banner = [
        `# Generated from ${ENGINE_DOCS_REPO_DIR}/${src} by scripts/sync-docs-from-engine.mjs.`,
        '# Do not edit by hand: edit the engine source, then run `pnpm run sync:docs`.',
    ].join('\n');
    const lastModified = lastModifiedFor(src);
    const frontmatterFields = [
        `title: ${JSON.stringify(title)}`,
        `description: ${JSON.stringify(description)}`,
        ...(lastModified === undefined ? [] : [`lastModified: ${JSON.stringify(lastModified)}`]),
    ];
    const frontmatter = `---\n${banner}\n${frontmatterFields.join('\n')}\n---`;

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

    // Mirror the engine's JSDoc-driven API version history alongside the docs it
    // annotates. `src/data/api-history.ts` (a typed loader) reads this file at
    // build time; it is a generated artifact like the MDX pages above.
    writeFileSync(API_HISTORY_DEST, readFileSync(API_HISTORY_SRC, 'utf8'));
    written.push(API_HISTORY_DEST);

    for (const [section, entries] of sections) {
        const sectionDir = join(CONTENT_DOCS, section);
        mkdirSync(sectionDir, { recursive: true });

        const meta = { title: SECTION_TITLES[section], pages: entries.map(({ topic }) => topic) };
        const metaPath = join(sectionDir, 'meta.json');
        writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
        written.push(metaPath);

        for (const { topic, page } of entries) {
            const pagePath = join(sectionDir, `${topic}.mdx`);
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
    stripGeneratedNote,
    isToolingDirective,
    summarizeComment,
    getLastModified,
    renderPage,
    PAGES,
    API_HISTORY_MIRROR,
    MDX_COMPONENTS,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
