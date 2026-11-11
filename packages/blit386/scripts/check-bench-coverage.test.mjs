import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkBenchCoverage, HOT_PATH_DIRS } from './check-bench-coverage.mjs';
import { gitEnv } from '../../../scripts/lib/git-env.mjs';

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
    it('names exactly the seven directories documented in .claude/rules/bench-coverage.md', () => {
        assert.deepEqual(HOT_PATH_DIRS, [
            'src/render/',
            'src/input/',
            'src/overlay/',
            'src/core/',
            'src/assets/',
            'src/utils/',
            'src/bt/',
        ]);
    });
});

describe('changedFilesSince (real git output)', () => {
    it('reports package-relative paths that checkBenchCoverage recognizes, from a nested package dir', async () => {
        const { execFileSync } = await import('node:child_process');
        const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const { changedFilesSince } = await import('./check-bench-coverage.mjs');

        const dir = mkdtempSync(join(tmpdir(), 'check-bench-coverage-'));
        const pkg = join(dir, 'packages', 'blit386');
        const env = gitEnv({
            GIT_AUTHOR_NAME: 'Test',
            GIT_AUTHOR_EMAIL: 'test@example.com',
            GIT_COMMITTER_NAME: 'Test',
            GIT_COMMITTER_EMAIL: 'test@example.com',
        });
        const run = (args) =>
            execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8', env });

        let previousGitDir;

        try {
            run(['init', '--initial-branch=main']);
            mkdirSync(join(pkg, 'src', 'core'), { recursive: true });
            writeFileSync(join(pkg, 'src', 'core', 'X.ts'), 'export const X = 1;\n');
            run(['add', '.']);
            run(['commit', '-m', 'base']);
            writeFileSync(join(pkg, 'src', 'core', 'X.ts'), 'export const X = 2;\n');
            run(['commit', '-am', 'change']);

            // Hook-like env: GIT_DIR would otherwise make git treat pkg as the work tree root.
            previousGitDir = process.env.GIT_DIR;
            process.env.GIT_DIR = join(dir, '.git');
            const files = changedFilesSince('HEAD~1', pkg);

            assert.deepEqual(files, ['src/core/X.ts']);
            assert.equal(checkBenchCoverage(files).needsReminder, true);
        } finally {
            // A pre-push hook already exports GIT_DIR; put it back rather than deleting it.
            if (previousGitDir === undefined) {
                delete process.env.GIT_DIR;
            } else {
                process.env.GIT_DIR = previousGitDir;
            }
            // Retries: git may still be writing into the repo (ENOTEMPTY seen under the pre-push hook).
            rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        }
    });
});
