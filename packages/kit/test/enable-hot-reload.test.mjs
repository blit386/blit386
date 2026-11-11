/**
 * Unit tests for the vite.config hot-reload enabler.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { enableHotReloadInViteConfig } from '../dist/migrations/enableHotReload.js';

const SCAFFOLD_BEFORE = `import { defineConfig } from 'vite';

// Vite is the little web server that runs your game while you work on it.
// You usually do not need to change anything here.
export default defineConfig({
    server: {
        // Open the game in your browser automatically when you run \`npm run dev\`.
        open: true,
    },
});
`;

test('enableHotReloadInViteConfig wires the scaffolder vite.config template', () => {
    const result = enableHotReloadInViteConfig(SCAFFOLD_BEFORE);
    assert.equal(result.status, 'added');
    assert.equal(result.changed, true);
    assert.ok(result.text.includes("from 'blit386/vite'"), 'should import blit386/vite');
    assert.ok(result.text.includes('plugins: [blit386()]'), 'should register blit386()');
    assert.ok(result.text.includes('server:'), 'should keep the existing server block');
});

test('enableHotReloadInViteConfig is a no-op when the plugin is already present', () => {
    const already = `import { defineConfig } from 'vite';
import { blit386 } from 'blit386/vite';

export default defineConfig({
    plugins: [blit386()],
    server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(already);
    assert.equal(result.status, 'already');
    assert.equal(result.changed, false);
    assert.equal(result.text, already);
});

test('enableHotReloadInViteConfig prepends into an existing plugins array', () => {
    const withOther = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
});
`;
    const result = enableHotReloadInViteConfig(withOther);
    assert.equal(result.status, 'added');
    assert.ok(result.text.includes('plugins: [blit386(), react()]'));
    assert.ok(result.text.includes("from 'blit386/vite'"));
});

test('enableHotReloadInViteConfig fills an empty plugins array', () => {
    const empty = `import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [],
});
`;
    const result = enableHotReloadInViteConfig(empty);
    assert.equal(result.status, 'added');
    assert.ok(result.text.includes('plugins: [blit386()]'));
});

test('enableHotReloadInViteConfig reports unsupported for non-defineConfig shapes', () => {
    const weird = `export default { server: { open: true } };\n`;
    const result = enableHotReloadInViteConfig(weird);
    assert.equal(result.status, 'unsupported');
    assert.equal(result.changed, false);
});

test('enableHotReloadInViteConfig adds plugins when only the import is present', () => {
    const importOnly = `import { defineConfig } from 'vite';
import { blit386 } from 'blit386/vite';

export default defineConfig({
    server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(importOnly);
    assert.equal(result.status, 'added');
    assert.equal(result.changed, true);
    assert.ok(result.text.includes('plugins: [blit386()]'), 'should register blit386() inside defineConfig');
    assert.equal(
        (result.text.match(/from\s+['"]blit386\/vite['"]/g) ?? []).length,
        1,
        'should not duplicate the existing import',
    );
});

test('enableHotReloadInViteConfig ignores plugins arrays outside defineConfig', () => {
    const outerPlugins = `import { defineConfig } from 'vite';

const extra = {
    plugins: [],
};

export default defineConfig({
    server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(outerPlugins);
    assert.equal(result.status, 'added');
    assert.ok(result.text.includes('plugins: [blit386()]'), 'should add plugins inside defineConfig');
    assert.ok(
        result.text.includes('const extra = {\n    plugins: [],\n};'),
        'should leave the outer plugins array untouched',
    );
});

test('enableHotReloadInViteConfig reports unsupported for ambiguous defineConfig calls', () => {
    const ambiguous = `import { defineConfig } from 'vite';

const a = defineConfig({ server: { open: true } });
export default defineConfig({ server: { open: false } });
`;
    const result = enableHotReloadInViteConfig(ambiguous);
    assert.equal(result.status, 'unsupported');
    assert.equal(result.changed, false);
});

/**
 * @param {string} source - a vite.config body
 * @returns {boolean} whether `node --check` accepts it as an ES module
 */
function parsesAsModule(source) {
    const dir = mkdtempSync(join(tmpdir(), 'blit-vite-config-'));
    try {
        const file = join(dir, 'vite.config.mjs');
        writeFileSync(file, source);
        return spawnSync(process.execPath, ['--check', file]).status === 0;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('enableHotReloadInViteConfig adds the import after a multi-line last import', () => {
    const multiline = `import {
    defineConfig,
    loadEnv,
} from 'vite';

export default defineConfig({
    server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(multiline);
    assert.equal(result.status, 'added');
    assert.ok(
        result.text.startsWith(
            "import {\n    defineConfig,\n    loadEnv,\n} from 'vite';\nimport { blit386 } from 'blit386/vite';\n",
        ),
        `the import should follow the whole statement, got:\n${result.text}`,
    );
    assert.ok(parsesAsModule(result.text), `the result should parse, got:\n${result.text}`);
});

test('enableHotReloadInViteConfig keeps the new import in the import block, with no blank line before it', () => {
    const result = enableHotReloadInViteConfig(SCAFFOLD_BEFORE);
    assert.ok(
        result.text.startsWith("import { defineConfig } from 'vite';\nimport { blit386 } from 'blit386/vite';\n\n"),
        `got:\n${result.text}`,
    );
});

test('enableHotReloadInViteConfig adds a real import when the only blit386 import is commented out', () => {
    const commented = `import { defineConfig } from 'vite';
// import { blit386 } from 'blit386/vite';

export default defineConfig({
    server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(commented);
    assert.equal(result.status, 'added');
    assert.ok(result.text.includes("from 'vite';\nimport { blit386 } from 'blit386/vite';\n"), `got:\n${result.text}`);
});

test('enableHotReloadInViteConfig reports unsupported when code follows the last import on its line', () => {
    const attributes = `import { defineConfig } from 'vite';
import data from './data.json' with { type: 'json' };

export default defineConfig({
    server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(attributes);
    assert.equal(result.status, 'unsupported');
    assert.equal(result.changed, false);
});

test('enableHotReloadInViteConfig adds the import after a trailing comment on the last import line', () => {
    const trailing = `import { defineConfig } from 'vite'; // the dev server

export default defineConfig({
    server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(trailing);
    assert.equal(result.status, 'added');
    assert.ok(
        result.text.startsWith(
            "import { defineConfig } from 'vite'; // the dev server\nimport { blit386 } from 'blit386/vite';\n",
        ),
        `got:\n${result.text}`,
    );
});

test('enableHotReloadInViteConfig keeps CRLF line endings on the import it adds', () => {
    const crlf =
        "import { defineConfig } from 'vite';\r\n\r\nexport default defineConfig({\r\n    server: { open: true },\r\n});\r\n";
    const result = enableHotReloadInViteConfig(crlf);
    assert.equal(result.status, 'added');
    assert.ok(
        result.text.includes("from 'vite';\r\nimport { blit386 } from 'blit386/vite';\r\n"),
        JSON.stringify(result.text),
    );
});

test('enableHotReloadInViteConfig ignores a commented-out plugins key and adds a real one', () => {
    const commented = `import { defineConfig } from 'vite';

export default defineConfig({
    // plugins: [],
    server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(commented);
    assert.equal(result.status, 'added');
    assert.ok(result.text.includes('    // plugins: [],\n'), 'the comment must stay as it was');
    assert.ok(result.text.includes('defineConfig({\n    plugins: [blit386()],\n'), `got:\n${result.text}`);
});

test('enableHotReloadInViteConfig leaves a nested rollupOptions plugins list alone', () => {
    const nested = `import { defineConfig } from 'vite';

export default defineConfig({
    build: { rollupOptions: { plugins: [] } },
});
`;
    const result = enableHotReloadInViteConfig(nested);
    assert.equal(result.status, 'added');
    assert.ok(result.text.includes('rollupOptions: { plugins: [] }'), 'the Rollup list must stay empty');
    assert.ok(result.text.includes('defineConfig({\n    plugins: [blit386()],\n'), `got:\n${result.text}`);
});

test('enableHotReloadInViteConfig does not take blit386() in a comment for the plugin', () => {
    const mention = `import { defineConfig } from 'vite';

export default defineConfig({
    // TODO: add blit386() here
    server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(mention);
    assert.equal(result.status, 'added');
    assert.ok(result.text.includes('plugins: [blit386()],'), `got:\n${result.text}`);
});

test('enableHotReloadInViteConfig indents the new plugins key like the keys around it', () => {
    const twoSpaces = `import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: true },
});
`;
    const result = enableHotReloadInViteConfig(twoSpaces);
    assert.ok(result.text.includes('defineConfig({\n  plugins: [blit386()],\n  server:'), `got:\n${result.text}`);
});

for (const [label, body] of [
    ['a shorthand plugins key', 'plugins,'],
    ['a quoted plugins key', "'plugins': [react()],"],
    ['plugins from a variable', 'plugins: shared,'],
    ['a spread', '...base,'],
]) {
    test(`enableHotReloadInViteConfig reports unsupported for ${label}`, () => {
        const source = `import { defineConfig } from 'vite';

export default defineConfig({
    ${body}
    server: { open: true },
});
`;
        const result = enableHotReloadInViteConfig(source);
        assert.equal(result.status, 'unsupported');
        assert.equal(result.changed, false);
    });
}
