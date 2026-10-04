import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import {
    findOversizedAssets,
    listFilesBySize,
    MAX_ASSET_BYTES,
    parseWranglerGzipBytes,
} from '../check-deploy-size.mjs';

describe('check-deploy-size', () => {
    describe('parseWranglerGzipBytes', () => {
        test('reads the gzip figure from the dry-run summary line', () => {
            const output = 'Read 639 files\nTotal Upload: 63641.83 KiB / gzip: 6247.42 KiB\n--dry-run: exiting now.';
            assert.equal(parseWranglerGzipBytes(output), Math.round(6247.42 * 1024));
        });

        test('ignores ANSI color codes around the numbers', () => {
            assert.equal(
                parseWranglerGzipBytes('Total Upload: \u001b[1m10.00\u001b[0m KiB / gzip: \u001b[1m2.00\u001b[0m KiB'),
                2048,
            );
        });

        test('returns null when the summary line is missing', () => {
            assert.equal(parseWranglerGzipBytes('Asset too large.'), null);
        });
    });

    describe('listFilesBySize', () => {
        test('walks nested directories and sorts largest first', () => {
            const dir = mkdtempSync(join(tmpdir(), 'deploy-size-'));
            try {
                mkdirSync(join(dir, 'api'));
                writeFileSync(join(dir, 'index.html'), 'x'.repeat(10));
                writeFileSync(join(dir, 'api', 'search'), 'x'.repeat(100));
                assert.deepEqual(listFilesBySize(dir), [
                    { path: join('api', 'search'), bytes: 100 },
                    { path: 'index.html', bytes: 10 },
                ]);
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        });
    });

    describe('findOversizedAssets', () => {
        test('passes an asset at exactly the limit', () => {
            assert.deepEqual(findOversizedAssets([{ path: 'api/search', bytes: MAX_ASSET_BYTES }]), []);
        });

        test('reports the 28.8 MiB search index BT-557 briefly shipped', () => {
            const files = [{ path: 'api/search', bytes: Math.round(28.8 * 1024 * 1024) }];
            const [failure, ...rest] = findOversizedAssets(files);
            assert.deepEqual(rest, []);
            assert.match(failure ?? '', /dist\/public\/api\/search is 28\.80 MiB/u);
        });
    });
});
