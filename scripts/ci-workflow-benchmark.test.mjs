/**
 * Regression guard for BT-222: benchmarks moved to a local-only baseline/compare workflow and the
 * `benchmark` job was removed from `.github/workflows/ci.yml`, along with the `perf`-label
 * machinery that existed only to retrigger CI for it (the `labeled`/`unlabeled` trigger types, the
 * `changes` job's `label-event` output, and `quality-engine`'s label carve-out). Nothing enforces
 * that shape once it is set up by hand, so a future edit could silently reintroduce a CI benchmark
 * job or its label wiring without anyone noticing until the run-to-run noise problem that motivated
 * removing it in the first place comes back.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const CI_YML_PATH = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const ciYml = readFileSync(CI_YML_PATH, 'utf8');

test('ci.yml has no top-level benchmark job', () => {
    assert.doesNotMatch(ciYml, /^ {2}benchmark:\s*$/m);
});

test('ci.yml does not reference benchmark result/baseline/comparison artifacts or the compare script', () => {
    for (const needle of [
        'benchmark-results',
        'benchmark-baseline',
        'benchmark-comparison',
        'compare-tier-1-benchmarks',
    ]) {
        assert.ok(!ciYml.includes(needle), `ci.yml should not reference "${needle}"`);
    }
});

test('no job carves out the perf label in a conditional', () => {
    // Two known forms: quality-engine's carve-out compared `github.event.label.name`, while the
    // deleted benchmark job's own trigger used `contains(...labels.*.name, 'perf')` - different
    // property paths, so both are checked. The literal 'perf' check alone is broad enough to catch
    // either reintroduction; nothing in ci.yml has a legitimate reason to reference it today.
    assert.doesNotMatch(ciYml, /label\.name\s*==\s*'perf'/);
    assert.doesNotMatch(ciYml, /labels\.\*\.name/);
    assert.doesNotMatch(ciYml, /'perf'/);
});

test('the pull_request trigger does not listen for labeled/unlabeled events', () => {
    assert.doesNotMatch(ciYml, /\blabeled\b/);
    assert.doesNotMatch(ciYml, /\bunlabeled\b/);
});

test('no job reads a label-event output', () => {
    assert.doesNotMatch(ciYml, /label-event/);
});
