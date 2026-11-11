import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchWranglerConfig } from '../patch-wrangler.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../', import.meta.url));

// Where Waku's Cloudflare build writes the Worker entry and the static assets
// (dist/server/wrangler.json carries them as "index.js" and "../public").
const BUILT_MAIN = resolve(PACKAGE_DIR, 'dist/server/index.js');
const BUILT_ASSETS = resolve(PACKAGE_DIR, 'dist/public');

// shortcut: strips whole-line // comments only, enough for this hand-kept file; use a JSONC parser if it grows block comments.
const rootConfig = JSON.parse(
    readFileSync(resolve(PACKAGE_DIR, 'wrangler.jsonc'), 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('//'))
        .join('\n'),
);

describe('root wrangler.jsonc parity with the deployed config', () => {
    test('already carries every key scripts/patch-wrangler.mjs adds to dist/server/wrangler.json', () => {
        assert.deepEqual(patchWranglerConfig(rootConfig), rootConfig);
    });

    test('points main and assets at the files the build emits', () => {
        assert.equal(resolve(PACKAGE_DIR, rootConfig.main), BUILT_MAIN);
        assert.equal(resolve(PACKAGE_DIR, rootConfig.assets.directory), BUILT_ASSETS);
    });
});
