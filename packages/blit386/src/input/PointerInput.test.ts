// @vitest-environment happy-dom

/**
 * Unit tests for {@link PointerInput}.
 *
 * Verifies the slot-allocation rules, button mapping, coordinate conversion,
 * per-frame reset, lifecycle (attach / detach), and edge-case safe-default
 * behavior of the DOM-backed pointer input subsystem. The test file uses
 * happy-dom for `PointerEvent`, `WheelEvent`, and canvas DOM APIs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOverlayLayout } from '../overlay/layout/layoutHelpers';
import { paletteBandY } from '../overlay/layout/layoutPlan';
import { Overlay } from '../overlay/Overlay';
import { computeGrid } from '../overlay/palette/PaletteView';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { POINTER_SLOT_COUNT, PointerInput } from './PointerInput';

const BTN_POINTER_A = 20;
const BTN_POINTER_B = 21;
const BTN_POINTER_C = 22;
const BTN_POINTER_D = 23;

const DISPLAY_WIDTH = 320;
const DISPLAY_HEIGHT = 240;

const RECT_LEFT = 10;
const RECT_TOP = 20;
const RECT_WIDTH = 640;
const RECT_HEIGHT = 480;

interface BoundingRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Mounts a canvas and stubs `getBoundingClientRect` so coordinate conversion
 * is deterministic.
 */
const createCanvas = (
    rect: BoundingRect = { left: RECT_LEFT, top: RECT_TOP, width: RECT_WIDTH, height: RECT_HEIGHT },
): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');

    canvas.getBoundingClientRect = vi.fn(() => ({
        left: rect.left,
        top: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        width: rect.width,
        height: rect.height,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
    })) as unknown as typeof canvas.getBoundingClientRect;

    document.body.appendChild(canvas);

    return canvas;
};

/**
 * Builds a PointerEvent. happy-dom supports the constructor; we keep this in
 * a helper so the test cases stay terse.
 */
const pointerEvent = (
    type: string,
    init: {
        pointerId: number;
        pointerType?: 'mouse' | 'touch' | 'pen';
        button?: number;
        clientX?: number;
        clientY?: number;
    },
): PointerEvent =>
    new PointerEvent(type, {
        pointerId: init.pointerId,
        pointerType: init.pointerType ?? 'mouse',
        button: init.button ?? 0,
        clientX: init.clientX ?? 0,
        clientY: init.clientY ?? 0,
        bubbles: true,
        cancelable: true,
    });

describe('PointerInput', () => {
    let canvas: HTMLCanvasElement;
    let input: PointerInput;

    beforeEach(() => {
        canvas = createCanvas();
        input = new PointerInput();
        input.attach(canvas, new Vector2i(DISPLAY_WIDTH, DISPLAY_HEIGHT));
    });

    afterEach(() => {
        input.detach();
        canvas.remove();
    });

    describe('construction', () => {
        it('initializes all slots as inactive', () => {
            const fresh = new PointerInput();

            for (let i = 0; i < POINTER_SLOT_COUNT; i++) {
                expect(fresh.isActive(i)).toBe(false);
            }

            expect(fresh.getScrollDelta()).toBe(0);
        });
    });

    describe('attach / detach', () => {
        it('sets canvas.style.touchAction to "pan-y" on attach when scroll capture is not active', () => {
            const c = createCanvas();
            const p = new PointerInput();

            expect(c.style.touchAction).toBe('');
            p.attach(c, new Vector2i(DISPLAY_WIDTH, DISPLAY_HEIGHT));
            expect(c.style.touchAction).toBe('pan-y');

            p.detach();
            c.remove();
        });

        it('restores the original touchAction on detach', () => {
            const c = createCanvas();
            c.style.touchAction = 'manipulation';
            const p = new PointerInput();

            p.attach(c, new Vector2i(DISPLAY_WIDTH, DISPLAY_HEIGHT));
            expect(c.style.touchAction).toBe('pan-y');

            p.detach();
            expect(c.style.touchAction).toBe('manipulation');

            c.remove();
        });

        it('removes listeners on detach so subsequent events are ignored', () => {
            input.detach();

            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            expect(input.isActive(0)).toBe(false);
        });

        it('safe to call detach before attach', () => {
            const p = new PointerInput();

            expect(() => p.detach()).not.toThrow();
        });

        it('safe to call attach twice (re-binds listeners cleanly)', () => {
            const otherCanvas = createCanvas();

            input.attach(otherCanvas, new Vector2i(DISPLAY_WIDTH, DISPLAY_HEIGHT));

            otherCanvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 5,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            expect(input.isActive(0)).toBe(true);

            otherCanvas.remove();
        });

        it('releases active pointer captures on detach', () => {
            const c = createCanvas();
            const p = new PointerInput();
            p.attach(c, new Vector2i(DISPLAY_WIDTH, DISPLAY_HEIGHT));

            // Register a touch contact so a pointerId is tracked in idToSlot.
            c.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 42,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            // Stub hasPointerCapture so detach() believes the capture is active.
            vi.spyOn(c, 'hasPointerCapture').mockReturnValue(true);
            const releaseSpy = vi.spyOn(c, 'releasePointerCapture');

            p.detach();

            expect(releaseSpy).toHaveBeenCalledWith(42);

            vi.restoreAllMocks();
            c.remove();
        });
    });

    describe('cursor management', () => {
        it('hideCursor sets canvas.style.cursor to "none"', () => {
            input.hideCursor();
            expect(canvas.style.cursor).toBe('none');
        });

        it('showCursor restores the cursor value captured at attach time', () => {
            const c = createCanvas();
            c.style.cursor = 'crosshair';
            const p = new PointerInput();

            p.attach(c, new Vector2i(DISPLAY_WIDTH, DISPLAY_HEIGHT));
            p.hideCursor();
            expect(c.style.cursor).toBe('none');

            p.showCursor();
            expect(c.style.cursor).toBe('crosshair');

            p.detach();
            c.remove();
        });

        it('detach restores the cursor saved at attach time', () => {
            const c = createCanvas();
            c.style.cursor = 'wait';
            const p = new PointerInput();

            p.attach(c, new Vector2i(DISPLAY_WIDTH, DISPLAY_HEIGHT));
            p.hideCursor();
            expect(c.style.cursor).toBe('none');

            p.detach();
            expect(c.style.cursor).toBe('wait');

            c.remove();
        });

        it('hideCursor and showCursor are no-ops before attach', () => {
            const p = new PointerInput();

            expect(() => p.hideCursor()).not.toThrow();
            expect(() => p.showCursor()).not.toThrow();
        });
    });

    describe('mouse routing (slot 0)', () => {
        it('routes mouse pointerdown button 0 to slot 0 with BTN_POINTER_A held', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            expect(input.isButtonDown(BTN_POINTER_A, 0)).toBe(true);
            expect(input.isButtonDown(BTN_POINTER_B, 0)).toBe(false);
            expect(input.isButtonDown(BTN_POINTER_C, 0)).toBe(false);
            expect(input.isButtonDown(BTN_POINTER_D, 0)).toBe(false);
            expect(input.isActive(0)).toBe(true);
        });

        it.each([
            { domButton: 0, btn: BTN_POINTER_A, name: 'A (left)' },
            { domButton: 2, btn: BTN_POINTER_B, name: 'B (right)' },
            { domButton: 1, btn: BTN_POINTER_C, name: 'C (middle)' },
            { domButton: 3, btn: BTN_POINTER_D, name: 'D (back)' },
            { domButton: 4, btn: BTN_POINTER_D, name: 'D (forward)' },
        ])('maps DOM button $domButton to BTN_POINTER_$name', ({ domButton, btn }) => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: domButton,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            expect(input.isButtonDown(btn, 0)).toBe(true);
        });

        it('activates slot 0 on a mouse pointermove without a prior pointerdown', () => {
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 }),
            );

            expect(input.isActive(0)).toBe(true);
        });

        it('clears all four mouse buttons and deactivates slot 0 on pointerleave', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 2,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            canvas.dispatchEvent(
                pointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 }),
            );

            expect(input.isButtonDown(BTN_POINTER_A, 0)).toBe(false);
            expect(input.isButtonDown(BTN_POINTER_B, 0)).toBe(false);
            expect(input.isActive(0)).toBe(false);
        });

        it('keeps slot 0 valid after pointerup (only the button releases)', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            canvas.dispatchEvent(
                pointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 50, clientY: 50 }),
            );

            expect(input.isButtonDown(BTN_POINTER_A, 0)).toBe(false);
            expect(input.isActive(0)).toBe(true);
        });

        it('ignores an unknown DOM mouse button code (default case in setMouseButton)', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 5,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            expect(input.isButtonDown(BTN_POINTER_A, 0)).toBe(false);
            expect(input.isButtonDown(BTN_POINTER_B, 0)).toBe(false);
            expect(input.isButtonDown(BTN_POINTER_C, 0)).toBe(false);
            expect(input.isButtonDown(BTN_POINTER_D, 0)).toBe(false);
        });

        it('deactivates mouse slot on pointercancel', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            expect(input.isActive(0)).toBe(true);

            canvas.dispatchEvent(
                pointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 }),
            );

            expect(input.isActive(0)).toBe(false);
        });

        it('handles pointerleave for mouse when slot was never activated (null pointerId path)', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 }),
            );

            expect(input.isActive(0)).toBe(false);
        });
    });

    describe('touch slot allocation', () => {
        it('routes three sequential touches to slots 1, 2, 3 in arrival order', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 100,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 10,
                    clientY: 10,
                }),
            );
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 101,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 20,
                    clientY: 20,
                }),
            );
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 102,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 30,
                    clientY: 30,
                }),
            );

            expect(input.isButtonDown(BTN_POINTER_A, 1)).toBe(true);
            expect(input.isButtonDown(BTN_POINTER_A, 2)).toBe(true);
            expect(input.isButtonDown(BTN_POINTER_A, 3)).toBe(true);
            expect(input.isActive(1)).toBe(true);
            expect(input.isActive(2)).toBe(true);
            expect(input.isActive(3)).toBe(true);
        });

        it('drops a 4th simultaneous touch silently when all slots are full', () => {
            for (let i = 0; i < 4; i++) {
                canvas.dispatchEvent(
                    pointerEvent('pointerdown', {
                        pointerId: 200 + i,
                        pointerType: 'touch',
                        button: 0,
                        clientX: 10,
                        clientY: 10,
                    }),
                );
            }

            // Slots 1-3 occupied; 4th touch should not throw or appear anywhere.
            expect(input.isActive(1)).toBe(true);
            expect(input.isActive(2)).toBe(true);
            expect(input.isActive(3)).toBe(true);
        });

        it('frees a touch slot on pointerup; the next touch reuses it', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 300,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 10,
                    clientY: 10,
                }),
            );
            canvas.dispatchEvent(
                pointerEvent('pointerup', {
                    pointerId: 300,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 10,
                    clientY: 10,
                }),
            );

            expect(input.isActive(1)).toBe(false);

            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 301,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 20,
                    clientY: 20,
                }),
            );

            expect(input.isActive(1)).toBe(true);
        });

        it('frees a touch slot on pointercancel', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 400,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 10,
                    clientY: 10,
                }),
            );

            canvas.dispatchEvent(
                pointerEvent('pointercancel', { pointerId: 400, pointerType: 'touch', clientX: 10, clientY: 10 }),
            );

            expect(input.isActive(1)).toBe(false);
        });

        it('reports BTN_POINTER_B/C/D as false for touch slots even when valid', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 500,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 10,
                    clientY: 10,
                }),
            );

            expect(input.isButtonDown(BTN_POINTER_A, 1)).toBe(true);
            expect(input.isButtonDown(BTN_POINTER_B, 1)).toBe(false);
            expect(input.isButtonDown(BTN_POINTER_C, 1)).toBe(false);
            expect(input.isButtonDown(BTN_POINTER_D, 1)).toBe(false);
            expect(input.isActive(1)).toBe(true);
        });

        it('routes pen input to touch slots 1-3 (not slot 0)', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 600,
                    pointerType: 'pen',
                    button: 0,
                    clientX: 10,
                    clientY: 10,
                }),
            );

            expect(input.isActive(0)).toBe(false);
            expect(input.isActive(1)).toBe(true);
        });

        it('ignores a duplicate pointerdown for the same touch ID', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 900,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 10,
                    clientY: 10,
                }),
            );

            expect(input.isActive(1)).toBe(true);

            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 900,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 20,
                    clientY: 20,
                }),
            );

            expect(input.isActive(1)).toBe(true);
            expect(input.isActive(2)).toBe(false);
        });

        it('ignores touch pointermove with no prior pointerdown (unknown slot)', () => {
            expect(() => {
                canvas.dispatchEvent(
                    pointerEvent('pointermove', { pointerId: 999, pointerType: 'touch', clientX: 50, clientY: 50 }),
                );
            }).not.toThrow();

            expect(input.isActive(1)).toBe(false);
        });

        it('ignores touch pointerup with no prior pointerdown (unknown slot)', () => {
            expect(() => {
                canvas.dispatchEvent(
                    pointerEvent('pointerup', {
                        pointerId: 999,
                        pointerType: 'touch',
                        button: 0,
                        clientX: 50,
                        clientY: 50,
                    }),
                );
            }).not.toThrow();
        });

        it('ignores touch pointercancel with no prior pointerdown (unknown slot)', () => {
            expect(() => {
                canvas.dispatchEvent(
                    pointerEvent('pointercancel', { pointerId: 999, pointerType: 'touch', clientX: 50, clientY: 50 }),
                );
            }).not.toThrow();
        });

        it('frees a touch slot on pointerleave and ignores leave for an unregistered touch ID', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1001,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 10,
                    clientY: 10,
                }),
            );

            expect(input.isActive(1)).toBe(true);

            canvas.dispatchEvent(
                pointerEvent('pointerleave', { pointerId: 1001, pointerType: 'touch', clientX: 10, clientY: 10 }),
            );

            expect(input.isActive(1)).toBe(false);

            expect(() => {
                canvas.dispatchEvent(
                    pointerEvent('pointerleave', { pointerId: 9999, pointerType: 'touch', clientX: 10, clientY: 10 }),
                );
            }).not.toThrow();
        });
    });

    describe('coordinate conversion', () => {
        it('maps clientX/clientY to display coordinates via getBoundingClientRect', () => {
            // rect = { left:10, top:20, width:640, height:480 }
            // clientX 170 -> (170-10)/640 = 0.25 of width -> 0.25 * 320 = 80
            // clientY 140 -> (140-20)/480 = 0.25 of height -> 0.25 * 240 = 60
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 170, clientY: 140 }),
            );

            const pos = input.getPos(0);

            expect(pos.x).toBe(80);
            expect(pos.y).toBe(60);
        });

        it('does not throw on a zero-sized canvas (skips the position update)', () => {
            const c = createCanvas({ left: 0, top: 0, width: 0, height: 0 });
            const p = new PointerInput();

            p.attach(c, new Vector2i(DISPLAY_WIDTH, DISPLAY_HEIGHT));

            expect(() => {
                c.dispatchEvent(
                    pointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 }),
                );
            }).not.toThrow();

            // Position stays at zero since the update is skipped to avoid NaN.
            const pos = p.getPos(0);

            expect(pos.x).toBe(0);
            expect(pos.y).toBe(0);

            p.detach();
            c.remove();
        });
    });

    // The lifecycle model: each rAF tick is "events arrive (between ticks) ->
    // update / render read state -> endFrame snapshots current as prev". The
    // tests simulate one tick by dispatching events (the inter-frame window),
    // querying state (the update / render phase), then calling endFrame.
    describe('endFrame and per-frame state', () => {
        it('reports delta from prev snapshot to current pos', () => {
            // Tick 1 inter-frame: activation move. Slot 0 becomes valid and
            // its prevPos is synced to the entry pos so the first delta is
            // zero (see "reports zero delta on the first frame after mouse
            // activation"). Closing tick 1 with endFrame leaves prev = pos.
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 170, clientY: 140 }),
            );
            input.endFrame();

            // Tick 2 inter-frame: a single further move.
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 186, clientY: 156 }),
            );

            // Tick 2 update: delta = current pos – prev pos snapshotted at
            // the end of tick 1.
            // rect = { left:10, top:20, width:640, height:480 }, display 320x240.
            // (170, 140) -> (80, 60).  (186, 156) -> (88, 68).
            // Expected delta = (88 – 80, 68 – 60) = (8, 8).
            const delta = input.getDelta(0);
            expect(delta.x).toBe(8);
            expect(delta.y).toBe(8);
        });

        it('zeroes delta after endFrame snapshots the new prevPos', () => {
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 60 }),
            );

            input.endFrame();

            // Without further movement, the next read sees no delta.
            const delta = input.getDelta(0);
            expect(delta.x).toBe(0);
            expect(delta.y).toBe(0);
        });

        it('zeroes scrollDelta on endFrame', () => {
            input.setIsCapturingScroll(true);
            canvas.dispatchEvent(
                new WheelEvent('wheel', { deltaY: 100, deltaMode: 0, bubbles: true, cancelable: true }),
            );

            expect(input.getScrollDelta()).toBe(100);

            input.endFrame();

            expect(input.getScrollDelta()).toBe(0);
        });

        it('reports isButtonPressed only on the tick after the button transitions to down', () => {
            // Inter-frame window: button goes down.
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            // First tick after the down event sees the press edge.
            expect(input.isButtonPressed(BTN_POINTER_A, 0)).toBe(true);

            input.endFrame();

            // Subsequent tick: button is still held but no new edge.
            expect(input.isButtonPressed(BTN_POINTER_A, 0)).toBe(false);
            expect(input.isButtonDown(BTN_POINTER_A, 0)).toBe(true);
        });

        it('reports isButtonReleased only on the tick after the button transitions to up', () => {
            // Tick 1 inter-frame: button goes down.
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );
            input.endFrame();

            // Tick 2 inter-frame: button goes up.
            canvas.dispatchEvent(
                pointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 50, clientY: 50 }),
            );

            expect(input.isButtonReleased(BTN_POINTER_A, 0)).toBe(true);

            input.endFrame();

            expect(input.isButtonReleased(BTN_POINTER_A, 0)).toBe(false);
        });

        it('preserves pos and delta on the touch-release frame', () => {
            // Simulates a tick lifecycle with a touch landing, dragging, then
            // releasing – the demo's drag-and-flick pattern. The release-frame
            // delta must reflect the final movement so the demo can use it as
            // throw velocity.

            // Tick 1 inter-frame: touch lands.
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 700,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 170,
                    clientY: 140,
                }),
            );
            input.endFrame();

            // Tick 2 inter-frame: touch moves a small step.
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 700, pointerType: 'touch', clientX: 178, clientY: 148 }),
            );
            input.endFrame();

            // Tick 3 inter-frame: touch moves further, then releases.
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 700, pointerType: 'touch', clientX: 186, clientY: 156 }),
            );
            canvas.dispatchEvent(
                pointerEvent('pointerup', {
                    pointerId: 700,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 186,
                    clientY: 156,
                }),
            );

            // Tick 3 update: must see the release edge AND a non-zero delta
            // representing the final movement (so a demo can throw with it).
            expect(input.isButtonReleased(BTN_POINTER_A, 1)).toBe(true);

            const releasePos = input.getPos(1);
            const releaseDelta = input.getDelta(1);

            // clientX 186 in a 640-wide rect at left=10 is (186-10)/640 = 0.275 -> 0.275 * 320 = 88.
            // clientX 178 -> (178-10)/640 = 0.2625 -> 0.2625 * 320 = 84.
            // So the final movement of the tick is from (84, 50) to (88, 53).
            expect(releasePos.x).toBe(88);
            expect(releaseDelta.x).toBeGreaterThan(0);
            expect(releaseDelta.y).toBeGreaterThan(0);
        });

        it('preserves pos and delta on the mouse-release frame', () => {
            // Mirrors the touch-release flick test but uses mouse on slot 0. The
            // release-frame delta must reflect the final movement so a demo can
            // use it as throw velocity.

            // Tick 1 inter-frame: mouse button pressed.
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 170,
                    clientY: 140,
                }),
            );
            input.endFrame();

            // Tick 2 inter-frame: mouse moves a small step.
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 178, clientY: 148 }),
            );
            input.endFrame();

            // Tick 3 inter-frame: mouse moves further, then releases.
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 186, clientY: 156 }),
            );
            canvas.dispatchEvent(
                pointerEvent('pointerup', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 186,
                    clientY: 156,
                }),
            );

            // Tick 3 update: must see the release edge AND a non-zero delta
            // representing the final movement (so a demo can throw with it).
            expect(input.isButtonReleased(BTN_POINTER_A, 0)).toBe(true);

            const releasePos = input.getPos(0);
            const releaseDelta = input.getDelta(0);

            // clientX 186 in a 640-wide rect at left=10: (186-10)/640 * 320 = 88.
            // clientX 178 -> (178-10)/640 * 320 = 84. Final movement: (84,64) -> (88,68).
            expect(releasePos.x).toBe(88);
            expect(releaseDelta.x).toBeGreaterThan(0);
            expect(releaseDelta.y).toBeGreaterThan(0);
        });

        it('reports zero delta on the first frame after touch activation', () => {
            // Without prevPos sync on activation, the very first frame's
            // delta would be (touchPos – 0) which feeds a phantom velocity
            // into demos that read pointerDelta on the press frame.
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 800,
                    pointerType: 'touch',
                    button: 0,
                    clientX: 170,
                    clientY: 140,
                }),
            );

            const delta = input.getDelta(1);

            expect(delta.x).toBe(0);
            expect(delta.y).toBe(0);
        });

        it('reports zero delta on the first frame after mouse activation', () => {
            canvas.dispatchEvent(
                pointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 170, clientY: 140 }),
            );

            const delta = input.getDelta(0);

            expect(delta.x).toBe(0);
            expect(delta.y).toBe(0);
        });

        it('does not lose the press edge when down events arrive between ticks', () => {
            // Regression test for the original bug: with prev snapshotted at
            // start-of-tick, an event between tick N and tick N+1 would set
            // a=true, then beginFrame N+1 would copy prev=true, hiding the
            // press from update. With endFrame timing, prev = "a at last
            // endFrame" = false, so the transition is correctly observed.
            input.endFrame(); // tick 1 end, no events

            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 2,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            // Tick 2 update: must see the press edge.
            expect(input.isButtonPressed(BTN_POINTER_B, 0)).toBe(true);
        });

        it('reports isButtonPressed for BTN_POINTER_C and BTN_POINTER_D on their press frames', () => {
            // Before any press: covers the short-circuit false path for C and D.
            expect(input.isButtonPressed(BTN_POINTER_C, 0)).toBe(false);
            expect(input.isButtonPressed(BTN_POINTER_D, 0)).toBe(false);

            // Press C (DOM button 1 = middle).
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 1,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            expect(input.isButtonPressed(BTN_POINTER_C, 0)).toBe(true);

            input.endFrame();

            expect(input.isButtonPressed(BTN_POINTER_C, 0)).toBe(false);

            // Press D (DOM button 3 = back).
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 3,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            expect(input.isButtonPressed(BTN_POINTER_D, 0)).toBe(true);

            input.endFrame();

            expect(input.isButtonPressed(BTN_POINTER_D, 0)).toBe(false);
        });

        it('reports isButtonReleased for BTN_POINTER_B, BTN_POINTER_C, and BTN_POINTER_D on their release frames', () => {
            // Press B, C, D together.
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 2,
                    clientX: 50,
                    clientY: 50,
                }),
            );
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 1,
                    clientX: 50,
                    clientY: 50,
                }),
            );
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 3,
                    clientX: 50,
                    clientY: 50,
                }),
            );
            input.endFrame();

            // Release B; C and D still held.
            canvas.dispatchEvent(
                pointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 2, clientX: 50, clientY: 50 }),
            );

            expect(input.isButtonReleased(BTN_POINTER_B, 0)).toBe(true);
            // C still held: !s.c is false, covers the short-circuit false path for C.
            expect(input.isButtonReleased(BTN_POINTER_C, 0)).toBe(false);
            expect(input.isButtonReleased(BTN_POINTER_D, 0)).toBe(false);

            input.endFrame();

            // Release C.
            canvas.dispatchEvent(
                pointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 1, clientX: 50, clientY: 50 }),
            );

            expect(input.isButtonReleased(BTN_POINTER_C, 0)).toBe(true);

            input.endFrame();

            // Release D.
            canvas.dispatchEvent(
                pointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 3, clientX: 50, clientY: 50 }),
            );

            expect(input.isButtonReleased(BTN_POINTER_D, 0)).toBe(true);
        });
    });

    describe('wheel handling', () => {
        beforeEach(() => {
            input.setIsCapturingScroll(true);
        });

        it('ignores wheel events when capture is off', () => {
            input.setIsCapturingScroll(false);
            const wheelEvent = new WheelEvent('wheel', { deltaY: 5, deltaMode: 0, bubbles: true, cancelable: true });
            const preventDefault = vi.spyOn(wheelEvent, 'preventDefault');

            canvas.dispatchEvent(wheelEvent);

            expect(preventDefault).not.toHaveBeenCalled();
            expect(input.getScrollDelta()).toBe(0);
        });

        it('captures wheel when scroll capture is forced without configure opt-in', () => {
            input.setIsCapturingScroll(false);
            input.setIsScrollCaptureForced(true);
            const wheelEvent = new WheelEvent('wheel', { deltaY: 5, deltaMode: 0, bubbles: true, cancelable: true });
            const preventDefault = vi.spyOn(wheelEvent, 'preventDefault');

            canvas.dispatchEvent(wheelEvent);

            expect(preventDefault).toHaveBeenCalled();
            expect(input.getScrollDelta()).toBe(5);
        });

        it('uses raw deltaY for deltaMode 0 (PIXEL)', () => {
            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 5, deltaMode: 0, bubbles: true, cancelable: true }));

            expect(input.getScrollDelta()).toBe(5);
        });

        it('multiplies deltaY by 16 for deltaMode 1 (LINE)', () => {
            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 5, deltaMode: 1, bubbles: true, cancelable: true }));

            expect(input.getScrollDelta()).toBe(80);
        });

        it('multiplies deltaY by window.innerHeight for deltaMode 2 (PAGE)', () => {
            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 5, deltaMode: 2, bubbles: true, cancelable: true }));

            expect(input.getScrollDelta()).toBe(5 * window.innerHeight);
        });

        it('accumulates multiple wheel events within a frame', () => {
            canvas.dispatchEvent(
                new WheelEvent('wheel', { deltaY: 10, deltaMode: 0, bubbles: true, cancelable: true }),
            );
            canvas.dispatchEvent(
                new WheelEvent('wheel', { deltaY: -3, deltaMode: 0, bubbles: true, cancelable: true }),
            );

            expect(input.getScrollDelta()).toBe(7);
        });

        it('calls preventDefault on wheel events', () => {
            const wheelEvent = new WheelEvent('wheel', { deltaY: 5, deltaMode: 0, bubbles: true, cancelable: true });
            const preventDefault = vi.spyOn(wheelEvent, 'preventDefault');

            canvas.dispatchEvent(wheelEvent);

            expect(preventDefault).toHaveBeenCalled();
        });
    });

    describe('touch-action gating', () => {
        it('leaves touchAction as "pan-y" when capture is off and not forced', () => {
            expect(canvas.style.touchAction).toBe('pan-y');
        });

        it('sets touchAction to "none" when scroll capture is forced without configure opt-in', () => {
            input.setIsScrollCaptureForced(true);

            expect(canvas.style.touchAction).toBe('none');
        });

        it('sets touchAction to "none" when setIsCapturingScroll(true) is called', () => {
            input.setIsCapturingScroll(true);

            expect(canvas.style.touchAction).toBe('none');
        });

        it('reverts touchAction to "pan-y" when setIsCapturingScroll(false) is called', () => {
            input.setIsCapturingScroll(true);
            input.setIsCapturingScroll(false);

            expect(canvas.style.touchAction).toBe('pan-y');
        });

        it('reverts touchAction to "pan-y" when setIsScrollCaptureForced(false) is called and capture is not active', () => {
            input.setIsScrollCaptureForced(true);
            input.setIsScrollCaptureForced(false);

            expect(canvas.style.touchAction).toBe('pan-y');
        });

        it('keeps touchAction "none" when setIsScrollCaptureForced(false) is called but setIsCapturingScroll is still true', () => {
            input.setIsCapturingScroll(true);
            input.setIsScrollCaptureForced(true);
            input.setIsScrollCaptureForced(false);

            expect(canvas.style.touchAction).toBe('none');
        });

        it('does not throw when setIsCapturingScroll is called before attach', () => {
            const fresh = new PointerInput();

            expect(() => fresh.setIsCapturingScroll(true)).not.toThrow();
        });

        it('does not throw when setIsScrollCaptureForced is called before attach', () => {
            const fresh = new PointerInput();

            expect(() => fresh.setIsScrollCaptureForced(true)).not.toThrow();
        });
    });

    describe('touch-action gating via overlay palette band', () => {
        /**
         * Converts a logical display coordinate to the physical `clientX`/`clientY` the
         * happy-dom canvas expects, given the 2x CSS scale set up by {@link createCanvas}.
         */
        const toClient = (x: number, y: number): { clientX: number; clientY: number } => ({
            clientX: RECT_LEFT + ((x + 0.5) / DISPLAY_WIDTH) * RECT_WIDTH,
            clientY: RECT_TOP + ((y + 0.5) / DISPLAY_HEIGHT) * RECT_HEIGHT,
        });

        it('forces touchAction to "none" for a touch starting over the palette band, without configure opt-in', () => {
            const overlay = new Overlay(
                createOverlayLayout(DISPLAY_WIDTH, DISPLAY_HEIGHT, 14),
                'Test Demo',
                60,
                'webgpu',
                undefined,
                true,
                undefined,
                undefined,
                false,
                undefined,
                undefined,
                false,
                false,
                true,
            );
            const grid = computeGrid(DISPLAY_WIDTH);
            const paletteBandTop = paletteBandY(DISPLAY_HEIGHT, grid.totalHeight);
            const paletteBand = new Rect2i(0, paletteBandTop, DISPLAY_WIDTH, grid.totalHeight);

            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 300,
                    pointerType: 'touch',
                    button: 0,
                    ...toClient(paletteBand.x, paletteBand.y),
                }),
            );

            overlay.handleFrameInput(input, false, 1);

            expect(canvas.style.touchAction).toBe('none');
        });

        it('leaves touchAction as "pan-y" for a touch starting outside the palette band', () => {
            const overlay = new Overlay(
                createOverlayLayout(DISPLAY_WIDTH, DISPLAY_HEIGHT, 14),
                'Test Demo',
                60,
                'webgpu',
                undefined,
                true,
                undefined,
                undefined,
                false,
                undefined,
                undefined,
                false,
                false,
                true,
            );

            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 301,
                    pointerType: 'touch',
                    button: 0,
                    ...toClient(0, 0),
                }),
            );

            overlay.handleFrameInput(input, false, 1);

            expect(canvas.style.touchAction).toBe('pan-y');
        });
    });

    describe('context menu suppression', () => {
        it('calls preventDefault on contextmenu events', () => {
            const event = new Event('contextmenu', { bubbles: true, cancelable: true });
            const preventDefault = vi.spyOn(event, 'preventDefault');

            canvas.dispatchEvent(event);

            expect(preventDefault).toHaveBeenCalled();
        });
    });

    describe('out-of-range slot index', () => {
        it.each([-1, POINTER_SLOT_COUNT, 99, 1.5, Number.NaN])('returns safe defaults for slot %s', (slot) => {
            const pos = input.getPos(slot);
            const delta = input.getDelta(slot);

            expect(pos.x).toBe(0);
            expect(pos.y).toBe(0);
            expect(delta.x).toBe(0);
            expect(delta.y).toBe(0);
            expect(input.isButtonDown(BTN_POINTER_A, slot)).toBe(false);
            expect(input.isButtonPressed(BTN_POINTER_A, slot)).toBe(false);
            expect(input.isButtonReleased(BTN_POINTER_A, slot)).toBe(false);
            expect(input.isActive(slot)).toBe(false);
        });

        it('returns false for unknown button codes', () => {
            canvas.dispatchEvent(
                pointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    button: 0,
                    clientX: 50,
                    clientY: 50,
                }),
            );

            expect(input.isButtonDown(99, 0)).toBe(false);
            expect(input.isButtonPressed(99, 0)).toBe(false);
            expect(input.isButtonReleased(99, 0)).toBe(false);
        });
    });
});
