import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
    LEDGER_REL,
    NEVER,
    deriveUnits,
    findUncovered,
    mergeLedger,
    parseLedger,
    renderLedger,
    stampLedger,
    syncLedger,
} from './audit-modules.mjs';

/** Write an empty file at `rel` under `root`, creating parents. */
function touch(root, rel) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, '');
}

/** The smallest tree every rule in `deriveUnits` claims something from. */
function makeTree() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'audit-modules-')));

    for (const rel of [
        'packages/blit386/src/audio/AudioManager.ts',
        'packages/blit386/src/audio/AudioManager.test.ts',
        'packages/blit386/src/__test__/setup.ts',
        'packages/blit386/src/docs/consumer.test.ts',
        'packages/blit386/src/BLIT386.ts',
        'packages/blit386/src/BLIT386.test.ts',
        'packages/blit386/scripts/gen.mjs',
        'packages/blit386/docs/api.md',
        'packages/blit386/package.json',
        'packages/blit386/README.md',
        'packages/demos/src/camera.js',
        'packages/demos/src/shared/ui-core.js',
        'packages/demos/plugins/order.js',
        'packages/demos/scripts/capture.mjs',
        'packages/demos/package.json',
        'packages/website/src/index.ts',
        'packages/website/scripts/sync.mjs',
        'packages/website/content/docs/faq.mdx',
        'packages/website/package.json',
        'packages/kit/src/cli.ts',
        'packages/kit/content/hooks/guard.cjs',
        'packages/kit/content/skills/run/SKILL.md',
        'packages/kit/content/docs/input.md',
        'packages/kit/content/AGENTS.md',
        'packages/kit/test/cli.test.mjs',
        'packages/kit/package.json',
        'packages/create-blit386/src/index.ts',
        'packages/create-blit386/templates/base/index.html',
        'packages/create-blit386/package.json',
        'packages/create-blit386/dist/index.js',
        'scripts/audit-modules.mjs',
        '.claude/skills/audit/SKILL.md',
        '.husky/pre-push',
        'README.md',
        'package.json',
    ]) {
        touch(root, rel);
    }

    return root;
}

/** Run with console output silenced; returns the exit code and captured stderr. */
function silenced(fn) {
    const originals = { log: console.log, error: console.error };
    let stderr = '';

    console.log = () => {};
    console.error = (line) => {
        stderr += `${line}\n`;
    };

    try {
        return { code: fn(), stderr };
    } finally {
        console.log = originals.log;
        console.error = originals.error;
    }
}

describe('deriveUnits', () => {
    it('derives one unit per engine source directory, demo file and known area, skipping test-only directories', () => {
        const root = makeTree();

        try {
            const units = deriveUnits(root);
            const keys = units.map((unit) => unit.key);

            assert.ok(keys.includes('engine-audio'));
            assert.ok(!keys.includes('engine-__test__'), 'ignored names are not units');
            assert.equal(
                keys.filter((key) => key === 'engine-docs').length,
                1,
                'src/docs holds only tests, so only the prose unit exists',
            );
            assert.deepEqual(
                units.find((unit) => unit.key === 'engine-entry')?.paths,
                ['packages/blit386/src/BLIT386.ts'],
                'entry files exclude tests',
            );
            assert.ok(keys.includes('demo:camera'));
            assert.ok(!keys.includes('demo:shared'));
            assert.deepEqual(
                units.find((unit) => unit.key === 'demos-build')?.paths,
                ['packages/demos/plugins'],
                'missing dirs are dropped',
            );
            assert.equal(units.find((unit) => unit.key === 'kit-skills')?.kind, 'prose');
            assert.ok(units.find((unit) => unit.key === 'repo-docs')?.paths.includes('packages/blit386/README.md'));
            assert.ok(
                units.find((unit) => unit.key === 'tooling-config')?.paths.includes('packages/blit386/package.json'),
            );
            assert.equal(new Set(keys).size, keys.length, 'keys are unique');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('git worktree checkout', () => {
    it('does not list the worktree .git file as a tooling-config path', () => {
        const root = makeTree();

        try {
            // In a linked worktree `.git` is a file pointing at the real git dir, not a directory.
            writeFileSync(join(root, '.git'), 'gitdir: /nonexistent/.git/worktrees/example\n');

            const units = deriveUnits(root);
            assert.ok(!units.find((unit) => unit.key === 'tooling-config')?.paths.includes('.git'));
            assert.deepEqual(findUncovered(root, units), []);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('gitignored paths', () => {
    it('never derives or reports a path git ignores, so a local draft cannot make CI disagree', () => {
        const root = makeTree();

        try {
            execFileSync('git', ['-C', root, 'init', '-q']);
            writeFileSync(join(root, '.gitignore'), 'RELEASE.md\n.wrangler/\n');
            touch(root, 'RELEASE.md');
            touch(root, 'packages/website/.wrangler/state.json');

            const units = deriveUnits(root);
            assert.ok(!units.find((unit) => unit.key === 'repo-docs')?.paths.includes('RELEASE.md'));
            assert.ok(units.find((unit) => unit.key === 'tooling-config')?.paths.includes('.gitignore'));
            assert.deepEqual(findUncovered(root, units), []);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('findUncovered', () => {
    it('is empty for the fixture tree and reports a new package, directory or file nothing claims', () => {
        const root = makeTree();

        try {
            assert.deepEqual(findUncovered(root, deriveUnits(root)), []);

            touch(root, 'packages/new-package/src/index.ts');
            touch(root, 'packages/demos/experiments/thing.js');
            touch(root, 'packages/kit/content/notes.md');
            touch(root, 'packages/website/content/tests-only/x.test.ts');

            assert.deepEqual(findUncovered(root, deriveUnits(root)), [
                'packages/demos/experiments',
                'packages/kit/content/notes.md',
                'packages/new-package',
            ]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('ledger round trip', () => {
    it('renders compact rows that parse back, keeps human columns on merge, and reports added, re-derived and removed rows', () => {
        const units = [
            { key: 'engine-audio', kind: 'code', paths: ['packages/blit386/src/audio'] },
            { key: 'demo:camera', kind: 'code', paths: ['packages/demos/src/camera.js'] },
        ];
        const first = mergeLedger([], units);
        assert.deepEqual(first.drifted, ['added engine-audio', 'added demo:camera']);

        const text = renderLedger(first.rows);
        assert.ok(
            text.includes('| `engine-audio` | code | packages/blit386/src/audio | - | - |'),
            'one space of padding, never aligned',
        );
        assert.deepEqual(parseLedger(text), first.rows);

        const stamped = first.rows.map((row) =>
            row.key === 'engine-audio' ? { ...row, audited: '2026-11-08', ticket: 'BT-753' } : row,
        );
        const next = mergeLedger(stamped, [
            {
                key: 'engine-audio',
                kind: 'code',
                paths: ['packages/blit386/src/audio', 'packages/blit386/src/audio-extra'],
            },
            { key: 'demo:snake-game', kind: 'code', paths: ['packages/demos/src/snake-game.js'] },
        ]);
        assert.deepEqual(next.drifted, ['re-derived engine-audio', 'added demo:snake-game', 'removed demo:camera']);
        assert.equal(next.rows[0].audited, '2026-11-08');
        assert.equal(next.rows[0].ticket, 'BT-753');
        assert.equal(next.rows[1].audited, NEVER);
    });
});

describe('syncLedger and stampLedger on disk', () => {
    it('fails check mode without a ledger, writes one, passes afterwards, then fails again when a demo appears', () => {
        const root = makeTree();

        try {
            const missing = silenced(() => syncLedger({ root, isCheck: true }));
            assert.equal(missing.code, 1);
            assert.match(missing.stderr, /added engine-audio/u);
            assert.match(missing.stderr, /pnpm run audit:modules/u);

            assert.equal(silenced(() => syncLedger({ root })).code, 0);
            assert.equal(silenced(() => syncLedger({ root, isCheck: true })).code, 0);

            assert.equal(
                silenced(() => stampLedger({ root, date: '2026-11-08', ticket: 'BT-753', keys: ['engine-audio'] }))
                    .code,
                0,
            );
            assert.match(
                readFileSync(join(root, LEDGER_REL), 'utf8'),
                /\| `engine-audio` \| code \| [^|]+ \| 2026-11-08 \| BT-753 \|/u,
            );
            assert.equal(
                silenced(() => stampLedger({ root, date: '2026-11-08', ticket: 'BT-753', keys: ['nope'] })).code,
                1,
            );
            assert.equal(
                silenced(() => stampLedger({ root, date: 'yesterday', ticket: 'BT-753', keys: ['engine-audio'] })).code,
                1,
            );

            touch(root, 'packages/demos/src/new-demo.js');
            const drifted = silenced(() => syncLedger({ root, isCheck: true }));
            assert.equal(drifted.code, 1);
            assert.match(drifted.stderr, /added demo:new-demo/u);

            assert.equal(silenced(() => syncLedger({ root })).code, 0);
            assert.match(
                readFileSync(join(root, LEDGER_REL), 'utf8'),
                /2026-11-08 \| BT-753/u,
                'a resync keeps the stamp',
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('refuses to write while a path has no unit', () => {
        const root = makeTree();

        try {
            touch(root, 'packages/unknown/index.js');
            const result = silenced(() => syncLedger({ root }));
            assert.equal(result.code, 1);
            assert.match(result.stderr, /packages\/unknown/u);
            assert.equal(readFileSync(join(root, '.claude/skills/audit/SKILL.md'), 'utf8'), '');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
