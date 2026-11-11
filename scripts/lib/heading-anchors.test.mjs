import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { headingAnchors } from './heading-anchors.mjs';

describe('headingAnchors', () => {
    it('slugs every ATX heading the way blit386.dev does', () => {
        const markdown = [
            '# Overlay',
            '',
            '### Custom rows (optional)',
            '### `Bloom` - soft phosphor glow',
            '#### [ShoeBox](https://renderhjs.net/shoebox/) (cross-platform)',
            '## Closed heading ##',
        ].join('\n');

        assert.deepEqual(
            [...headingAnchors(markdown)],
            [
                'overlay',
                'custom-rows-optional',
                'bloom---soft-phosphor-glow',
                'shoebox-cross-platform',
                'closed-heading',
            ],
        );
    });

    it('numbers a repeated heading like the site does', () => {
        assert.deepEqual([...headingAnchors('## Usage\n\n## Usage\n')], ['usage', 'usage-1']);
    });

    it('skips heading-like lines inside fenced code', () => {
        assert.deepEqual([...headingAnchors('## Real\n\n```sh\n# a shell comment\n```\n')], ['real']);
    });
});
