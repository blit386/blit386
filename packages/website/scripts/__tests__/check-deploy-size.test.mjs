import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import {
    findOversizedAssets,
    findOversizedWorker,
    listFilesBySize,
    MAX_ASSET_BYTES,
    parseWranglerUploadBytes,
} from '../check-deploy-size.mjs';

const MIB = 1024 * 1024;

describe('check-deploy-size', () => {
    describe('parseWranglerUploadBytes', () => {
        test('reads the uncompressed Total Upload figure, not the gzip one', () => {
            const output = 'Read 639 files\nTotal Upload: 63641.83 KiB / gzip: 6247.42 KiB\n--dry-run: exiting now.';
            assert.equal(parseWranglerUploadBytes(output), Math.round(63641.83 * 1024));
        });

        test('ignores ANSI color codes around the numbers', () => {
            assert.equal(
                parseWranglerUploadBytes(
                    'Total Upload: \u001b[1m10.00\u001b[0m KiB / gzip: \u001b[1m2.00\u001b[0m KiB',
                ),
                10240,
            );
        });

        test('returns null when the summary line is missing', () => {
            assert.equal(parseWranglerUploadBytes('Asset too large.'), null);
        });
    });

    describe('findOversizedWorker', () => {
        test('passes an upload at exactly the budget', () => {
            assert.deepEqual(findOversizedWorker(51 * MIB), []);
        });

        test('reports the 66.3 MiB Worker Cloudflare rejected in BT-586', () => {
            const uploadBytes = parseWranglerUploadBytes('Total Upload: 67845.43 KiB / gzip: 6509.83 KiB');
            assert.ok(uploadBytes !== null);
            const [failure, ...rest] = findOversizedWorker(uploadBytes);
            assert.deepEqual(rest, []);
            assert.match(failure ?? '', /Worker upload is 66\.26 MiB, over the 51\.00 MiB budget/u);
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
