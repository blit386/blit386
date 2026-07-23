/**
 * Unit tests for the vite.config hot-reload enabler.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { enableHotReloadInViteConfig, hasBlit386VitePlugin } from '../dist/migrations/enableHotReload.js';

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

test('hasBlit386VitePlugin detects import and factory call', () => {
    assert.equal(hasBlit386VitePlugin("import { blit386 } from 'blit386/vite';\n"), true);
    assert.equal(hasBlit386VitePlugin('plugins: [blit386()],\n'), true);
    assert.equal(hasBlit386VitePlugin('plugins: [],\n'), false);
});
