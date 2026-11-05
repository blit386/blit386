// @vitest-environment happy-dom

/**
 * Unit tests for {@link InputTrace}, driven through real input subsystems and the same
 * record / rollover order `BTAPI`'s game loop uses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BT } from '../BLIT386';
import { Vector2i } from '../utils/Vector2i';
import { GamepadInput } from './GamepadInput';
import { InputTrace } from './InputTrace';
import { KeyboardInput } from './KeyboardInput';
import { PointerInput } from './PointerInput';

const mouse = (type: string, clientX = 0, clientY = 0): PointerEvent =>
    new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
    });

const makePad = (pressed: number[]): Gamepad =>
    ({
        id: 'test-pad',
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, (_, i) => ({
            pressed: pressed.includes(i),
            touched: false,
            value: pressed.includes(i) ? 1 : 0,
        })),
        vibrationActuator: null,
        hapticActuators: [],
    }) as unknown as Gamepad;

describe('InputTrace', () => {
    let canvas: HTMLCanvasElement;
    let pointer: PointerInput;
    let keyboard: KeyboardInput;
    let gamepad: GamepadInput;
    let pads: (Gamepad | null)[];
    let trace: InputTrace;
    let tick: number;

    /** One fixed update, in BTAPI order: record, then roll every clock that update reads. */
    const update = (): void => {
        tick++;
        trace.record('update', tick, pointer, keyboard, gamepad);
        keyboard.endUpdate(tick);
        gamepad.endUpdate(tick);
        pointer.endUpdate();
    };

    /** One rendered frame, in BTAPI order: record, then roll the frame clock and poll pads. */
    const render = (): void => {
        trace.record('render', tick, pointer, keyboard, gamepad);
        pointer.endFrame();
        gamepad.endFrame(tick);
    };

    beforeEach(() => {
        canvas = document.createElement('canvas');
        canvas.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            top: 0,
            right: 320,
            bottom: 240,
            width: 320,
            height: 240,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        })) as unknown as typeof canvas.getBoundingClientRect;
        document.body.appendChild(canvas);

        pads = [null, null, null, null];
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: { getGamepads: vi.fn(() => pads) },
        });

        pointer = new PointerInput();
        pointer.attach(canvas, new Vector2i(320, 240));
        keyboard = new KeyboardInput();
        keyboard.attach(canvas, { getTicks: () => tick });
        gamepad = new GamepadInput();
        gamepad.attach();
        trace = new InputTrace();
        tick = 0;
    });

    afterEach(() => {
        pointer.detach();
        keyboard.detach();
        gamepad.detach();
        document.body.replaceChildren();
        vi.restoreAllMocks();
    });

    it('records nothing until started', () => {
        update();
        render();

        expect(trace.isRecording).toBe(false);
        expect(trace.stop()).toEqual({ entries: [], isTruncated: false });
    });

    it('reports a click to one update and, separately, to the render after it', () => {
        trace.start();
        canvas.dispatchEvent(mouse('pointerdown', 10, 10));
        update();
        update(); // second update in the same frame: the press is already gone for it
        render();
        canvas.dispatchEvent(mouse('pointerup', 10, 10));
        update();
        render();

        const { entries } = trace.stop();
        const presses = (clock: string): number =>
            entries.filter((e) => e.clock === clock && e.pointer.some((p) => p.pressed & BT.BTN_POINTER_A)).length;
        const releases = (clock: string): number =>
            entries.filter((e) => e.clock === clock && e.pointer.some((p) => p.released & BT.BTN_POINTER_A)).length;

        expect(entries.map((e) => [e.clock, e.frame])).toEqual([
            ['update', 0],
            ['update', 0],
            ['render', 0],
            ['update', 1],
            ['render', 1],
        ]);
        expect(presses('update')).toBe(1);
        expect(releases('update')).toBe(1);
        expect(presses('render')).toBe(1);
        expect(releases('render')).toBe(1);
        expect(entries[0]?.pointer).toEqual([{ slot: 0, pressed: BT.BTN_POINTER_A, released: 0, dx: 0, dy: 0 }]);
    });

    it('records the pointer delta on each clock and skips slots with nothing to report', () => {
        canvas.dispatchEvent(mouse('pointermove', 10, 10));
        update();
        render();
        trace.start();
        canvas.dispatchEvent(mouse('pointermove', 14, 7));
        render(); // no update this frame
        update();
        render();

        expect(trace.stop().entries.map((e) => [e.clock, e.pointer])).toEqual([
            ['render', [{ slot: 0, pressed: 0, released: 0, dx: 4, dy: -3 }]],
            ['update', [{ slot: 0, pressed: 0, released: 0, dx: 4, dy: -3 }]],
            ['render', []],
        ]);
    });

    it('keeps a press from a render-only frame for the next update', () => {
        trace.start();
        canvas.dispatchEvent(mouse('pointerdown'));
        render(); // no update this frame
        update();

        const [first, second] = trace.stop().entries;

        expect(first?.clock).toBe('render');
        expect(first?.pointer[0]?.pressed).toBe(BT.BTN_POINTER_A);
        expect(second?.clock).toBe('update');
        expect(second?.pointer[0]?.pressed).toBe(BT.BTN_POINTER_A);
    });

    it('records the wheel total per clock', () => {
        pointer.setIsCapturingScroll(true);
        trace.start();
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, deltaMode: 0, bubbles: true, cancelable: true }));
        render();
        update();

        expect(trace.stop().entries.map((e) => [e.clock, e.wheel])).toEqual([
            ['render', 30],
            ['update', 30],
        ]);
    });

    it('records key edges, which the render after an update no longer sees', () => {
        trace.start();
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
        update();
        render();
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
        update();

        expect(trace.stop().entries.map((e) => e.keys)).toEqual([
            { pressed: ['Space'], released: [] },
            { pressed: [], released: [] },
            { pressed: [], released: ['Space'] },
        ]);
    });

    it('records gamepad edges per player', () => {
        trace.start();
        pads[0] = makePad([0]);
        render(); // polls the pad
        update();
        pads[0] = makePad([]);
        render();
        update();

        const gamepadEdges = trace
            .stop()
            .entries.filter((e) => e.clock === 'update')
            .map((e) => e.gamepad);

        expect(gamepadEdges).toEqual([
            [{ player: 0, pressed: BT.BTN_A, released: 0 }],
            [{ player: 0, pressed: 0, released: BT.BTN_A }],
        ]);
    });

    it('stops at maxEntries and reports the truncation', () => {
        trace.start({ maxEntries: 3 });
        update();
        render();
        update();
        render();

        expect(trace.isRecording).toBe(false);

        const result = trace.stop();

        expect(result.entries).toHaveLength(3);
        expect(result.isTruncated).toBe(true);
    });

    it('starts fresh on every start()', () => {
        trace.start({ maxEntries: 1 });
        update();
        trace.start();
        render();

        expect(trace.stop()).toEqual({
            entries: [expect.objectContaining({ clock: 'render', frame: 0 })],
            isTruncated: false,
        });
    });

    it('rejects a maxEntries that is not a positive integer', () => {
        for (const maxEntries of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001]) {
            expect(() => trace.start({ maxEntries })).toThrow(RangeError);
        }

        expect(trace.isRecording).toBe(false);
        expect(() => trace.start({ maxEntries: 1_000_000 })).not.toThrow();
    });
});
