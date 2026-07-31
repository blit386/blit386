// @vitest-environment happy-dom

/**
 * Unit tests for {@link KeyboardInput}.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYBOARD_PLAYER1 } from './defaultKeyboardMap';
import { KeyboardInput } from './KeyboardInput';

const createCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');

    document.body.appendChild(canvas);

    return canvas;
};

describe('KeyboardInput', () => {
    let tick = 0;

    afterEach(() => {
        document.body.replaceChildren();
        tick = 0;
    });

    beforeEach(() => {
        tick = 0;
    });

    it('attach / detach removes listeners without throwing', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });
        kb.detach();
        kb.detach();
    });

    it('keydown adds key; keyUp removes', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));

        expect(kb.isKeyDown('KeyQ')).toBe(true);

        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', bubbles: true }));

        expect(kb.isKeyDown('KeyQ')).toBe(false);

        kb.detach();
    });

    it('ignores duplicate keydown while held', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));

        expect(kb.isKeyDown('KeyA')).toBe(true);

        kb.detach();
    });

    it('endFrame snapshots for pressed / released edges', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endFrame(0);

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true }));

        expect(kb.isKeyPressed('KeyZ', undefined, 0)).toBe(true);

        kb.endFrame(1);

        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', bubbles: true }));

        expect(kb.isKeyReleased('KeyZ')).toBe(true);

        kb.detach();
    });

    it('blur clears held keys and buffers', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));

        expect(kb.isKeyDown('Space')).toBe(true);

        window.dispatchEvent(new Event('blur'));

        expect(kb.isKeyDown('Space')).toBe(false);

        kb.detach();
    });

    it('repeatRate > 0 repeats on schedule while held', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endFrame(0);

        tick = 10;
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));

        expect(kb.isKeyPressed('ArrowDown', 5, 10)).toBe(true);

        kb.endFrame(10);

        expect(kb.isKeyPressed('ArrowDown', 5, 11)).toBe(false);

        expect(kb.isKeyPressed('ArrowDown', 5, 15)).toBe(true);

        kb.detach();
    });

    it('repeatRate 0 uses edge only', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endFrame(0);

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', bubbles: true }));

        expect(kb.isKeyPressed('Digit1', 0, 0)).toBe(true);

        kb.endFrame(1);

        expect(kb.isKeyPressed('Digit1', 0, 2)).toBe(false);

        kb.detach();
    });

    it('buffers press and release edges across render-only gaps', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endUpdate(0);

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ', bubbles: true }));

        expect(kb.isKeyPressed('KeyJ', undefined, 0)).toBe(true);
        expect(kb.isKeyReleased('KeyJ')).toBe(true);

        kb.endUpdate(1);

        expect(kb.isKeyPressed('KeyJ', undefined, 1)).toBe(false);
        expect(kb.isKeyReleased('KeyJ')).toBe(false);

        kb.detach();
    });

    it('retains inputString until endUpdate', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(
            new InputEvent('beforeinput', {
                inputType: 'insertText',
                data: 'z',
                bubbles: true,
            }),
        );

        expect(kb.getInputString()).toBe('z');

        kb.endUpdate(0);

        expect(kb.getInputString()).toBe('');

        kb.detach();
    });

    it('ignores keyup for keys that were not held', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endUpdate(0);

        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', bubbles: true }));

        expect(kb.isKeyReleased('KeyX')).toBe(false);

        kb.detach();
    });

    it('accumulates insertText into input string and clears on endFrame', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(
            new InputEvent('beforeinput', {
                inputType: 'insertText',
                data: 'Hi',
                bubbles: true,
            }),
        );

        expect(kb.getInputString()).toBe('Hi');

        kb.endFrame(0);

        expect(kb.getInputString()).toBe('');
    });

    it('maps insertLineBreak to CR', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(
            new InputEvent('beforeinput', {
                inputType: 'insertLineBreak',
                bubbles: true,
            }),
        );

        expect(kb.getInputString()).toBe('\x0d');

        kb.detach();
    });

    it('maps insertParagraph to CR', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(
            new InputEvent('beforeinput', {
                inputType: 'insertParagraph',
                bubbles: true,
            }),
        );

        expect(kb.getInputString()).toBe('\x0d');

        kb.detach();
    });

    it('insertCompositionText accumulates printable ASCII', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(
            new InputEvent('beforeinput', {
                inputType: 'insertCompositionText',
                data: 'Z',
                bubbles: true,
            }),
        );

        expect(kb.getInputString()).toBe('Z');

        kb.detach();
    });

    it('ignores insertText when data is missing', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(
            new InputEvent('beforeinput', {
                inputType: 'insertText',
                bubbles: true,
            }),
        );

        expect(kb.getInputString()).toBe('');

        kb.detach();
    });

    it('filters insertText to allowed code units only', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(
            new InputEvent('beforeinput', {
                inputType: 'insertText',
                data: '\x07',
                bubbles: true,
            }),
        );

        expect(kb.getInputString()).toBe('');

        kb.detach();
    });

    it('maps deleteContentBackward to backspace in buffer', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(
            new InputEvent('beforeinput', {
                inputType: 'deleteContentBackward',
                bubbles: true,
            }),
        );

        expect(kb.getInputString()).toBe('\x08');

        kb.detach();
    });

    it('OR button released when last mapped key is released', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = DEFAULT_KEYBOARD_PLAYER1[1 << 0] ?? [];

        kb.endFrame(0);

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));

        kb.endFrame(1);

        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));

        expect(kb.isButtonReleased(codes)).toBe(true);

        kb.detach();
    });

    it('OR button repeat uses repeatRate while held', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = DEFAULT_KEYBOARD_PLAYER1[1 << 0] ?? [];

        kb.endFrame(0);

        tick = 10;
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));

        expect(kb.isButtonPressed(codes, 4, 10)).toBe(true);

        kb.endFrame(10);

        expect(kb.isButtonPressed(codes, 4, 14)).toBe(true);

        kb.detach();
    });

    it('Tab and Escape append via keydown', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));

        expect(kb.getInputString()).toBe('\x09\x1b');

        kb.detach();
    });

    it('OR button mapping: BTN_UP player1 reflects KeyW', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = DEFAULT_KEYBOARD_PLAYER1[1 << 0] ?? [];

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));

        expect(kb.isButtonDown(codes)).toBe(true);

        kb.detach();
    });

    it('OR button: BTN_A down if either Space or KeyB', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = DEFAULT_KEYBOARD_PLAYER1[1 << 4] ?? [];

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));

        expect(kb.isButtonDown(codes)).toBe(true);

        kb.detach();
    });

    describe('keyboard scroll capture', () => {
        it('does not call preventDefault when capture is off', () => {
            const canvas = createCanvas();
            const kb = new KeyboardInput();

            kb.attach(canvas, { getTicks: () => tick });

            const arrowEvent = new KeyboardEvent('keydown', {
                code: 'ArrowDown',
                bubbles: true,
                cancelable: true,
            });
            const spaceEvent = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
            const preventArrow = vi.spyOn(arrowEvent, 'preventDefault');
            const preventSpace = vi.spyOn(spaceEvent, 'preventDefault');

            canvas.dispatchEvent(arrowEvent);
            canvas.dispatchEvent(spaceEvent);

            expect(preventArrow).not.toHaveBeenCalled();
            expect(preventSpace).not.toHaveBeenCalled();

            kb.detach();
        });

        it('calls preventDefault for scroll keys when capture is on', () => {
            const canvas = createCanvas();
            const kb = new KeyboardInput();

            kb.attach(canvas, { getTicks: () => tick });
            kb.setIsCapturingScroll(true);

            const arrowEvent = new KeyboardEvent('keydown', {
                code: 'ArrowDown',
                bubbles: true,
                cancelable: true,
            });
            const spaceEvent = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
            const keyWEvent = new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true });
            const preventArrow = vi.spyOn(arrowEvent, 'preventDefault');
            const preventSpace = vi.spyOn(spaceEvent, 'preventDefault');
            const preventKeyW = vi.spyOn(keyWEvent, 'preventDefault');

            canvas.dispatchEvent(arrowEvent);
            canvas.dispatchEvent(spaceEvent);
            canvas.dispatchEvent(keyWEvent);

            expect(preventArrow).toHaveBeenCalled();
            expect(preventSpace).toHaveBeenCalled();
            expect(preventKeyW).not.toHaveBeenCalled();

            kb.detach();
        });

        it('calls preventDefault on key-repeat keydowns while held', () => {
            const canvas = createCanvas();
            const kb = new KeyboardInput();

            kb.attach(canvas, { getTicks: () => tick });
            kb.setIsCapturingScroll(true);

            const first = new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true });
            const repeat = new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true });
            const preventFirst = vi.spyOn(first, 'preventDefault');
            const preventRepeat = vi.spyOn(repeat, 'preventDefault');

            canvas.dispatchEvent(first);
            canvas.dispatchEvent(repeat);

            expect(preventFirst).toHaveBeenCalled();
            expect(preventRepeat).toHaveBeenCalled();
            expect(kb.isKeyDown('ArrowDown')).toBe(true);

            kb.detach();
        });
    });
});
