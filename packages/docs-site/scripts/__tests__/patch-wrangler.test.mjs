import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { patchWranglerConfig, patchRequireMetaUrl } from '../patch-wrangler.mjs';

describe('patchWranglerConfig', () => {
    test('adds nodejs_compat when compatibility_flags is an empty array', () => {
        const result = patchWranglerConfig({ compatibility_flags: [] });
        assert.ok(result.compatibility_flags.includes('nodejs_compat'));
    });

    test('initializes compatibility_flags when the key is absent', () => {
        const result = patchWranglerConfig({});
        assert.deepEqual(result.compatibility_flags, ['nodejs_compat']);
    });

    test('does not duplicate nodejs_compat when already present', () => {
        const result = patchWranglerConfig({ compatibility_flags: ['nodejs_compat'] });
        assert.equal(result.compatibility_flags.filter((f) => f === 'nodejs_compat').length, 1);
    });

    test('preserves existing flags alongside nodejs_compat', () => {
        const result = patchWranglerConfig({ compatibility_flags: ['some_flag'] });
        assert.ok(result.compatibility_flags.includes('some_flag'));
        assert.ok(result.compatibility_flags.includes('nodejs_compat'));
    });

    test('sets run_worker_first: true when assets exists but flag is absent', () => {
        const result = patchWranglerConfig({ assets: { directory: './dist/public' } });
        assert.equal(result.assets.run_worker_first, true);
    });

    test('leaves run_worker_first unchanged when already true (idempotent)', () => {
        const config = { assets: { directory: './dist/public', run_worker_first: true } };
        const result = patchWranglerConfig(config);
        assert.equal(result.assets.run_worker_first, true);
    });

    test('does not add an assets key when the input has none', () => {
        const result = patchWranglerConfig({ name: 'my-worker' });
        assert.equal('assets' in result, false);
    });

    test('does not mutate the input config object', () => {
        const config = { compatibility_flags: [], assets: { directory: '.' } };
        const snapshot = JSON.stringify(config);
        patchWranglerConfig(config);
        assert.equal(JSON.stringify(config), snapshot);
    });

    test('preserves unrelated top-level config keys', () => {
        const result = patchWranglerConfig({ name: 'worker', compatibility_flags: [] });
        assert.equal(result.name, 'worker');
    });
});

describe('patchRequireMetaUrl', () => {
    test('rewrites createRequire(import.meta.url) to include the fallback', () => {
        const result = patchRequireMetaUrl('const r = createRequire(import.meta.url);');
        assert.ok(result.includes("createRequire(import.meta.url ?? 'file:///worker.js')"));
    });

    test('handles whitespace inside the call (e.g. minifier variants)', () => {
        const result = patchRequireMetaUrl('createRequire( import.meta.url )');
        assert.ok(result.includes("createRequire(import.meta.url ?? 'file:///worker.js')"));
    });

    test('is idempotent: already-patched call is not rewritten again', () => {
        const already = "createRequire(import.meta.url ?? 'file:///worker.js')";
        assert.equal(patchRequireMetaUrl(already), already);
    });

    test('rewrites all occurrences in the input', () => {
        const input = 'createRequire(import.meta.url)\ncreateRequire(import.meta.url)';
        const result = patchRequireMetaUrl(input);
        assert.equal((result.match(/file:\/\/\/worker\.js/gu) ?? []).length, 2);
    });

    test('returns input unchanged when pattern is absent', () => {
        const input = 'no relevant code here';
        assert.equal(patchRequireMetaUrl(input), input);
    });
});
