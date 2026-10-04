#!/usr/bin/env node
// @ts-nocheck
/**
 * Generate the "Build a Game" docs section from the kit, the scaffolder templates, and the demos.
 *
 * Someone with no scaffolded project - an assistant in a chat with only the blit386-docs MCP
 * connector, say - has no `AGENTS.md`, no skills, and no starter game on disk. This script
 * publishes that material as ordinary docs pages under `content/docs/build-a-game/`, so
 * `search_docs` finds it, `get_doc_page` reads it, and the generated `llms.txt` lists it. No
 * per-file lists live here: every set is a directory read, so a new skill, kit guide, rule, or
 * demo publishes on the next sync.
 *
 * Every page is labeled with the version it was written for, because kit content describes games
 * pinned to a release while the rest of the site tracks the newest engine. Between releases, kit
 * content on main already teaches the next release's API, so the label names that unreleased
 * release (from the engine changelog) while the starter project still pins the published one.
 *
 * The output is a committed, generated artifact, like the engine mirror: `pnpm run sync:docs`
 * runs this after `sync-docs-from-engine.mjs`, and `pnpm run sync:docs:check` fails when it
 * drifts. This script owns `content/docs/build-a-game/` outright and deletes it before writing.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRegistry } from '../../demos/plugins/demo-registry.js';
import { extractTitleAndBody, transformBody } from './sync-docs-from-engine.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = resolve(ROOT, '..');
const REPO_ROOT = resolve(PACKAGES, '..');
const KIT_CONTENT = join(PACKAGES, 'kit', 'content');
const TEMPLATES = join(PACKAGES, 'create-blit386', 'templates');
const DEMOS_ROOT = join(PACKAGES, 'demos');
// Manual-sync hazard: KIT_PAGES_PREFIX in press.config.tsx repeats this section name.
const SECTION = 'build-a-game';
const OUT_DIR = join(ROOT, 'content', 'docs', SECTION);
const SITE_BASE = `/docs/${SECTION}`;
const DEMOS_SITE = 'https://demos.blit386.dev';
const DEMOS_SHARED_SOURCE = 'https://github.com/blit386/blit386/tree/main/packages/demos/src/shared';
const DESCRIPTION_MAX_LENGTH = 160;

// The demos published as examples. Not all of them: every page is prerendered into the Worker
// bundle at roughly 3.5x its source size after gzip, and all 48 demos took the Worker from 4.1 MB
// to 8.9 MB gzip against Cloudflare's 10 MiB limit (measured for BT-557). These cover what a first
// game needs - program structure, drawing, each input device, a complete game, sprites, animation,
// camera, tilemaps, sound, palette, and random - in DEMO_ORDER. After adding one, `pnpm run build`
// and `pnpm run check:deploy-size` must still pass.
const FIRST_GAME_EXAMPLES = new Set([
    'hello-world',
    'basics',
    'primitives',
    'keyboard-input',
    'pointer-basics',
    'gamepad-input',
    'snake-game',
    'sprites',
    'animation',
    'camera',
    'tilemap',
    'palette-cycling',
    'audio-basics',
    'synth-toy',
    'random-basics',
]);

// The engine changelog's heading for work not yet released, `## X.Y.Z - Unreleased` - the
// convention the /release skill documents and renames to a dated heading at release time.
const UNRELEASED_HEADING = /^## (\d+\.\d+\.\d+) - Unreleased$/mu;

/**
 * The versions kit content is written against. `published` is the lockstep release on npm (the
 * kit, engine, and scaffolder release together; `bump:check` keeps them in step) and is what the
 * starter project pins. `unreleased` is the next release when the engine changelog has an
 * Unreleased section, because kit content on main already describes that version's API.
 */
const readRelease = () => ({
    published: JSON.parse(readFileSync(join(PACKAGES, 'kit', 'package.json'), 'utf8')).version,
    unreleased: UNRELEASED_HEADING.exec(readFileSync(join(PACKAGES, 'blit386', 'docs', 'changelog.md'), 'utf8'))?.[1],
});

const versionLabel = ({ published, unreleased }) =>
    unreleased === undefined
        ? `> Written for blit386 ${published}. The rest of blit386.dev documents the newest engine, so an API you ` +
          `find there may be missing from a game pinned to ${published}.`
        : `> Written for blit386 ${unreleased}, which is not on npm yet. The newest release is ${published}, so ` +
          `an API on this page may be missing from the version npm installs until ${unreleased} ships.`;

/** Quote a frontmatter scalar. JSON strings are valid YAML double-quoted scalars. */
const yamlString = (value) => JSON.stringify(value);

const renderMdx = ({ title, description, sourcePath, body }) => {
    const banner = [
        `# Generated from ${relative(REPO_ROOT, sourcePath)} by scripts/sync-kit-pages.mjs.`,
        '# Do not edit by hand: edit the source, then run `pnpm run sync:docs`.',
    ].join('\n');

    return `---\n${banner}\ntitle: ${yamlString(title)}\ndescription: ${yamlString(description)}\n---\n\n${body.trimEnd()}\n`;
};

/** Shorten prose to a meta description, cutting at a word boundary. */
const shorten = (text) => {
    const collapsed = text.replace(/\s+/gu, ' ').trim();

    if (collapsed.length <= DESCRIPTION_MAX_LENGTH) {
        return collapsed;
    }

    const cut = collapsed.slice(0, DESCRIPTION_MAX_LENGTH - 3);
    return `${cut.slice(0, cut.lastIndexOf(' '))}...`;
};

/** The first prose paragraph of a markdown body: not a heading, list, quote, fence, table, or comment. */
const firstParagraph = (markdown) =>
    markdown
        .split(/\n\s*\n/u)
        .map((block) => block.trim())
        .find((block) => block !== '' && !/^(#|-|\*|>|```|\||<!--|\d+\.)/u.test(block)) ?? '';

const BLOCK_SCALAR_INDICATOR = /^[>|][+-]?$/u;

/**
 * Split leading YAML frontmatter into its top-level scalar fields and the body. Handles the two
 * shapes kit content uses: `key: value` on one line, and a bare `key:` followed by indented
 * continuation lines (folded into one line). Anything fancier is not used in kit content.
 */
const splitFrontmatter = (markdown) => {
    const match = /^---\n([\s\S]*?)\n---\n?/u.exec(markdown);

    if (!match) {
        return { fields: {}, body: markdown };
    }

    const fields = {};
    let currentKey;

    for (const line of match[1].split('\n')) {
        const keyMatch = /^([A-Za-z][\w-]*):\s*(.*)$/u.exec(line);

        if (keyMatch) {
            currentKey = keyMatch[1];
            // A lone block-scalar indicator (`>-`, `|`, ...) only says how the lines below fold.
            fields[currentKey] = keyMatch[2].trim().replace(BLOCK_SCALAR_INDICATOR, '');
        } else if (currentKey && /^\s+\S/u.test(line)) {
            fields[currentKey] = `${fields[currentKey]} ${line.trim()}`.trim();
        }
    }

    return { fields, body: markdown.slice(match[0].length) };
};

/** A fence long enough that no backtick run inside `source` can close it. */
const fenceFor = (source) => {
    const longestRun = Math.max(0, ...(source.match(/`+/gu) ?? []).map((run) => run.length));
    return '`'.repeat(Math.max(3, longestRun + 1));
};

const codeBlock = (lang, source, title) => {
    const fence = fenceFor(source);
    const meta = title === undefined ? '' : ` title=${yamlString(title)}`;
    return `${fence}${lang}${meta}\n${source.trimEnd()}\n${fence}`;
};

/** Render a kit markdown file (H1 title) into a page body, escaped for MDX. */
// The package-manager commands the scaffolder fills into kit content per game (`TemplateVars` in
// packages/create-blit386/src/scaffold.ts). These pages target no particular game, so they use npm,
// matching the starter page's instructions. A placeholder outside this set fails the sync.
const PACKAGE_MANAGER_VARS = {
    pmInstall: 'npm install',
    pmRunDev: 'npm run dev',
    pmRunBuild: 'npm run build',
    pmRunFormat: 'npm run format',
    pmRunLint: 'npm run lint',
};

const markdownPage = ({ sourcePath, release, description, title: titleOverride }) => {
    const source = fillPlaceholders(
        readFileSync(sourcePath, 'utf8'),
        PACKAGE_MANAGER_VARS,
        relative(REPO_ROOT, sourcePath),
    );
    const { fields, body: withoutFrontmatter } = splitFrontmatter(source);
    const { title, body } = extractTitleAndBody(withoutFrontmatter, sourcePath);
    const { body: transformed } = transformBody(body, relative(REPO_ROOT, dirname(sourcePath)));

    return {
        title: titleOverride ?? title,
        description: shorten(description ?? fields.description ?? firstParagraph(body)),
        sourcePath,
        body: `${versionLabel(release)}\n\n${transformed}`,
    };
};

/** Fill `{{name}}` placeholders, failing on any name `vars` does not define. */
const fillPlaceholders = (text, vars, source) =>
    text.replace(/\{\{(\w+)\}\}/gu, (_match, name) => {
        if (!(name in vars)) {
            throw new Error(`Template ${source} uses {{${name}}}, which sync-kit-pages.mjs does not define.`);
        }

        return vars[name];
    });

/**
 * The JavaScript starter project, as `npm create blit386@latest my-game` would write it. Both
 * dependencies are pinned to the published lockstep version. The scaffolder pins `blit386` through its own
 * `BLIT386_RANGE` constant, which `bump:check` keeps on the same release line.
 */
const starterPage = (release) => {
    const vars = {
        projectName: 'my-game',
        packageName: 'my-game',
        blit386Version: `^${release.published}`,
        kitVersion: `^${release.published}`,
        packageManager: '',
        entryFile: '/src/game.js',
    };
    const files = [
        ['package.json', join(TEMPLATES, 'js', 'package.json.tmpl'), 'json'],
        ['index.html', join(TEMPLATES, 'base', 'index.html'), 'html'],
        ['vite.config.js', join(TEMPLATES, 'base', 'vite.config.js'), 'js'],
        ['src/game.js', join(TEMPLATES, 'js', 'src', 'game.js'), 'js'],
    ];
    const sections = files.map(([name, source, lang]) => {
        let text = fillPlaceholders(readFileSync(source, 'utf8'), vars, relative(REPO_ROOT, source));

        // Same as scaffold.ts: with no package manager chosen, drop the empty field.
        if (name === 'package.json') {
            text = text.replace(/^[ \t]*"packageManager": "",\r?\n/mu, '');
        }

        return `## ${name}\n\n${codeBlock(lang, text, name)}`;
    });

    return {
        title: 'Starter Template',
        description: 'The four files of a new BLIT386 game - package.json, index.html, vite.config.js, src/game.js.',
        sourcePath: join(TEMPLATES, 'js'),
        body: [
            versionLabel(release),
            'This is the JavaScript project `npm create blit386@latest my-game` writes, minus the AI-assistant and ' +
                'formatter files. Put these four files in an empty folder, run `npm install`, then `npm run dev`. ' +
                'The game in `src/game.js` is a small, complete example: a paddle that catches falling blocks, with ' +
                'keyboard and pointer input, a palette, a score, and rectangle collision. Replace it with your own.',
            ...sections,
        ].join('\n\n'),
    };
};

const examplePage = (demo, release) => {
    const source = readFileSync(demo.sourcePath, 'utf8');
    const usesShared = source.includes("from './shared/");
    const notes = [
        `Live version: ${DEMOS_SITE}/${demo.slug}.`,
        ...(usesShared
            ? [
                  'This is the demo-site source, not a standalone file: it imports and calls helpers from ' +
                      '`./shared/` (themed panels, on-screen D-pad, post-process fallbacks), which are not part of ' +
                      `blit386 and are not on npm. To run it as is, keep those files from ${DEMOS_SHARED_SOURCE} ` +
                      'at the same relative path. To adapt it, remove or replace the helper imports and every call ' +
                      'to them.',
              ]
            : []),
    ];

    return {
        title: `Example: ${demo.navLabel}`,
        description: shorten(demo.description),
        sourcePath: demo.sourcePath,
        body: [versionLabel(release), notes.join(' '), codeBlock('js', source, `${demo.slug}.js`)].join('\n\n'),
    };
};

const listMarkdown = (dir) =>
    readdirSync(dir)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => join(dir, name));

const linkList = (pages) => pages.map(({ url, title }) => `- [${title}](${url})`).join('\n');

const indexPage = ({ release, groups }) => ({
    title: 'Build a Game',
    description:
        'Start here to build a BLIT386 game from an empty folder: the starter template, AGENTS.md, kit guides, ' +
        'skills, and examples.',
    sourcePath: KIT_CONTENT,
    body: [
        versionLabel(release),
        'Everything needed to write a BLIT386 game from scratch, with no project on disk yet. Every page here can be ' +
            'read through the blit386-docs MCP server: find it with `search_docs`, read it with `get_doc_page`.',
        '## Quickest start',
        '`npm create blit386@latest my-game` creates the whole project, with these same guides, skills, and rules ' +
            'already on disk.',
        '## Without the scaffolder',
        [
            `1. Write the four files on the [Starter Template](${SITE_BASE}/starter-template) page into an empty folder.`,
            '2. Run `npm install`, then `npm run dev`.',
            `3. Read [AGENTS.md](${SITE_BASE}/agents) - the rules every BLIT386 game follows.`,
            '4. Replace the starter game in `src/game.js` with your own, using the skills below for each feature.',
        ].join('\n'),
        ...groups.flatMap(({ heading, intro, pages }) => [`## ${heading}`, ...(intro ? [intro] : []), linkList(pages)]),
    ].join('\n\n'),
});

/** Build every page as `{ file, url, page }`, grouped for the index and the sidebar. */
const buildPages = (release) => {
    const group = (folder, pages) =>
        pages.map(({ slug, page }) => ({
            file: join(folder, `${slug}.mdx`),
            url: `${SITE_BASE}/${folder}/${slug}`,
            page,
        }));

    const markdownGroup = (folder, dir) =>
        group(
            folder,
            listMarkdown(dir).map((sourcePath) => ({
                slug: basename(sourcePath, '.md'),
                page: markdownPage({ sourcePath, release }),
            })),
        );

    const kitGuides = markdownGroup('kit-guides', join(KIT_CONTENT, 'docs'));

    const skills = group(
        'skills',
        readdirSync(join(KIT_CONTENT, 'skills'), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
            .map((slug) => {
                const page = markdownPage({ sourcePath: join(KIT_CONTENT, 'skills', slug, 'SKILL.md'), release });
                return { slug, page: { ...page, title: `Skill: ${page.title}` } };
            }),
    );

    const rules = markdownGroup('rules', join(KIT_CONTENT, 'rules'));

    const registry = buildRegistry(DEMOS_ROOT);
    const missing = [...FIRST_GAME_EXAMPLES].filter((slug) => !registry.some((demo) => demo.slug === slug));
    if (missing.length > 0) {
        throw new Error(`FIRST_GAME_EXAMPLES names demos that no longer exist: ${missing.join(', ')}.`);
    }
    const examples = group(
        'examples',
        registry
            .filter((demo) => FIRST_GAME_EXAMPLES.has(demo.slug))
            .map((demo) => ({ slug: demo.slug, page: examplePage(demo, release) })),
    );

    const agents = {
        file: 'agents.mdx',
        url: `${SITE_BASE}/agents`,
        page: markdownPage({
            sourcePath: join(KIT_CONTENT, 'AGENTS.md'),
            release,
            title: 'AGENTS.md',
            description: 'The instructions every scaffolded BLIT386 game gives its AI assistant: how a game is built.',
        }),
    };
    const starter = { file: 'starter-template.mdx', url: `${SITE_BASE}/starter-template`, page: starterPage(release) };

    const linked = (entries) => entries.map(({ url, page }) => ({ url, title: page.title }));
    const index = {
        file: 'index.mdx',
        url: SITE_BASE,
        page: indexPage({
            release,
            groups: [
                {
                    heading: 'Kit guides',
                    intro: 'In a scaffolded game these are the files in `docs/`.',
                    pages: linked(kitGuides),
                },
                {
                    heading: 'Skills',
                    intro: 'One task each. In a scaffolded game they live in `.claude/skills/`.',
                    pages: linked(skills),
                },
                { heading: 'Rules', pages: linked(rules) },
                {
                    heading: 'Examples',
                    intro:
                        'Programs from the demo site, each running live at demos.blit386.dev. Most call demo-site ' +
                        'helpers from `./shared/` and are not standalone; each page says what it needs. ' +
                        `The full set of demos is at ${DEMOS_SITE}.`,
                    pages: linked(examples),
                },
            ],
        }),
    };

    const metas = [
        {
            file: 'meta.json',
            meta: {
                title: 'Build a Game',
                pages: ['starter-template', 'agents', 'kit-guides', 'skills', 'rules', 'examples'],
            },
        },
        ...[
            ['kit-guides', 'Kit Guides', kitGuides],
            ['skills', 'Skills', skills],
            ['rules', 'Rules', rules],
            ['examples', 'Examples', examples],
        ].map(([folder, title, entries]) => ({
            file: join(folder, 'meta.json'),
            meta: { title, pages: entries.map(({ file }) => basename(file, '.mdx')) },
        })),
    ];

    return { pages: [index, starter, agents, ...kitGuides, ...skills, ...rules, ...examples], metas };
};

const main = () => {
    const release = readRelease();
    const { pages, metas } = buildPages(release);

    rmSync(OUT_DIR, { recursive: true, force: true });

    for (const { file, meta } of metas) {
        mkdirSync(dirname(join(OUT_DIR, file)), { recursive: true });
        writeFileSync(join(OUT_DIR, file), `${JSON.stringify(meta, null, 2)}\n`);
    }

    for (const { file, page } of pages) {
        mkdirSync(dirname(join(OUT_DIR, file)), { recursive: true });
        writeFileSync(join(OUT_DIR, file), renderMdx(page));
    }

    console.log(
        `${pages.length} page(s) generated in ${relative(ROOT, OUT_DIR)} for blit386 ${release.unreleased ?? release.published}.`,
    );
};

export { buildPages, fenceFor, fillPlaceholders, readRelease, shorten, splitFrontmatter, versionLabel, SECTION };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
