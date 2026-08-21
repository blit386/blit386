/**
 * Unit tests for `src/kit-root.ts` – the single home for both ways of finding a kit package root.
 *
 * `kitRoot()` ("the kit containing me") and `resolveKitRoot(fromUrl)` ("the kit the caller's package
 * depends on") are not interchangeable, and the interesting failures are silent: a resolver that
 * answers the wrong directory copies the wrong content and pins the wrong version rather than
 * throwing. So these tests check the emitted artifacts, not just the happy path in this workspace.
 *
 * Imports the built dist modules; the package `pretest` script runs `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    realpathSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { KIT_PACKAGE_NAME, kitRoot, resolveKitRoot } from '../dist/adapters.js';
import { kitDocsReviewedAt, kitEngineRange } from '../dist/env.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const distDir = join(packageRoot, 'dist');

/** Every `.js` file tsup emitted, including the shared `chunk-*.js` files and the nested entries. */
function emittedModules() {
    const files = [];

    for (const entry of readdirSync(distDir, { withFileTypes: true, recursive: true })) {
        if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(join(entry.parentPath, entry.name));
        }
    }

    return files;
}

/**
 * Copy the built package into a throwaway directory.
 *
 * `depth` is how many directories below the package root the emitted tree is placed. tsup already
 * emits `dist/migrations/*.js` one level below `dist/`, and splits shared code into `chunk-*.js`
 * whose location is an esbuild implementation detail – so the resolver must not care. Moving the
 * whole tree keeps every relative sibling import intact while changing what `../package.json` would
 * have meant, which is exactly the assumption under test.
 */
function stageKitCopy({ name = KIT_PACKAGE_NAME, depth = 1 } = {}) {
    // realpath: on macOS the temp dir is reached through a /var -> /private/var symlink, and the
    // resolver reports the real path it walked.
    const root = join(realpathSync(mkdtempSync(join(tmpdir(), 'kit-root-'))), 'kit');
    const emitDir = join(root, 'dist', ...Array.from({ length: depth - 1 }, (_unused, i) => `nested${i}`));

    mkdirSync(emitDir, { recursive: true });
    cpSync(distDir, emitDir, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name, version: '9.9.9' }));

    return { root, adapters: join(emitDir, 'adapters.js') };
}

test('kitRoot() finds this package by name, not by directory depth', () => {
    const root = kitRoot();
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

    assert.equal(pkg.name, KIT_PACKAGE_NAME, 'kitRoot() must land on the kit package.json');
    assert.ok(existsSync(join(root, 'content', 'AGENTS.md')), 'kitRoot() must be the root that holds content/');
});

test('kitRoot() still resolves when the emitted tree sits below dist/', async () => {
    const { root, adapters } = stageKitCopy({ depth: 3 });
    const module = await import(pathToFileURL(adapters).href);

    assert.equal(
        module.kitRoot(),
        root,
        'a module emitted below dist/ must find the package root, not some ancestor of its own directory',
    );
});

test('kitRoot() throws rather than guessing when it is bundled into another package', async () => {
    const { adapters } = stageKitCopy({ name: 'some-other-package' });
    const module = await import(pathToFileURL(adapters).href);

    assert.throws(
        () => module.kitRoot(),
        /no @blit386\/kit package\.json above/,
        'a wrong directory would be silently wrong; the error names resolveKitRoot as the way out',
    );
});

test('no emitted module resolves the kit root by a hardcoded depth', () => {
    const offenders = emittedModules().filter((file) => readFileSync(file, 'utf8').includes('../package.json'));

    assert.deepEqual(
        offenders,
        [],
        'the `new URL("../package.json", import.meta.url)` idiom is only correct at dist root – use kitRoot()',
    );
});

test('resolveKitRoot() agrees with kitRoot() when the caller depends on this kit', () => {
    assert.equal(
        resolveKitRoot(import.meta.url),
        kitRoot(),
        'in a normal install the two questions have the same answer; they diverge only under bundling',
    );
});

test('the env.ts package.json readers go through kitRoot()', () => {
    const pkg = JSON.parse(readFileSync(join(kitRoot(), 'package.json'), 'utf8'));

    // Both swallow failure with `catch { return null }`, so a broken root reads as "field absent"
    // rather than as an error. Asserting the real values is the only thing that catches that.
    assert.equal(kitEngineRange(), pkg.blit386.engineRange, 'kitEngineRange() must read this kit package.json');
    assert.equal(
        kitDocsReviewedAt(),
        pkg.blit386.docsReviewedAt,
        'kitDocsReviewedAt() must read this kit package.json',
    );
});
