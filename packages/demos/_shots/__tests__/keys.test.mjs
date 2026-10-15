/**
 * The key map is the gallery's whole interaction model; a wrong binding is a usability bug.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GALLERY_ACTIONS } from '../gallery.js';
import { BINDINGS, isTypingTarget, KEY_HELP, resolveKey, SHARED_ACTIONS } from '../keys.js';
import { LIGHTBOX_ACTIONS } from '../lightbox.js';

const press = (code, extra = {}) => ({ code, key: code, shiftKey: false, target: { tagName: 'MAIN' }, ...extra });

describe('resolveKey in the gallery', () => {
    it('maps arrows and vi keys to focus moves', () => {
        assert.equal(resolveKey(press('ArrowLeft'), 'gallery'), 'focus-left');
        assert.equal(resolveKey(press('KeyJ'), 'gallery'), 'focus-left');
        assert.equal(resolveKey(press('KeyK'), 'gallery'), 'focus-right');
        assert.equal(resolveKey(press('ArrowDown'), 'gallery'), 'focus-down');
        assert.equal(resolveKey(press('Home'), 'gallery'), 'focus-home');
        assert.equal(resolveKey(press('PageDown'), 'gallery'), 'page-down');
    });

    it('separates g for the focused stack from Shift+G for all', () => {
        assert.equal(resolveKey(press('KeyG'), 'gallery'), 'stack-focused');
        assert.equal(resolveKey(press('KeyG', { shiftKey: true }), 'gallery'), 'stack-all');
    });

    it('opens with Enter or o and toggles selection with Space', () => {
        assert.equal(resolveKey(press('Enter'), 'gallery'), 'open');
        assert.equal(resolveKey(press('KeyO'), 'gallery'), 'open');
        assert.equal(resolveKey(press('Space'), 'gallery'), 'toggle-select');
        assert.equal(resolveKey(press('KeyO', { shiftKey: true }), 'gallery'), 'open-live');
    });

    it('extends selection with Shift+Arrow', () => {
        assert.equal(resolveKey(press('ArrowRight', { shiftKey: true }), 'gallery'), 'extend-right');
    });

    it('maps the work keys', () => {
        assert.equal(resolveKey(press('KeyX'), 'gallery'), 'flag');
        assert.equal(resolveKey(press('KeyM'), 'gallery'), 'note');
        assert.equal(resolveKey(press('KeyE'), 'gallery'), 'export');
        assert.equal(resolveKey(press('KeyY'), 'gallery'), 'copy-path');
        assert.equal(resolveKey(press('KeyC'), 'gallery'), 'capture-selected');
        assert.equal(resolveKey(press('KeyC', { shiftKey: true }), 'gallery'), 'capture-all');
        assert.equal(resolveKey(press('Slash', { key: '/' }), 'gallery'), 'filter');
        assert.equal(resolveKey(press('Slash', { shiftKey: true, key: '?' }), 'gallery'), 'help');
    });

    it('returns null for unbound keys', () => {
        assert.equal(resolveKey(press('KeyZ'), 'gallery'), null);
    });

    it('returns null while a text field has focus, except Escape', () => {
        const input = { tagName: 'INPUT', type: 'search' };

        assert.equal(resolveKey(press('KeyG', { target: input }), 'gallery'), null);
        assert.equal(resolveKey(press('Escape', { target: input }), 'gallery'), 'escape');
    });
});

describe('resolveKey in the lightbox', () => {
    it('navigates and closes', () => {
        assert.equal(resolveKey(press('ArrowRight'), 'lightbox'), 'next');
        assert.equal(resolveKey(press('KeyJ'), 'lightbox'), 'prev');
        assert.equal(resolveKey(press('Escape'), 'lightbox'), 'close');
        assert.equal(resolveKey(press('Enter'), 'lightbox'), 'close');
        assert.equal(resolveKey(press('Space'), 'lightbox'), 'close');
        assert.equal(resolveKey(press('PageDown'), 'lightbox'), 'demo-next');
        assert.equal(resolveKey(press('End'), 'lightbox'), 'last');
    });

    it('zooms with plus, minus, and presets', () => {
        assert.equal(resolveKey(press('Equal', { key: '+', shiftKey: true }), 'lightbox'), 'zoom-in');
        assert.equal(resolveKey(press('Equal', { key: '=' }), 'lightbox'), 'zoom-in');
        assert.equal(resolveKey(press('Minus', { key: '-' }), 'lightbox'), 'zoom-out');
        assert.equal(resolveKey(press('Digit1'), 'lightbox'), 'zoom-1');
        assert.equal(resolveKey(press('Digit4'), 'lightbox'), 'zoom-4');
        assert.equal(resolveKey(press('Digit3', { shiftKey: true, key: '#' }), 'lightbox'), 'grid-toggle');
    });

    it('pans with arrows only when shift is held for fast', () => {
        assert.equal(resolveKey(press('ArrowUp'), 'lightbox'), 'pan-up');
        assert.equal(resolveKey(press('ArrowUp', { shiftKey: true }), 'lightbox'), 'pan-fast-up');
    });
});

describe('help table', () => {
    it('lists every gallery action exactly once', () => {
        const actions = KEY_HELP.map((row) => row.gallery).filter(Boolean);

        assert.equal(new Set(actions).size, actions.length);
        assert.ok(KEY_HELP.some((row) => row.keys.includes('Shift+G')));
    });
});

describe('isTypingTarget', () => {
    it('is true for inputs and textareas, false for the gallery', () => {
        assert.ok(isTypingTarget({ tagName: 'INPUT' }));
        assert.ok(isTypingTarget({ tagName: 'TEXTAREA' }));
        assert.ok(!isTypingTarget({ tagName: 'MAIN' }));
    });
});

describe('every bound action has a handler', () => {
    const unhandled = (actions, handled) =>
        actions.filter((action) => action && !handled.includes(action) && !SHARED_ACTIONS.includes(action));

    it('in the gallery', () => {
        assert.deepEqual(
            unhandled(
                BINDINGS.map(([, , action]) => action),
                GALLERY_ACTIONS,
            ),
            [],
        );
    });

    it('in the lightbox', () => {
        assert.deepEqual(
            unhandled(
                BINDINGS.map(([, , , action]) => action),
                LIGHTBOX_ACTIONS,
            ),
            [],
        );
    });
});
