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
 * Every page is labeled with the version it was written for (the lockstep kit version), because
 * kit content describes games pinned to a release while the rest of the site tracks the newest
 * engine.
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
const DESCRIPTION_MAX_LENGTH = 160;

// The demos published as examples. Not all of them: every page is prerendered into the Worker
// bundle at roughly 3.5x its source size after gzip, and all 48 demos took the Worker from 4.1 MB
// to 8.9 MB gzip against Cloudflare's 10 MiB limit (measured for BT-557). These cover what a first
// game needs - program structure, drawing, each input device, a complete game, sprites, animation,
// camera, tilemaps, sound, palette, and random - in DEMO_ORDER. Add one only after re-measuring
// with `wrangler deploy --dry-run`.
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

// The kit, engine, and scaffolder release in lockstep, so the kit's version is the engine version
// this content was written for. `bump:check` at the repo root keeps the three in step.
const readKitVersion = () => JSON.parse(readFileSync(join(PACKAGES, 'kit', 'package.json'), 'utf8')).version;

const versionLabel = (version) =>
    `> Written for blit386 ${version}. The rest of blit386.dev documents the newest engine, so an API you find there ` +
    `may be missing from a game pinned to ${version}.`;

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
            fields[currentKey] = keyMatch[2].trim();
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
const markdownPage = ({ sourcePath, version, description, title: titleOverride }) => {
    const { fields, body: withoutFrontmatter } = splitFrontmatter(readFileSync(sourcePath, 'utf8'));
    const { title, body } = extractTitleAndBody(withoutFrontmatter, sourcePath);
    const { body: transformed } = transformBody(body, relative(REPO_ROOT, dirname(sourcePath)));

    return {
        title: titleOverride ?? title,
        description: shorten(description ?? fields.description ?? firstParagraph(body)),
        sourcePath,
        body: `${versionLabel(version)}\n\n${transformed}`,
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
 * dependencies are pinned to the lockstep version. The scaffolder pins `blit386` through its own
 * `BLIT386_RANGE` constant, which `bump:check` keeps on the same release line.
 */
const starterPage = (version) => {
    const vars = {
        projectName: 'my-game',
        packageName: 'my-game',
        blit386Version: `^${version}`,
        kitVersion: `^${version}`,
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
            versionLabel(version),
            'This is the JavaScript project `npm create blit386@latest my-game` writes, minus the AI-assistant and ' +
                'formatter files. Put these four files in an empty folder, run `npm install`, then `npm run dev`. ' +
                'The game in `src/game.js` is a small, complete example: a paddle that catches falling blocks, with ' +
                'keyboard and pointer input, a palette, a score, and rectangle collision. Replace it with your own.',
            ...sections,
        ].join('\n\n'),
    };
};

const examplePage = (demo, version) => {
    const source = readFileSync(demo.sourcePath, 'utf8');
    const usesShared = source.includes("from './shared/");
    const notes = [
        `Live version: ${DEMOS_SITE}/${demo.slug}.`,
        ...(usesShared
            ? [
                  'Imports from `./shared/` are helpers for the demo site itself (themed panels, on-screen D-pad, ' +
                      'post-process fallbacks). They are not part of blit386 and are not on npm - leave them out of ' +
                      'your own game.',
              ]
            : []),
    ];

    return {
        title: `Example: ${demo.navLabel}`,
        description: shorten(demo.description),
        sourcePath: demo.sourcePath,
        body: [versionLabel(version), notes.join(' '), codeBlock('js', source, `${demo.slug}.js`)].join('\n\n'),
    };
};

const listMarkdown = (dir) =>
    readdirSync(dir)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => join(dir, name));

const linkList = (pages) => pages.map(({ url, title }) => `- [${title}](${url})`).join('\n');

const indexPage = ({ version, groups }) => ({
    title: 'Build a Game',
    description:
        'Start here to build a BLIT386 game from an empty folder: the starter template, AGENTS.md, kit guides, ' +
        'skills, and examples.',
    sourcePath: KIT_CONTENT,
    body: [
        versionLabel(version),
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
const buildPages = (version) => {
    const group = (folder, pages) =>
        pages.map(({ slug, page }) => ({
            file: join(folder, `${slug}.mdx`),
            url: `${SITE_BASE}/${folder}/${slug}`,
            page,
        }));

    const kitGuides = group(
        'kit-guides',
        listMarkdown(join(KIT_CONTENT, 'docs')).map((sourcePath) => ({
            slug: basename(sourcePath, '.md'),
            page: markdownPage({ sourcePath, version }),
        })),
    );

    const skills = group(
        'skills',
        readdirSync(join(KIT_CONTENT, 'skills'), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
            .map((slug) => ({
                slug,
                page: markdownPage({ sourcePath: join(KIT_CONTENT, 'skills', slug, 'SKILL.md'), version }),
            }))
            .map(({ slug, page }) => ({ slug, page: { ...page, title: `Skill: ${page.title}` } })),
    );

    const rules = group(
        'rules',
        listMarkdown(join(KIT_CONTENT, 'rules')).map((sourcePath) => ({
            slug: basename(sourcePath, '.md'),
            page: markdownPage({ sourcePath, version }),
        })),
    );

    const registry = buildRegistry(DEMOS_ROOT);
    const missing = [...FIRST_GAME_EXAMPLES].filter((slug) => !registry.some((demo) => demo.slug === slug));
    if (missing.length > 0) {
        throw new Error(`FIRST_GAME_EXAMPLES names demos that no longer exist: ${missing.join(', ')}.`);
    }
    const examples = group(
        'examples',
        registry
            .filter((demo) => FIRST_GAME_EXAMPLES.has(demo.slug))
            .map((demo) => ({ slug: demo.slug, page: examplePage(demo, version) })),
    );

    const agents = {
        file: 'agents.mdx',
        url: `${SITE_BASE}/agents`,
        page: markdownPage({
            sourcePath: join(KIT_CONTENT, 'AGENTS.md'),
            version,
            title: 'AGENTS.md',
            description: 'The instructions every scaffolded BLIT386 game gives its AI assistant: how a game is built.',
        }),
    };
    const starter = { file: 'starter-template.mdx', url: `${SITE_BASE}/starter-template`, page: starterPage(version) };

    const linked = (entries) => entries.map(({ url, page }) => ({ url, title: page.title }));
    const index = {
        file: 'index.mdx',
        url: SITE_BASE,
        page: indexPage({
            version,
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
                        'Complete, single-file programs from the demo site, each running live at demos.blit386.dev. ' +
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
    const version = readKitVersion();
    const { pages, metas } = buildPages(version);

    rmSync(OUT_DIR, { recursive: true, force: true });

    for (const { file, meta } of metas) {
        mkdirSync(dirname(join(OUT_DIR, file)), { recursive: true });
        writeFileSync(join(OUT_DIR, file), `${JSON.stringify(meta, null, 2)}\n`);
    }

    for (const { file, page } of pages) {
        mkdirSync(dirname(join(OUT_DIR, file)), { recursive: true });
        writeFileSync(join(OUT_DIR, file), renderMdx(page));
    }

    console.log(`${pages.length} page(s) generated in ${relative(ROOT, OUT_DIR)} for blit386 ${version}.`);
};

export { buildPages, fenceFor, fillPlaceholders, shorten, splitFrontmatter, versionLabel, SECTION };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
