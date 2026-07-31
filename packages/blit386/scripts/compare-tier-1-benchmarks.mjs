import fs from 'node:fs';
import path from 'node:path';

const COMMENT_MARKER = '<!-- benchmark-comparison -->';
const DEFAULT_THRESHOLD = 10;

/**
 * Parses CLI arguments for the benchmark comparison command.
 *
 * @param {string[]} argv Raw CLI arguments after the node/script prefix.
 * @returns {{
 *   baseline: string | null,
 *   current: string | null,
 *   jsonOut: string,
 *   markdownOut: string,
 *   threshold: number,
 * }} Parsed command options.
 */
function parseArgs(argv) {
    const args = {
        baseline: null,
        current: null,
        jsonOut: 'benchmark-comparison.json',
        markdownOut: 'benchmark-comment.md',
        threshold: DEFAULT_THRESHOLD,
    };

    for (let index = 0; index < argv.length; index += 1) {
        // eslint-disable-next-line security/detect-object-injection -- CLI flags are parsed from a fixed argv array shape.
        const value = argv[index];
        const nextValue = argv[index + 1];

        if (!value.startsWith('--')) {
            continue;
        }

        if (nextValue === undefined) {
            throw new Error(`Missing value for argument: ${value}`);
        }

        switch (value) {
            case '--baseline':
                args.baseline = nextValue;
                index += 1;
                break;
            case '--current':
                args.current = nextValue;
                index += 1;
                break;
            case '--json-out':
                args.jsonOut = nextValue;
                index += 1;
                break;
            case '--markdown-out':
                args.markdownOut = nextValue;
                index += 1;
                break;
            case '--threshold':
                args.threshold = Number(nextValue);
                index += 1;
                break;
            default:
                throw new Error(`Unknown argument: ${value}`);
        }
    }

    if (!args.current) {
        throw new Error('The --current argument is required');
    }

    if (!Number.isFinite(args.threshold) || args.threshold < 0) {
        throw new Error(`Invalid --threshold value: ${String(args.threshold)}`);
    }

    return args;
}

/**
 * Ensures that the parent directory for an output file exists.
 *
 * @param {string} filePath Output file path.
 * @returns {void}
 */
function ensureParentDirectory(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * Reads and parses a JSON file from disk.
 *
 * @param {string} filePath JSON file path.
 * @returns {unknown} Parsed JSON value.
 */
function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Throws when a required condition is not met.
 *
 * @param {unknown} condition Condition to evaluate.
 * @param {string} message Error message for failed assertions.
 * @returns {void}
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

/**
 * Validates the top-level shape of a Vitest benchmark report before deeper parsing.
 *
 * @param {unknown} report Parsed benchmark report JSON.
 * @param {string} sourceLabel Human-readable source label for error messages.
 * @returns {void}
 */
function validateBenchmarkReport(report, sourceLabel) {
    assert(
        report !== null && typeof report === 'object',
        `Invalid benchmark report in ${sourceLabel}: expected object`,
    );
    assert(Array.isArray(report.files), `Invalid benchmark report in ${sourceLabel}: report.files must be an array`);
}

/**
 * Flattens the nested Vitest benchmark report into comparable benchmark entries.
 *
 * @param {{ files: unknown[], __sourceLabel?: string }} report Parsed benchmark report.
 * @returns {Array<{
 *   matchKey: string,
 *   label: string,
 *   suite: string,
 *   name: string,
 *   hz: number,
 *   filepath: string,
 * }>} Flattened benchmark entries.
 */
function flattenBenchmarks(report) {
    const entries = [];
    const reportLabel = report.__sourceLabel ?? 'benchmark report';

    validateBenchmarkReport(report, reportLabel);

    for (const [fileIndex, file] of report.files.entries()) {
        assert(file !== null && typeof file === 'object', `Invalid file entry at index ${fileIndex} in ${reportLabel}`);
        assert(typeof file.filepath === 'string', `Invalid file.filepath at index ${fileIndex} in ${reportLabel}`);
        assert(Array.isArray(file.groups), `Invalid file.groups for ${file.filepath} in ${reportLabel}`);

        for (const [groupIndex, group] of file.groups.entries()) {
            assert(
                group !== null && typeof group === 'object',
                `Invalid group entry at index ${groupIndex} for ${file.filepath} in ${reportLabel}`,
            );
            assert(
                typeof group.fullName === 'string',
                `Invalid group.fullName at index ${groupIndex} for ${file.filepath} in ${reportLabel}`,
            );
            assert(Array.isArray(group.benchmarks), `Invalid group.benchmarks for ${group.fullName} in ${reportLabel}`);

            for (const [benchmarkIndex, benchmark] of group.benchmarks.entries()) {
                assert(
                    benchmark !== null && typeof benchmark === 'object',
                    `Invalid benchmark entry at index ${benchmarkIndex} for ${group.fullName} in ${reportLabel}`,
                );
                assert(
                    typeof benchmark.name === 'string',
                    `Invalid benchmark.name at index ${benchmarkIndex} for ${group.fullName} in ${reportLabel}`,
                );
                assert(
                    Number.isFinite(benchmark.hz),
                    `Invalid benchmark.hz for ${group.fullName} > ${benchmark.name} in ${reportLabel}`,
                );
                const matchKey = `${file.filepath}::${group.fullName}::${benchmark.name}`;
                const label = `${group.fullName} > ${benchmark.name}`;

                entries.push({
                    matchKey,
                    label,
                    suite: group.fullName,
                    name: benchmark.name,
                    hz: benchmark.hz,
                    filepath: file.filepath,
                });
            }
        }
    }

    return entries;
}

/**
 * Compares the current benchmark report against an optional baseline report.
 *
 * @param {{ files: unknown[], __sourceLabel?: string }} currentReport Current benchmark report.
 * @param {{ files: unknown[], __sourceLabel?: string } | null} baselineReport Baseline benchmark report, if available.
 * @param {number} thresholdPct Maximum allowed slowdown percentage before failure.
 * @returns {{
 *   generatedAt: string,
 *   hasBaseline: boolean,
 *   thresholdPct: number,
 *   summary: {
 *     total: number,
 *     compared: number,
 *     regressions: number,
 *     improvements: number,
 *     pass: number,
 *     newBenchmarks: number,
 *     missingBenchmarks: number,
 *   },
 *   benchmarks: Array<{
 *     name: string,
 *     suite: string,
 *     baselineHz: number | null,
 *     currentHz: number | null,
 *     deltaPct: number | null,
 *     status: string,
 *   }>,
 * }} Comparison report used by CI and PR comments.
 */
function compareReports(currentReport, baselineReport, thresholdPct) {
    const currentEntries = flattenBenchmarks(currentReport);
    const baselineEntries = baselineReport ? flattenBenchmarks(baselineReport) : [];
    const currentByKey = new Map(currentEntries.map((entry) => [entry.matchKey, entry]));
    const baselineByKey = new Map(baselineEntries.map((entry) => [entry.matchKey, entry]));
    const keys = [...new Set([...baselineByKey.keys(), ...currentByKey.keys()])].sort((left, right) =>
        left.localeCompare(right),
    );

    const benchmarks = keys.map((key) => {
        const baselineEntry = baselineByKey.get(key) ?? null;
        const currentEntry = currentByKey.get(key) ?? null;

        if (!baselineEntry) {
            return {
                name: currentEntry?.label ?? key,
                suite: currentEntry?.suite ?? key,
                baselineHz: null,
                currentHz: currentEntry?.hz ?? null,
                deltaPct: null,
                status: 'new',
            };
        }

        if (!currentEntry) {
            return {
                name: baselineEntry.label,
                suite: baselineEntry.suite,
                baselineHz: baselineEntry.hz,
                currentHz: null,
                deltaPct: null,
                status: 'missing',
            };
        }

        const deltaPct = ((currentEntry.hz - baselineEntry.hz) / baselineEntry.hz) * 100;
        let status = 'pass';

        if (deltaPct < thresholdPct * -1) {
            status = 'fail';
        } else if (deltaPct > 0) {
            status = 'improved';
        }

        return {
            name: currentEntry.label,
            suite: currentEntry.suite,
            baselineHz: baselineEntry.hz,
            currentHz: currentEntry.hz,
            deltaPct,
            status,
        };
    });

    const summary = {
        total: benchmarks.length,
        compared: benchmarks.filter((benchmark) => benchmark.deltaPct !== null).length,
        regressions: benchmarks.filter((benchmark) => benchmark.status === 'fail').length,
        improvements: benchmarks.filter((benchmark) => benchmark.status === 'improved').length,
        pass: benchmarks.filter((benchmark) => benchmark.status === 'pass').length,
        newBenchmarks: benchmarks.filter((benchmark) => benchmark.status === 'new').length,
        missingBenchmarks: benchmarks.filter((benchmark) => benchmark.status === 'missing').length,
    };

    return {
        generatedAt: new Date().toISOString(),
        hasBaseline: baselineReport !== null,
        thresholdPct,
        summary,
        benchmarks,
    };
}

/**
 * Formats an ops/sec value for human-readable markdown output.
 *
 * @param {number | null} value Benchmark throughput value.
 * @returns {string} Formatted throughput string.
 */
function formatHz(value) {
    if (value === null) {
        return 'n/a';
    }

    return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * Formats a benchmark delta percentage for markdown output.
 *
 * @param {number | null} value Percentage delta relative to baseline.
 * @returns {string} Formatted delta string.
 */
function formatDelta(value) {
    if (value === null) {
        return 'n/a';
    }

    const sign = value > 0 ? '+' : '';

    return `${sign}${value.toFixed(2)}%`;
}

/**
 * Converts an internal benchmark status into the PR comment label.
 *
 * @param {string} status Internal benchmark status.
 * @returns {string} Human-readable status label.
 */
function formatStatus(status) {
    switch (status) {
        case 'fail':
            return 'FAIL';
        case 'improved':
            return 'IMPROVED';
        case 'new':
            return 'NEW';
        case 'missing':
            return 'MISSING';
        default:
            return 'PASS';
    }
}

/**
 * Escapes a markdown table cell value.
 *
 * @param {string} value Raw markdown cell content.
 * @returns {string} Escaped markdown-safe value.
 */
function escapeMarkdownCell(value) {
    return value.replaceAll('|', '\\|');
}

/**
 * Builds the markdown body for the benchmark PR comment.
 *
 * @param {{
 *   hasBaseline: boolean,
 *   thresholdPct: number,
 *   summary: {
 *     compared: number,
 *     regressions: number,
 *     improvements: number,
 *     newBenchmarks: number,
 *     missingBenchmarks: number,
 *   },
 *   benchmarks: Array<{
 *     name: string,
 *     baselineHz: number | null,
 *     currentHz: number | null,
 *     deltaPct: number | null,
 *     status: string,
 *   }>,
 * }} report Comparison report.
 * @returns {string} Markdown comment body.
 */
function buildMarkdown(report) {
    const lines = [COMMENT_MARKER, '## Tier 1 Benchmark Comparison', ''];

    if (!report.hasBaseline) {
        lines.push(
            'No `main` branch benchmark baseline artifact is available yet. This run produced fresh benchmark results and uploaded them as artifacts.',
            '',
            `Configured regression threshold: ${report.thresholdPct}% slowdown.`,
        );

        return `${lines.join('\n')}\n`;
    }

    lines.push(
        `Compared ${report.summary.compared} benchmarks against the latest \`main\` baseline. Regression threshold: ${report.thresholdPct}% slowdown.`,
        '',
        `Regressions: ${report.summary.regressions} | Improvements: ${report.summary.improvements} | New: ${report.summary.newBenchmarks} | Missing: ${report.summary.missingBenchmarks}`,
        '',
        '<details>',
        '<summary>Benchmark table</summary>',
        '',
        '| Benchmark | Baseline ops/sec | Current ops/sec | Delta | Status |',
        '| --- | ---: | ---: | ---: | --- |',
    );

    for (const benchmark of report.benchmarks) {
        lines.push(
            `| ${escapeMarkdownCell(benchmark.name)} | ${formatHz(benchmark.baselineHz)} | ${formatHz(benchmark.currentHz)} | ${formatDelta(benchmark.deltaPct)} | ${formatStatus(benchmark.status)} |`,
        );
    }

    lines.push('', '</details>');

    return `${lines.join('\n')}\n`;
}

/**
 * Writes a file to disk, creating parent directories when needed.
 *
 * @param {string} filePath Output file path.
 * @param {string} content File contents.
 * @returns {void}
 */
function writeFile(filePath, content) {
    ensureParentDirectory(filePath);
    fs.writeFileSync(filePath, content);
}

/**
 * Runs the benchmark comparison CLI.
 *
 * @returns {void}
 */
function main() {
    const args = parseArgs(process.argv.slice(2));
    const currentReport = readJsonFile(args.current);
    currentReport.__sourceLabel = args.current;
    const baselineReport = args.baseline && fs.existsSync(args.baseline) ? readJsonFile(args.baseline) : null;

    if (baselineReport !== null) {
        baselineReport.__sourceLabel = args.baseline;
    }

    const report = compareReports(currentReport, baselineReport, args.threshold);

    writeFile(args.jsonOut, JSON.stringify(report, null, 2));
    writeFile(args.markdownOut, buildMarkdown(report));
}

main();
