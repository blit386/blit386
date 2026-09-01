import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildMarkdown,
    compareReports,
    flattenBenchmarks,
    hasComparisonFailures,
    parseArgs,
} from './compare-tier-1-benchmarks.mjs';

/**
 * Builds a minimal Vitest bench report with one file, one group, and the given benchmarks.
 *
 * @param {Array<{ name: string, hz: number }>} benchmarks Benchmark entries for the single group.
 * @param {{ filepath?: string, suite?: string }} [options] Overrides for the file path and group name.
 * @returns {{ files: unknown[] }} A report shaped like `compare-tier-1-benchmarks.mjs` expects.
 */
function makeReport(benchmarks, options = {}) {
    const { filepath = 'src/utils/Thing.bench.ts', suite = 'Thing hot paths' } = options;

    return {
        files: [
            {
                filepath,
                groups: [{ fullName: suite, benchmarks }],
            },
        ],
    };
}

describe('parseArgs', () => {
    it('parses required and defaulted options', () => {
        const args = parseArgs(['--current', 'current.json']);

        assert.deepEqual(args, {
            baseline: null,
            current: 'current.json',
            jsonOut: 'benchmark-comparison.json',
            markdownOut: 'benchmark-comment.md',
            threshold: 10,
        });
    });

    it('parses every optional flag', () => {
        const args = parseArgs([
            '--baseline',
            'baseline.json',
            '--current',
            'current.json',
            '--json-out',
            'out.json',
            '--markdown-out',
            'out.md',
            '--threshold',
            '25',
        ]);

        assert.deepEqual(args, {
            baseline: 'baseline.json',
            current: 'current.json',
            jsonOut: 'out.json',
            markdownOut: 'out.md',
            threshold: 25,
        });
    });

    it('throws when --current is missing', () => {
        assert.throws(() => parseArgs(['--baseline', 'baseline.json']), /--current argument is required/);
    });

    it('throws when a flag is missing its value', () => {
        assert.throws(() => parseArgs(['--current']), /Missing value for argument: --current/);
    });

    it('throws on an unknown argument', () => {
        assert.throws(() => parseArgs(['--current', 'current.json', '--bogus', 'x']), /Unknown argument: --bogus/);
    });

    it('throws on a negative threshold', () => {
        assert.throws(() => parseArgs(['--current', 'current.json', '--threshold', '-5']), /Invalid --threshold value/);
    });

    it('throws on a non-numeric threshold', () => {
        assert.throws(
            () => parseArgs(['--current', 'current.json', '--threshold', 'nope']),
            /Invalid --threshold value/,
        );
    });
});

describe('flattenBenchmarks', () => {
    it('flattens a nested report into matchable entries', () => {
        const report = makeReport([{ name: 'fast()', hz: 1000 }]);
        const entries = flattenBenchmarks(report);

        assert.equal(entries.length, 1);
        assert.deepEqual(entries[0], {
            matchKey: 'src/utils/Thing.bench.ts::Thing hot paths::fast()',
            label: 'Thing hot paths > fast()',
            suite: 'Thing hot paths',
            name: 'fast()',
            hz: 1000,
            filepath: 'src/utils/Thing.bench.ts',
        });
    });

    it('throws when report.files is not an array', () => {
        assert.throws(() => flattenBenchmarks({ files: null }), /report\.files must be an array/);
    });

    it('throws when a benchmark has a non-finite hz', () => {
        const report = makeReport([{ name: 'broken()', hz: Number.NaN }]);

        assert.throws(() => flattenBenchmarks(report), /Invalid benchmark\.hz/);
    });
});

describe('compareReports', () => {
    it('marks every entry as new when there is no baseline', () => {
        const current = makeReport([{ name: 'fast()', hz: 1000 }]);
        const report = compareReports(current, null, 25);

        assert.equal(report.hasBaseline, false);
        assert.equal(report.summary.newBenchmarks, 1);
        assert.equal(report.summary.compared, 0);
        assert.equal(report.benchmarks[0].status, 'new');
        assert.equal(report.benchmarks[0].baselineHz, null);
    });

    it('marks an unchanged benchmark as pass', () => {
        const baseline = makeReport([{ name: 'fast()', hz: 1000 }]);
        const current = makeReport([{ name: 'fast()', hz: 1000 }]);
        const report = compareReports(current, baseline, 25);

        assert.equal(report.benchmarks[0].status, 'pass');
        assert.equal(report.benchmarks[0].deltaPct, 0);
    });

    it('marks a faster benchmark as improved', () => {
        const baseline = makeReport([{ name: 'fast()', hz: 1000 }]);
        const current = makeReport([{ name: 'fast()', hz: 2000 }]);
        const report = compareReports(current, baseline, 25);

        assert.equal(report.benchmarks[0].status, 'improved');
        assert.equal(report.summary.improvements, 1);
    });

    it('marks a slowdown past the threshold as fail', () => {
        const baseline = makeReport([{ name: 'slow()', hz: 1000 }]);
        const current = makeReport([{ name: 'slow()', hz: 700 }]); // -30%, threshold 25%
        const report = compareReports(current, baseline, 25);

        assert.equal(report.benchmarks[0].status, 'fail');
        assert.equal(report.summary.regressions, 1);
    });

    it('keeps a slowdown within the threshold as pass', () => {
        const baseline = makeReport([{ name: 'slow()', hz: 1000 }]);
        const current = makeReport([{ name: 'slow()', hz: 900 }]); // -10%, threshold 25%
        const report = compareReports(current, baseline, 25);

        assert.equal(report.benchmarks[0].status, 'pass');
        assert.equal(report.summary.regressions, 0);
    });

    it('treats an exact threshold delta as pass, not fail', () => {
        const baseline = makeReport([{ name: 'edge()', hz: 1000 }]);
        const current = makeReport([{ name: 'edge()', hz: 750 }]); // exactly -25%, threshold 25%
        const report = compareReports(current, baseline, 25);

        assert.equal(report.benchmarks[0].status, 'pass');
    });

    it('marks a baseline benchmark absent from the current run as missing', () => {
        const baseline = makeReport([{ name: 'gone()', hz: 1000 }]);
        const current = makeReport([{ name: 'other()', hz: 1000 }]);
        const report = compareReports(current, baseline, 25);

        const gone = report.benchmarks.find((benchmark) => benchmark.name.includes('gone()'));

        assert.equal(gone.status, 'missing');
        assert.equal(gone.currentHz, null);
        assert.equal(report.summary.missingBenchmarks, 1);
    });
});

describe('hasComparisonFailures', () => {
    it('is false when there is no baseline', () => {
        const report = compareReports(makeReport([{ name: 'fast()', hz: 1000 }]), null, 25);

        assert.equal(hasComparisonFailures(report), false);
    });

    it('is false when the baseline comparison has no regressions or missing benchmarks', () => {
        const baseline = makeReport([{ name: 'fast()', hz: 1000 }]);
        const current = makeReport([{ name: 'fast()', hz: 1000 }]);
        const report = compareReports(current, baseline, 25);

        assert.equal(hasComparisonFailures(report), false);
    });

    it('is true when a benchmark regresses past the threshold', () => {
        const baseline = makeReport([{ name: 'slow()', hz: 1000 }]);
        const current = makeReport([{ name: 'slow()', hz: 700 }]);
        const report = compareReports(current, baseline, 25);

        assert.equal(hasComparisonFailures(report), true);
    });

    it('is true when a baseline benchmark is missing from the current run', () => {
        const baseline = makeReport([{ name: 'gone()', hz: 1000 }]);
        const current = makeReport([{ name: 'other()', hz: 1000 }]);
        const report = compareReports(current, baseline, 25);

        assert.equal(hasComparisonFailures(report), true);
    });
});

describe('buildMarkdown', () => {
    it('reports no baseline available when hasBaseline is false', () => {
        const report = compareReports(makeReport([{ name: 'fast()', hz: 1000 }]), null, 25);
        const markdown = buildMarkdown(report);

        assert.match(markdown, /<!-- benchmark-comparison -->/);
        assert.match(markdown, /No `main` branch benchmark baseline artifact is available yet/);
    });

    it('renders a comparison table row per benchmark when a baseline is present', () => {
        const baseline = makeReport([{ name: 'fast()', hz: 1000 }]);
        const current = makeReport([{ name: 'fast()', hz: 1000 }]);
        const report = compareReports(current, baseline, 25);
        const markdown = buildMarkdown(report);

        assert.match(markdown, /Regressions: 0 \| Improvements: 0 \| New: 0 \| Missing: 0/);
        assert.match(markdown, /Thing hot paths > fast\(\) \| 1,000\.00 \| 1,000\.00 \| 0\.00% \| PASS/);
    });

    it('escapes a pipe character in a benchmark name so it does not break the table', () => {
        const baseline = makeReport([{ name: 'a|b()', hz: 1000 }]);
        const current = makeReport([{ name: 'a|b()', hz: 1000 }]);
        const report = compareReports(current, baseline, 25);
        const markdown = buildMarkdown(report);

        assert.match(markdown, /a\\\|b\(\)/);
    });
});
