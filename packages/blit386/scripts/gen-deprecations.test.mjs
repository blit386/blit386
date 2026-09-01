import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    groupMigrationSections,
    parseCliArgs,
    renderDeprecationsMarkdown,
    renderRenameBullets,
} from './gen-deprecations.mjs';

/** A small fixture registry covering every shape the generator has to handle. */
const FIXTURE_MIGRATIONS = [
    {
        id: '2026-01-01-package-rename',
        date: '2026-01-01',
        since: '1.1.0',
        summary: 'Package renamed.',
        renames: [{ from: 'old-pkg', to: 'new-pkg', kind: 'importPath', safety: 'auto' }],
    },
    {
        id: '2026-02-01-empty',
        date: '2026-02-01',
        since: '1.2.0',
        summary: 'No source rename, config-only.',
        renames: [],
    },
    {
        id: '2026-03-01-naming',
        date: '2026-03-01',
        since: '1.0.0',
        summary: 'Naming refactor.',
        renames: [
            {
                from: 'oldCall',
                to: 'newCall',
                kind: 'memberCall',
                safety: 'auto',
                receiver: 'BT',
                section: '`BT` namespace',
                removalTarget: '2.0.0',
            },
            {
                from: 'oldKey',
                to: 'newKey',
                kind: 'objectKey',
                safety: 'auto',
                section: '`HardwareSettings` compatibility fields',
                removalTarget: '2.0.0',
            },
            {
                from: 'equals',
                to: 'isEqual',
                kind: 'method',
                safety: 'review',
                section: 'Class method aliases',
                removalTarget: '2.0.0',
                receiverClasses: ['Vector2i', 'Rect2i'],
            },
        ],
    },
];

describe('renderRenameBullets', () => {
    it('renders a memberCall rename as one receiver-qualified bullet', () => {
        const bullets = renderRenameBullets({
            from: 'oldCall',
            to: 'newCall',
            kind: 'memberCall',
            safety: 'auto',
            receiver: 'BT',
        });

        assert.deepEqual(bullets, ['- `BT.oldCall()` → `BT.newCall()`']);
    });

    it('renders an objectKey rename with no parens', () => {
        const bullets = renderRenameBullets({ from: 'oldKey', to: 'newKey', kind: 'objectKey', safety: 'auto' });

        assert.deepEqual(bullets, ['- `oldKey` → `newKey`']);
    });

    it('expands receiverClasses into one bullet per class, in array order', () => {
        const bullets = renderRenameBullets({
            from: 'equals',
            to: 'isEqual',
            kind: 'method',
            safety: 'review',
            receiverClasses: ['Vector2i', 'Rect2i', 'Color32'],
        });

        assert.deepEqual(bullets, [
            '- `Vector2i.equals()` → `Vector2i.isEqual()`',
            '- `Rect2i.equals()` → `Rect2i.isEqual()`',
            '- `Color32.equals()` → `Color32.isEqual()`',
        ]);
    });
});

describe('groupMigrationSections', () => {
    it('skips renames with no section field', () => {
        const groups = groupMigrationSections(FIXTURE_MIGRATIONS[0]);

        assert.deepEqual(groups, []);
    });

    it('returns no groups for a migration with an empty renames array', () => {
        const groups = groupMigrationSections(FIXTURE_MIGRATIONS[1]);

        assert.deepEqual(groups, []);
    });

    it('groups sectioned renames in first-seen order, carrying each group removalTarget', () => {
        const groups = groupMigrationSections(FIXTURE_MIGRATIONS[2]);

        assert.equal(groups.length, 3);
        assert.equal(groups[0].section, '`BT` namespace');
        assert.equal(groups[0].removalTarget, '2.0.0');
        assert.deepEqual(groups[0].bullets, ['- `BT.oldCall()` → `BT.newCall()`']);
        assert.equal(groups[2].section, 'Class method aliases');
        assert.deepEqual(groups[2].bullets, [
            '- `Vector2i.equals()` → `Vector2i.isEqual()`',
            '- `Rect2i.equals()` → `Rect2i.isEqual()`',
        ]);
    });
});

describe('renderDeprecationsMarkdown', () => {
    it('is deterministic: two runs produce byte-identical output', () => {
        const first = renderDeprecationsMarkdown(FIXTURE_MIGRATIONS);
        const second = renderDeprecationsMarkdown(FIXTURE_MIGRATIONS);

        assert.equal(first, second);
    });

    it('omits importPath-only and empty-renames migrations without special-casing', () => {
        const markdown = renderDeprecationsMarkdown(FIXTURE_MIGRATIONS);

        assert.ok(!markdown.includes('2026-01-01'), 'importPath-only migration must not render a section');
        assert.ok(!markdown.includes('2026-02-01'), 'empty-renames migration must not render a section');
        assert.ok(markdown.includes('## 2026-03-01 – compatibility aliases added'));
    });

    it('renders the generated header and every included group heading', () => {
        const markdown = renderDeprecationsMarkdown(FIXTURE_MIGRATIONS);

        assert.ok(markdown.includes('This file is generated'));
        assert.ok(markdown.includes('### `BT` namespace'));
        assert.ok(markdown.includes('### `HardwareSettings` compatibility fields'));
        assert.ok(markdown.includes('### Class method aliases'));
        assert.ok(markdown.includes('Removal target: 2.0.0'));
    });

    it('reports drift when the input changes', () => {
        const before = renderDeprecationsMarkdown(FIXTURE_MIGRATIONS);
        const changed = [
            ...FIXTURE_MIGRATIONS.slice(0, 2),
            { ...FIXTURE_MIGRATIONS[2], renames: FIXTURE_MIGRATIONS[2].renames.slice(0, 1) },
        ];
        const after = renderDeprecationsMarkdown(changed);

        assert.notEqual(before, after);
    });
});

describe('parseCliArgs', () => {
    it('defaults isCheck to false with no flags', () => {
        assert.deepEqual(parseCliArgs([]), { isCheck: false });
    });

    it('sets isCheck when --check is passed', () => {
        assert.deepEqual(parseCliArgs(['--check']), { isCheck: true });
    });
});
