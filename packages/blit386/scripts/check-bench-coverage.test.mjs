import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkBenchCoverage, HOT_PATH_DIRS } from './check-bench-coverage.mjs';

describe('checkBenchCoverage', () => {
    it('does not remind when no hot-path files changed', () => {
        const result = checkBenchCoverage(['docs/performance-testing.md', 'src/audio/MusicPlayer.ts']);

        assert.deepEqual(result.hotFiles, []);
        assert.equal(result.needsReminder, false);
    });

    it('reminds when a hot-path file changed with no bench file touched', () => {
        const result = checkBenchCoverage(['src/render/SoftwareRasterizer.ts']);

        assert.deepEqual(result.hotFiles, ['src/render/SoftwareRasterizer.ts']);
        assert.equal(result.needsReminder, true);
    });

    it('does not remind when a matching bench file was touched alongside', () => {
        const result = checkBenchCoverage([
            'src/render/SoftwareRasterizer.ts',
            'src/render/SoftwareRasterizer.bench.ts',
        ]);

        assert.equal(result.needsReminder, false);
    });

    it('does not require the bench file to belong to the same directory as the hot file', () => {
        // The reminder is push-wide, not per-file: touching any *.bench.ts anywhere in the push
        // is treated as "benchmarks were considered," not just a bench file beside this exact source.
        const result = checkBenchCoverage(['src/render/SoftwareRasterizer.ts', 'src/utils/Vector2i.bench.ts']);

        assert.equal(result.needsReminder, false);
    });

    it('does not count a *.bench.ts change itself as a hot file needing a reminder', () => {
        const result = checkBenchCoverage(['src/utils/Vector2i.bench.ts']);

        assert.deepEqual(result.hotFiles, []);
        assert.equal(result.needsReminder, false);
    });

    it('does not count a *.test.ts change as a hot file needing a reminder', () => {
        const result = checkBenchCoverage(['src/core/GameLoop.test.ts']);

        assert.deepEqual(result.hotFiles, []);
        assert.equal(result.needsReminder, false);
    });

    it('ignores directories outside the hot-path list', () => {
        const result = checkBenchCoverage(['src/splash/Splash.ts', 'src/hot/HotReload.ts', 'src/vite/plugin.ts']);

        assert.deepEqual(result.hotFiles, []);
        assert.equal(result.needsReminder, false);
    });

    it('collects every hot file across multiple hot-path directories', () => {
        const result = checkBenchCoverage([
            'src/render/SoftwareRasterizer.ts',
            'src/input/GamepadPoller.ts',
            'src/overlay/Overlay.ts',
        ]);

        assert.deepEqual(result.hotFiles, [
            'src/render/SoftwareRasterizer.ts',
            'src/input/GamepadPoller.ts',
            'src/overlay/Overlay.ts',
        ]);
    });

    it('returns no reminder for an empty change set', () => {
        const result = checkBenchCoverage([]);

        assert.equal(result.needsReminder, false);
    });
});

describe('HOT_PATH_DIRS', () => {
    it('names exactly the six directories documented in .claude/rules/bench-coverage.md', () => {
        assert.deepEqual(HOT_PATH_DIRS, [
            'src/render/',
            'src/input/',
            'src/overlay/',
            'src/core/',
            'src/assets/',
            'src/utils/',
        ]);
    });
});
