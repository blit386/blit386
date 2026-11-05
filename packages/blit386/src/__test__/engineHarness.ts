/**
 * Test-only harness that runs the real engine at a chosen display refresh rate.
 *
 * Boots the real {@link BTAPI} on the software backend with a fake canvas, owns the
 * `requestAnimationFrame` clock (and `performance.now()`, which `GameLoop` reads alongside it),
 * dispatches DOM input onto the canvas between frames, and records whatever the test's `read()`
 * returns once per `update()` and once per `render()`. Lets a Vitest test prove that an input
 * edge reaches `update()` at 60, 120 or 144 Hz without a hand check on a real display.
 *
 * Not exported from `BLIT386.ts`, so it never reaches the dist build; `src/__test__/**` is outside
 * coverage. See `docs/reference-testing.md` (Refresh-rate tests).
 */

import { type MockInstance, vi } from 'vitest';

import { Palette } from '../assets/Palette';
import { BTAPI } from '../core/BTAPI';
import type { GameLoop } from '../core/GameLoop';
import type { HardwareSettings, IBTDemo } from '../core/IBTDemo';
import { Vector2i } from '../utils/Vector2i';

/** Logical display size the harness boots with; the fake canvas rect matches it 1:1. */
const DISPLAY_SIZE = new Vector2i(160, 120);

/** Standard-mapping button count on the fake gamepad. */
const PAD_BUTTON_COUNT = 17;

/** Fields a test may set on a dispatched pointer event. */
type PointerFields = {
    pointerId?: number;
    pointerType?: string;
    button?: number;
    buttons?: number;
    clientX?: number;
    clientY?: number;
};

/** Options for {@link startEngine}. */
type EngineHarnessOptions<T> = {
    /** Called once per `update()` and once per `render()`; the results land in `updates` / `renders`. */
    read: () => T;

    /** Merged over the harness defaults (software backend, no splash, no overlay, 160×120, 60 FPS). */
    configure?: Partial<HardwareSettings>;
};

/** Handle returned by {@link startEngine}. */
type EngineHarness<T> = {
    /** One `read()` result per `update()` since start (or since the test cleared the array). */
    updates: T[];

    /** One `read()` result per `render()`. */
    renders: T[];

    /**
     * Advances the clock by `ms` and runs the next `requestAnimationFrame` callback.
     *
     * @returns How many fixed updates that frame ran.
     */
    frame: (ms: number) => number;

    /**
     * Runs `frames` frames at a fixed refresh rate, calling `beforeFrame` before each one.
     *
     * @returns Total fixed updates those frames ran.
     */
    runAt: (hz: number, frames: number, beforeFrame?: (index: number) => void) => number;

    /** Dispatches a pointer event on the canvas; the mouse at the last position by default. */
    pointer: (type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', fields?: PointerFields) => void;

    /** Dispatches a pixel-mode `wheel` event on the canvas. */
    wheel: (deltaY: number) => void;

    /** Dispatches a keyboard event with `KeyboardEvent.code` `code` on the canvas. */
    key: (type: 'keydown' | 'keyup', code: string) => void;

    /**
     * Plugs a standard-mapping pad into `player`'s slot with `pressed` button indices held, or
     * unplugs it with `null`. The engine polls once per rendered frame.
     */
    pad: (player: number, pressed: readonly number[] | null) => void;

    /** Stops the loop, resets the `BTAPI` singleton, and removes every stub the harness installed. */
    dispose: () => void;
};

/**
 * Boots the real engine with a test demo that records `read()` per update and per render.
 *
 * Runs `GameLoop.start()`'s two warm-up frames before resolving, so the next {@link EngineHarness.frame}
 * is the first one that can run an update. Call {@link EngineHarness.dispose} in `afterEach`.
 *
 * @param options - The per-update/per-render reader and optional configure overrides.
 * @returns The harness handle.
 */
export async function startEngine<T>(options: EngineHarnessOptions<T>): Promise<EngineHarness<T>> {
    resetSingleton();

    let clock = 0;
    const frames: FrameRequestCallback[] = [];
    const pads: (Gamepad | null)[] = [null, null, null, null];
    const updates: T[] = [];
    const renders: T[] = [];
    const nowSpy: MockInstance = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const canvas = makeCanvas();
    let lastClient = { clientX: 0, clientY: 0 };

    vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((callback: FrameRequestCallback) => frames.push(callback)),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    Object.defineProperty(globalThis.navigator, 'getGamepads', { configurable: true, value: () => pads });

    const demo: IBTDemo = {
        configure: () => ({
            backend: 'software',
            isSplashEnabled: false,
            isOverlayEnabled: false,
            displaySize: DISPLAY_SIZE,
            targetFPS: 60,
            ...options.configure,
        }),
        init: () => Promise.resolve(true),
        update: () => {
            updates.push(options.read());
        },
        render: () => {
            renders.push(options.read());
        },
    };

    const frame = (ms: number): number => {
        const ticksBefore = BTAPI.instance.getTicks();

        clock += ms;
        frames.shift()?.(clock);

        return BTAPI.instance.getTicks() - ticksBefore;
    };

    const dispatch = (type: string, fields: object): void => {
        canvas.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields));
    };

    const dispose = (): void => {
        (BTAPI.instance as unknown as { loop: GameLoop | null }).loop?.stop();
        resetSingleton();
        nowSpy.mockRestore();
        vi.unstubAllGlobals();
        delete (globalThis.navigator as { getGamepads?: unknown }).getGamepads;
    };

    // No handle exists yet for the test to dispose, so a failed boot cleans up its own stubs.
    try {
        if (!(await BTAPI.instance.init(demo, canvas as unknown as HTMLCanvasElement))) {
            throw new Error('engineHarness: BTAPI.init() returned false.');
        }
    } catch (error) {
        dispose();
        throw error;
    }

    BTAPI.instance.setPalette(new Palette(16));

    frame(0);
    frame(0);
    updates.length = 0;
    renders.length = 0;

    return {
        updates,
        renders,
        frame,
        runAt: (hz, count, beforeFrame) => {
            let ran = 0;

            for (let index = 0; index < count; index++) {
                beforeFrame?.(index);
                ran += frame(1000 / hz);
            }

            return ran;
        },
        pointer: (type, fields = {}) => {
            lastClient = {
                clientX: fields.clientX ?? lastClient.clientX,
                clientY: fields.clientY ?? lastClient.clientY,
            };
            dispatch(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 0, ...fields, ...lastClient });
        },
        wheel: (deltaY) => {
            dispatch('wheel', { deltaX: 0, deltaY, deltaMode: 0, ...lastClient });
        },
        key: (type, code) => {
            dispatch(type, { code, key: code, repeat: false });
        },
        pad: (player, pressed) => {
            // eslint-disable-next-line security/detect-object-injection -- player is a test-chosen slot index
            pads[player] = pressed === null ? null : makePad(player, pressed);
        },
        dispose,
    };
}

/** Clears the private `BTAPI` singleton so each harness boots a fresh engine. */
function resetSingleton(): void {
    (BTAPI as unknown as { _instance: BTAPI | null })._instance = null;
}

/**
 * Builds a 2D context stub with the members the software renderer calls.
 *
 * @returns A minimal `CanvasRenderingContext2D` stand-in.
 */
function make2DContext(): object {
    return {
        imageSmoothingEnabled: false,
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
        }),
        putImageData: () => undefined,
        clearRect: () => undefined,
        drawImage: () => undefined,
    };
}

/**
 * Builds the fake canvas: a real `EventTarget` (so every engine listener fires on dispatch) with
 * the canvas members the engine touches, and a client rect matching the display 1:1.
 *
 * @returns The fake canvas.
 */
function makeCanvas(): EventTarget {
    return Object.assign(new EventTarget(), {
        width: 0,
        height: 0,
        style: {
            width: '',
            height: '',
            touchAction: '',
            cursor: '',
            setProperty: () => undefined,
            getPropertyValue: () => '',
        },
        getContext: (type: string) => (type === '2d' ? make2DContext() : null),
        getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            right: DISPLAY_SIZE.x,
            bottom: DISPLAY_SIZE.y,
            width: DISPLAY_SIZE.x,
            height: DISPLAY_SIZE.y,
        }),
        setPointerCapture: () => undefined,
        releasePointerCapture: () => undefined,
    });
}

/**
 * Builds a connected standard-mapping pad with `pressed` button indices held.
 *
 * @param index - Gamepad slot index.
 * @param pressed - Held button indices.
 * @returns A minimal `Gamepad` stand-in.
 */
function makePad(index: number, pressed: readonly number[]): Gamepad {
    const buttons = Array.from({ length: PAD_BUTTON_COUNT }, (_, button) => {
        const isHeld = pressed.includes(button);

        return { pressed: isHeld, touched: isHeld, value: isHeld ? 1 : 0 };
    });

    return {
        id: 'engineHarness pad',
        index,
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons,
    } as unknown as Gamepad;
}

/** `OffscreenCanvas` stand-in whose 2D context carries the members the software renderer calls. */
class FakeOffscreenCanvas {
    /**
     * @param width - Canvas width.
     * @param height - Canvas height.
     */
    constructor(
        public width: number,
        public height: number,
    ) {}

    /**
     * Returns the 2D context stub, or `null` for any other context type.
     *
     * @param type - Context type.
     * @returns The stub or `null`.
     */
    getContext(type: string): object | null {
        return type === '2d' ? make2DContext() : null;
    }
}
