import assert from 'node:assert/strict';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readlinkSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
    entryMatchesDisk,
    listOwnedSurfacePaths,
    planMaintainerEntries,
    syncMaintainerAgents,
    writeEntry,
} from './sync-maintainer-agents.mjs';

/** Run a sync with console output silenced; returns the exit code and the captured stderr. */
function run(options) {
    const originals = { log: console.log, error: console.error };
    let stderr = '';

    console.log = () => {};
    console.error = (line) => {
        stderr += `${line}\n`;
    };

    try {
        return { code: syncMaintainerAgents(options), stderr };
    } finally {
        console.log = originals.log;
        console.error = originals.error;
    }
}

describe('sync-maintainer-agents disk side', () => {
    it('reports missing, wrong-target and orphaned files in check mode, then is clean after a write', () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), 'sync-maintainer-')));

        try {
            // Fixture adapter output: one rendered file and one hook that matches the kit copy verbatim.
            const generated = [
                { path: 'opencode.json', content: '{"a":1}\n' },
                { path: '.codex/hooks/guard.cjs', content: 'kit guard\n' },
            ];
            const readKit = (name) => (name === 'guard.cjs' ? 'kit guard\n' : null);
            const plan = planMaintainerEntries(generated, readKit);
            const symlinkEntry = plan.find((entry) => entry.kind === 'symlink');
            const fileEntry = plan.find((entry) => entry.kind === 'write');

            assert.ok(symlinkEntry && fileEntry);

            // Drift: opencode.json missing, hook symlink points elsewhere, one orphan under an owned dir.
            mkdirSync(join(root, '.codex', 'hooks'), { recursive: true });
            symlinkSync('../../wrong/target.cjs', join(root, '.codex/hooks/guard.cjs'));
            mkdirSync(join(root, '.gemini', 'hooks', 'sub'), { recursive: true });
            writeFileSync(join(root, '.gemini/hooks/sub/stale.cjs'), 'orphan\n');

            assert.equal(entryMatchesDisk(root, fileEntry), false);
            assert.equal(entryMatchesDisk(root, symlinkEntry), false);
            assert.deepEqual(listOwnedSurfacePaths(root).sort(), [
                '.codex/hooks/guard.cjs',
                '.gemini/hooks/sub/stale.cjs',
            ]);

            const check = run({ generated, isCheck: true, root, readKit });

            assert.equal(check.code, 1);
            assert.match(check.stderr, /^ {2}opencode\.json$/mu);
            assert.match(check.stderr, /^ {2}\.codex\/hooks\/guard\.cjs$/mu);
            assert.match(check.stderr, /^ {2}\.gemini\/hooks\/sub\/stale\.cjs \(orphaned\)$/mu);
            assert.equal(existsSync(join(root, 'opencode.json')), false);
            assert.ok(existsSync(join(root, '.gemini/hooks/sub/stale.cjs')));

            assert.equal(run({ generated, isCheck: false, root, readKit }).code, 0);
            assert.equal(readFileSync(join(root, 'opencode.json'), 'utf8'), '{"a":1}\n');
            assert.equal(readlinkSync(join(root, '.codex/hooks/guard.cjs')), symlinkEntry.linkTarget);
            assert.equal(existsSync(join(root, '.gemini/hooks/sub/stale.cjs')), false);
            assert.equal(entryMatchesDisk(root, symlinkEntry), true);
            assert.equal(run({ generated, isCheck: true, root, readKit }).code, 0);

            // writeEntry on its own replaces a regular file with the symlink.
            rmSync(join(root, '.codex/hooks/guard.cjs'));
            writeFileSync(join(root, '.codex/hooks/guard.cjs'), 'regular\n');
            assert.equal(entryMatchesDisk(root, symlinkEntry), false);
            writeEntry(root, symlinkEntry);
            assert.equal(entryMatchesDisk(root, symlinkEntry), true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
