/**
 * The public sheet runs the gallery in link mode: tiles are plain links, so the review page's
 * selection, view and capture actions must not run there, and must not report themselves as
 * handled (the sheet calls preventDefault on a handled key, which would swallow Space-to-scroll).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGallery } from '../gallery.js';
import { resolveKey } from '../keys.js';

const press = (code, shiftKey = false) => ({ code, key: code, shiftKey, target: { tagName: 'BODY' } });

describe('createGallery in link mode', () => {
    const gallery = createGallery(
        {},
        {
            imageUrl: () => null,
            tileLink: (entry) => ({ href: entry.slug, label: entry.slug }),
            onOpen: () => {},
        },
    );

    for (const [code, shift] of [
        ['KeyC', false],
        ['KeyC', true],
        ['Space', false],
        ['KeyA', false],
        ['KeyA', true],
        ['KeyG', false],
        ['KeyG', true],
        ['KeyL', false],
        ['KeyV', false],
        ['ArrowRight', true],
    ]) {
        const action = resolveKey(press(code, shift), 'gallery');

        it(`does not handle ${action} (${shift ? 'Shift+' : ''}${code})`, () => {
            assert.equal(gallery.handleAction(action), false);
        });
    }

    it('still answers open', () => {
        assert.equal(gallery.handleAction('open'), true);
    });
});
