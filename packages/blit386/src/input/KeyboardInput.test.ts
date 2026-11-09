// @vitest-environment happy-dom

/**
 * Unit tests for {@link KeyboardInput}.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYBOARD_PLAYER1, DEFAULT_KEYBOARD_SINGLE_PLAYER1 } from './defaultKeyboardMap';
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

    it('does not track a letter pressed while Meta is held (macOS sends no keyup for it)', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', metaKey: true, bubbles: true }));

        expect(kb.isKeyDown('KeyA')).toBe(false);
        expect(kb.isKeyPressed('KeyA', undefined, 0)).toBe(false);

        kb.detach();
    });

    it('still tracks the Meta key itself', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'MetaLeft', metaKey: true, bubbles: true }));

        expect(kb.isKeyDown('MetaLeft')).toBe(true);

        kb.detach();
    });

    it('endFrame snapshots for pressed / released edges', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endUpdate();

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true }));

        expect(kb.isKeyPressed('KeyZ', undefined, 0)).toBe(true);

        kb.endUpdate();

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

    it('canvas blur releases held keys so the next keydown is a fresh press edge', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
        kb.endUpdate();
        canvas.dispatchEvent(new Event('blur'));

        expect(kb.isKeyDown('ArrowRight')).toBe(false);

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));

        expect(kb.isKeyPressed('ArrowRight', undefined, tick)).toBe(true);

        const removeSpy = vi.spyOn(canvas, 'removeEventListener');

        kb.detach();

        expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    });

    it('repeatRate > 0 repeats on schedule while held', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endUpdate();

        tick = 10;
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));

        expect(kb.isKeyPressed('ArrowDown', 5, 10)).toBe(true);

        kb.endUpdate();

        expect(kb.isKeyPressed('ArrowDown', 5, 11)).toBe(false);

        expect(kb.isKeyPressed('ArrowDown', 5, 15)).toBe(true);

        kb.detach();
    });

    it('repeatRate 0 uses edge only', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endUpdate();

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', bubbles: true }));

        expect(kb.isKeyPressed('Digit1', 0, 0)).toBe(true);

        kb.endUpdate();

        expect(kb.isKeyPressed('Digit1', 0, 2)).toBe(false);

        kb.detach();
    });

    it('buffers press and release edges across render-only gaps', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endUpdate();

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ', bubbles: true }));

        expect(kb.isKeyPressed('KeyJ', undefined, 0)).toBe(true);
        expect(kb.isKeyReleased('KeyJ')).toBe(true);

        kb.endUpdate();

        expect(kb.isKeyPressed('KeyJ', undefined, 1)).toBe(false);
        expect(kb.isKeyReleased('KeyJ')).toBe(false);

        kb.detach();
    });

    it('retains inputString until endUpdate', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true }));

        expect(kb.getInputString()).toBe('z');

        kb.endUpdate();

        expect(kb.getInputString()).toBe('');

        kb.detach();
    });

    it('ignores keyup for keys that were not held', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        kb.endUpdate();

        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', bubbles: true }));

        expect(kb.isKeyReleased('KeyX')).toBe(false);

        kb.detach();
    });

    it('accumulates typed keys into input string and clears on endFrame', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'H', shiftKey: true, bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', key: 'i', bubbles: true }));

        expect(kb.getInputString()).toBe('Hi');

        kb.endUpdate();

        expect(kb.getInputString()).toBe('');
    });

    it('maps Enter to CR', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }));

        expect(kb.getInputString()).toBe('\x0d');

        kb.detach();
    });

    it('maps NumpadEnter to CR', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'NumpadEnter', key: 'Enter', bubbles: true }));

        expect(kb.getInputString()).toBe('\x0d');

        kb.detach();
    });

    it('IME composition keys type nothing (IME is not supported)', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'Process', bubbles: true }));

        expect(kb.getInputString()).toBe('');

        kb.detach();
    });

    it('ignores keys that carry no character', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Quote', key: 'Dead', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'Unidentified', bubbles: true }));

        expect(kb.getInputString()).toBe('');

        kb.detach();
    });

    it('filters typed characters to printable ASCII 32-126', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: '\u00e9', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Delete', key: '\x7f', bubbles: true }));

        expect(kb.getInputString()).toBe('');

        kb.detach();
    });

    it('maps Backspace to BS in buffer', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', key: 'Backspace', bubbles: true }));

        expect(kb.getInputString()).toBe('\x08');

        kb.detach();
    });

    it('OR button released when last mapped key is released', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = DEFAULT_KEYBOARD_PLAYER1[1 << 0] ?? [];

        kb.endUpdate();

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));

        kb.endUpdate();

        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));

        expect(kb.isButtonReleased(codes)).toBe(true);

        kb.detach();
    });

    it('OR button repeat uses repeatRate while held', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = DEFAULT_KEYBOARD_PLAYER1[1 << 0] ?? [];

        kb.endUpdate();

        tick = 10;
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));

        expect(kb.isButtonPressed(codes, 4, 10)).toBe(true);

        kb.endUpdate();

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

    it('Ctrl and Meta shortcuts type nothing', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', key: 's', ctrlKey: true, bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', metaKey: true, bubbles: true }));

        expect(kb.getInputString()).toBe('');

        kb.detach();
    });

    it('AltGr characters (reported as Ctrl+Alt) still type', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(
            new KeyboardEvent('keydown', { code: 'KeyV', key: '@', ctrlKey: true, altKey: true, bubbles: true }),
        );

        expect(kb.getInputString()).toBe('@');

        kb.detach();
    });

    it('Alt shortcuts that leave the character unchanged type nothing', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        // Windows / Linux: Alt+A reports `a`, Alt+Shift+A reports `A`, Alt+1 reports `1`.
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a', altKey: true, bubbles: true }));
        canvas.dispatchEvent(
            new KeyboardEvent('keydown', { code: 'KeyA', key: 'A', altKey: true, shiftKey: true, bubbles: true }),
        );
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', altKey: true, bubbles: true }));

        expect(kb.getInputString()).toBe('');

        kb.detach();
    });

    it('Alt that changes the character (macOS Option) still types', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        // German Mac layout: Option+L types `@`.
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL', key: '@', altKey: true, bubbles: true }));

        expect(kb.getInputString()).toBe('@');

        kb.detach();
    });

    it('OS key repeat of a held key keeps typing and deleting', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a', repeat: true, bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', key: 'Backspace', bubbles: true }));
        canvas.dispatchEvent(
            new KeyboardEvent('keydown', { code: 'Backspace', key: 'Backspace', repeat: true, bubbles: true }),
        );

        expect(kb.getInputString()).toBe('aa\x08\x08');

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

    it('OR button: a second mapped key pressed while the first is held is not a new press', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = ['Space', 'KeyB'];

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
        kb.endUpdate();
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));

        expect(kb.isButtonPressed(codes, undefined, 2)).toBe(false);

        kb.detach();
    });

    it("OR button: 'single' layout KeyW held then ArrowUp is not a second BTN_UP press", () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = DEFAULT_KEYBOARD_SINGLE_PLAYER1[1 << 0] ?? [];

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
        kb.endUpdate();
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));

        expect(kb.isButtonPressed(codes, undefined, 2)).toBe(false);

        kb.detach();
    });

    it('OR button: releasing one of two held mapped keys is not a release', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = ['Space', 'KeyB'];

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
        kb.endUpdate();
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB', bubbles: true }));

        expect(kb.isButtonReleased(codes)).toBe(false);

        kb.detach();
    });

    it('OR button: handing over from one mapped key to another within a tick is neither a press nor a release', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = ['Space', 'KeyB'];

        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
        kb.endUpdate();
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));

        expect(kb.isButtonPressed(codes, undefined, 2)).toBe(false);
        expect(kb.isButtonReleased(codes)).toBe(false);

        kb.detach();
    });

    it('OR button: a tap between two updates is still one press and one release', () => {
        const canvas = createCanvas();
        const kb = new KeyboardInput();

        kb.attach(canvas, { getTicks: () => tick });

        const codes = ['Space', 'KeyB'];

        kb.endUpdate();
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB', bubbles: true }));

        expect(kb.isButtonPressed(codes, undefined, 1)).toBe(true);
        expect(kb.isButtonReleased(codes)).toBe(true);

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

describe('KeyboardInput any-key helpers', () => {
    let tick = 0;
    let canvas: HTMLCanvasElement;
    let kb: KeyboardInput;

    const down = (code: string): void => {
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };
    const up = (code: string): void => {
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    };

    beforeEach(() => {
        tick = 0;
        canvas = createCanvas();
        kb = new KeyboardInput();
        kb.attach(canvas, { getTicks: () => tick });
        kb.endUpdate();
    });

    afterEach(() => {
        kb.detach();
        document.body.replaceChildren();
    });

    it('isAnyKeyDown is true while at least one key is held', () => {
        expect(kb.isAnyKeyDown()).toBe(false);

        down('KeyA');
        down('KeyB');
        up('KeyA');

        expect(kb.isAnyKeyDown()).toBe(true);

        up('KeyB');

        expect(kb.isAnyKeyDown()).toBe(false);
    });

    it('isAnyKeyPressed fires once on the first key, not while it stays held', () => {
        down('KeyA');

        expect(kb.isAnyKeyPressed(undefined, 0)).toBe(true);

        kb.endUpdate();

        expect(kb.isAnyKeyPressed(undefined, 1)).toBe(false);
    });

    it('isAnyKeyPressed fires for a second key pressed while another is held', () => {
        down('KeyA');
        kb.endUpdate();
        down('KeyB');

        expect(kb.isAnyKeyPressed(undefined, 1)).toBe(true);
    });

    it('isAnyKeyPressed sees a tap that starts and ends between two updates', () => {
        down('KeyJ');
        up('KeyJ');

        expect(kb.isAnyKeyPressed(undefined, 0)).toBe(true);
    });

    it('isAnyKeyPressed repeats on schedule anchored to the earliest held key', () => {
        tick = 10;
        down('ArrowDown');
        kb.endUpdate();

        expect(kb.isAnyKeyPressed(5, 11)).toBe(false);
        expect(kb.isAnyKeyPressed(5, 15)).toBe(true);

        tick = 12;
        down('ArrowUp');
        kb.endUpdate();

        // ArrowUp is held too, but the cadence still follows ArrowDown (tick 10).
        expect(kb.isAnyKeyPressed(5, 15)).toBe(true);
        expect(kb.isAnyKeyPressed(5, 17)).toBe(false);
    });

    it('isAnyKeyPressed ignores a non-positive repeatRate', () => {
        down('KeyA');
        kb.endUpdate();

        expect(kb.isAnyKeyPressed(0, 5)).toBe(false);
        expect(kb.isAnyKeyPressed(-3, 5)).toBe(false);
    });

    it('isAnyKeyPressed is false with nothing held', () => {
        expect(kb.isAnyKeyPressed(5, 5)).toBe(false);
    });

    it('isAnyKeyReleased waits until every key is up', () => {
        down('KeyA');
        down('KeyB');
        kb.endUpdate();

        up('KeyA');

        expect(kb.isAnyKeyReleased()).toBe(false);

        kb.endUpdate();
        up('KeyB');

        expect(kb.isAnyKeyReleased()).toBe(true);

        kb.endUpdate();

        expect(kb.isAnyKeyReleased()).toBe(false);
    });

    it('isAnyKeyReleased is false when a different key is pressed in the same update', () => {
        down('KeyA');
        kb.endUpdate();

        up('KeyA');
        down('KeyB');

        expect(kb.isAnyKeyReleased()).toBe(false);
    });

    it('isAnyKeyReleased sees a tap that starts and ends between two updates', () => {
        down('KeyJ');
        up('KeyJ');

        expect(kb.isAnyKeyReleased()).toBe(true);
    });

    it('window blur reports a release for the keys that were held', () => {
        down('KeyA');
        kb.endUpdate();

        globalThis.window.dispatchEvent(new Event('blur'));

        expect(kb.isAnyKeyDown()).toBe(false);
        expect(kb.isAnyKeyReleased()).toBe(true);
    });

    it('a key held across a blur reports isKeyReleased on the next update, then nothing', () => {
        const codes = DEFAULT_KEYBOARD_PLAYER1[1 << 0] ?? [];

        down('KeyW');
        kb.endUpdate();

        globalThis.window.dispatchEvent(new Event('blur'));

        expect(kb.isKeyDown('KeyW')).toBe(false);
        expect(kb.isKeyReleased('KeyW')).toBe(true);
        expect(kb.isButtonReleased(codes)).toBe(true);

        kb.endUpdate();

        expect(kb.isKeyReleased('KeyW')).toBe(false);
        expect(kb.isAnyKeyReleased()).toBe(false);
        expect(kb.isButtonReleased(codes)).toBe(false);
    });

    it('a canvas blur followed by a window blur reports one release', () => {
        down('Space');
        kb.endUpdate();

        canvas.dispatchEvent(new Event('blur'));
        globalThis.window.dispatchEvent(new Event('blur'));

        const pressed: string[] = [];
        const released: string[] = [];

        kb.collectEdges(pressed, released);

        expect(released).toEqual(['Space']);
        expect(pressed).toEqual([]);
    });
});

describe('KeyboardInput.collectEdges', () => {
    let canvas: HTMLCanvasElement;
    let kb: KeyboardInput;

    const down = (code: string): void => {
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };
    const up = (code: string): void => {
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    };
    const edges = (): { pressed: string[]; released: string[] } => {
        const pressed: string[] = [];
        const released: string[] = [];

        kb.collectEdges(pressed, released);

        return { pressed, released };
    };

    beforeEach(() => {
        canvas = createCanvas();
        kb = new KeyboardInput();
        kb.attach(canvas, { getTicks: () => 0 });
        kb.endUpdate();
    });

    afterEach(() => {
        kb.detach();
        document.body.replaceChildren();
    });

    it('lists a press, then nothing after endUpdate, then the release', () => {
        down('Space');
        expect(edges()).toEqual({ pressed: ['Space'], released: [] });

        kb.endUpdate();
        expect(edges()).toEqual({ pressed: [], released: [] });

        up('Space');
        expect(edges()).toEqual({ pressed: [], released: ['Space'] });
    });

    it('lists a tap that starts and ends between two updates once on each side', () => {
        down('KeyJ');
        up('KeyJ');

        expect(edges()).toEqual({ pressed: ['KeyJ'], released: ['KeyJ'] });
    });

    it('matches isKeyPressed and isKeyReleased for each listed code', () => {
        down('KeyA');
        down('KeyB');
        kb.endUpdate();
        up('KeyA');
        down('KeyC');

        const { pressed, released } = edges();

        expect(pressed).toEqual(['KeyC']);
        expect(released).toEqual(['KeyA']);
        expect(kb.isKeyPressed('KeyC', undefined, 1)).toBe(true);
        expect(kb.isKeyReleased('KeyA')).toBe(true);
    });
});
