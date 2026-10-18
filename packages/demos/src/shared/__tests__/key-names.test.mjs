import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { keyLabel } from '../key-names.js';

describe('keyLabel', () => {
    it('strips the Key and Digit prefixes', () => {
        assert.equal(keyLabel('KeyW'), 'W');
        assert.equal(keyLabel('Digit5'), '5');
    });

    it('uses the system-font arrow glyphs for the arrow keys', () => {
        assert.equal(keyLabel('ArrowUp'), '↑');
        assert.equal(keyLabel('ArrowDown'), '↓');
        assert.equal(keyLabel('ArrowLeft'), '←');
        assert.equal(keyLabel('ArrowRight'), '→');
    });

    it('shortens long named keys', () => {
        assert.equal(keyLabel('Space'), 'Spc');
        assert.equal(keyLabel('Escape'), 'Esc');
        assert.equal(keyLabel('Backspace'), 'Bks');
        assert.equal(keyLabel('Semicolon'), ';');
        assert.equal(keyLabel('Quote'), "'");
    });

    it('shortens numpad keys to Num plus the key', () => {
        assert.equal(keyLabel('Numpad1'), 'Num1');
        assert.equal(keyLabel('NumpadDivide'), 'Num/');
    });

    it('passes any other code through unchanged', () => {
        assert.equal(keyLabel('Tab'), 'Tab');
        assert.equal(keyLabel('NumpadEnter'), 'NumEnter');
    });
});
