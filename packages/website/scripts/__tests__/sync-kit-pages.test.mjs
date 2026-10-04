import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildPages,
    fenceFor,
    fillPlaceholders,
    readRelease,
    SECTION,
    shorten,
    splitFrontmatter,
    versionLabel,
} from '../sync-kit-pages.mjs';

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RELEASE = readRelease();

describe('splitFrontmatter', () => {
    test('folds an indented multi-line value into one line', () => {
        const { fields, body } = splitFrontmatter('---\nname: x\ndescription:\n  one\n  two\n---\n# Title\n');

        assert.deepEqual(fields, { name: 'x', description: 'one two' });
        assert.equal(body, '# Title\n');
    });

    test('returns the whole text as body when there is no frontmatter', () => {
        assert.deepEqual(splitFrontmatter('# Title\n'), { fields: {}, body: '# Title\n' });
    });
});

describe('fenceFor', () => {
    test('uses three backticks for code without a backtick run of three', () => {
        assert.equal(fenceFor('const s = `a`;'), '```');
    });

    test('outgrows the longest backtick run so the code cannot close the fence', () => {
        assert.equal(fenceFor('// ```js\n// ````'), '`````');
    });
});

describe('fillPlaceholders', () => {
    test('fills every known placeholder', () => {
        assert.equal(fillPlaceholders('{{a}}-{{b}}', { a: '1', b: '2' }, 't'), '1-2');
    });

    test('throws on a placeholder the script does not define, naming it', () => {
        assert.throws(() => fillPlaceholders('{{nope}}', {}, 'tpl'), /tpl uses \{\{nope\}\}/u);
    });
});

describe('shorten', () => {
    test('keeps short text and collapses whitespace', () => {
        assert.equal(shorten('a\n  b'), 'a b');
    });

    test('cuts long text at a word boundary within 160 characters', () => {
        const out = shorten('word '.repeat(60));

        assert.ok(out.length <= 160);
        assert.match(out, /word\.\.\.$/u);
    });
});

describe('versionLabel', () => {
    test('names the published version when nothing is unreleased', () => {
        assert.match(versionLabel({ published: '1.7.1', unreleased: undefined }), /^> Written for blit386 1\.7\.1\. /u);
    });

    test('names the unreleased version and the published one npm installs', () => {
        const label = versionLabel({ published: '1.7.1', unreleased: '1.8.0' });

        assert.match(label, /^> Written for blit386 1\.8\.0, which is not on npm yet\. The newest release is 1\.7\.1/u);
    });
});

describe('readRelease', () => {
    test('reads the published kit version and the changelog Unreleased heading, if any', () => {
        const changelog = readFileSync(join(PACKAGES, 'blit386', 'docs', 'changelog.md'), 'utf8');

        assert.equal(
            RELEASE.published,
            JSON.parse(readFileSync(join(PACKAGES, 'kit', 'package.json'), 'utf8')).version,
        );
        assert.equal(RELEASE.unreleased, /^## (\S+) - Unreleased$/mu.exec(changelog)?.[1]);
    });
});

describe('buildPages against the real kit, templates, and demos', () => {
    const { pages, metas } = buildPages(RELEASE);
    const byUrl = new Map(pages.map((entry) => [entry.url, entry]));

    test('labels every page with the version it was written for', () => {
        for (const { url, page } of pages) {
            assert.ok(page.body.startsWith(versionLabel(RELEASE)), `${url} lacks the version label`);
        }
    });

    test('publishes the start page, starter template, AGENTS.md, and at least one of each group', () => {
        for (const url of ['', '/starter-template', '/agents']) {
            assert.ok(byUrl.has(`/docs/${SECTION}${url}`), `missing /docs/${SECTION}${url}`);
        }

        for (const folder of ['kit-guides', 'skills', 'rules', 'examples']) {
            assert.ok(
                pages.some(({ url }) => url.startsWith(`/docs/${SECTION}/${folder}/`)),
                `no pages in ${folder}`,
            );
        }
    });

    test('renders the starter template with no placeholder left and both dependencies pinned', () => {
        const { body } = byUrl.get(`/docs/${SECTION}/starter-template`).page;

        assert.doesNotMatch(body, /\{\{/u);
        assert.doesNotMatch(body, /"packageManager"/u);
        assert.ok(
            body.includes(`"blit386": "^${RELEASE.published}"`),
            'blit386 is not pinned to the published version',
        );
        assert.match(body, /```js title="src\/game\.js"/u);
    });

    test('titles a skill from its H1 and describes it from its frontmatter', () => {
        const { page } = byUrl.get(`/docs/${SECTION}/skills/ask-the-docs`);

        assert.equal(page.title, 'Skill: Ask the docs');
        assert.match(page.description, /^Look up BLIT386 detail/u);
    });

    test('publishes an example with its full source and the shared-helper note', () => {
        const { page } = byUrl.get(`/docs/${SECTION}/examples/snake-game`);

        assert.equal(page.title, 'Example: Snake Game');
        assert.match(page.body, /Imports from `\.\/shared\/`/u);
        assert.ok(page.body.includes(readFileSync(join(PACKAGES, 'demos', 'src', 'snake-game.js'), 'utf8').trimEnd()));
    });

    test('lists every generated page in a sidebar meta.json', () => {
        const listed = new Set(
            metas.flatMap(({ file, meta }) =>
                meta.pages.map((/** @type {string} */ name) =>
                    dirname(file) === '.' ? name : `${dirname(file)}/${name}`,
                ),
            ),
        );

        for (const { file } of pages) {
            const name = file.replace(/\.mdx$/u, '');

            if (name !== 'index') {
                assert.ok(listed.has(name), `${name} is missing from the sidebar`);
            }
        }
    });

    test('keeps every description within 160 characters', () => {
        for (const { url, page } of pages) {
            assert.ok(page.description.length <= 160, `${url} description is ${page.description.length} chars`);
        }
    });
});
