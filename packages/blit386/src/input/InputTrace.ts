/**
 * Dev-only input-edge trace (BT-744).
 *
 * Records, for each fixed `update()` and each rendered frame, which pointer, key and gamepad
 * edges were live, plus the wheel total and pointer delta that clock saw. An agent or a test
 * reads the result after the fact to answer "did my click reach exactly one `update()`?"
 * without wrapping `BT` methods. Not public API: dev builds reach it as
 * `window.__btInputTrace` (see `src/utils/globalExpose.ts`).
 *
 * Off by default. While off, `BTAPI` only reads {@link InputTrace.isRecording}, so it costs one
 * field read per update and per frame. Recording stops on its own at the size cap.
 */

import { Vector2i } from '../utils/Vector2i';
import { BTN_POINTER_A } from './buttonFlags';
import type { GamepadInput } from './GamepadInput';
import { GAMEPAD_PLAYER_COUNT } from './GamepadInput';
import type { KeyboardInput } from './KeyboardInput';
import type { PointerClock, PointerInput } from './PointerInput';
import { POINTER_BUTTON_CODES, POINTER_SLOT_COUNT } from './PointerInput';

/** Entries kept when {@link InputTraceOptions.maxEntries} is omitted: about a minute at 60 updates and 60 frames per second. */
const DEFAULT_MAX_ENTRIES = 10000;

/** Largest accepted {@link InputTraceOptions.maxEntries}: hours of play, bounded so a typo cannot exhaust memory. */
const MAX_ENTRIES_LIMIT = 1_000_000;

/** Which loop phase an entry was recorded in. */
export type InputTraceClock = 'update' | 'render';

/** One pointer slot with a live edge or a nonzero delta. */
export interface InputTracePointer {
    /** Pointer slot (0 = mouse, 1-3 = touch / pen). */
    slot: number;

    /** `BT.BTN_POINTER_*` bits that went down on this entry's clock. */
    pressed: number;

    /** `BT.BTN_POINTER_*` bits that went up on this entry's clock. */
    released: number;

    /** Horizontal pointer delta on this entry's clock, in display pixels. */
    dx: number;

    /** Vertical pointer delta on this entry's clock, in display pixels. */
    dy: number;
}

/** One gamepad player with a live edge. */
export interface InputTraceGamepad {
    /** Zero-based player index. */
    player: number;

    /** `BT.BTN_*` bits that went down since the last update. */
    pressed: number;

    /** `BT.BTN_*` bits that went up since the last update. */
    released: number;
}

/** What one `update()` or one rendered frame saw. */
export interface InputTraceEntry {
    /** `'update'` reads the pointer's update clock, `'render'` its frame clock. */
    clock: InputTraceClock;

    /** `BT.ticks` when the entry was recorded. */
    tick: number;

    /** Index of the rendered frame this entry belongs to; updates share it with the render that follows them. */
    frame: number;

    /** Slots with a live edge or a nonzero delta; empty when the pointer saw nothing. */
    pointer: InputTracePointer[];

    /** Wheel scroll total on this entry's clock, in pixels. */
    wheel: number;

    /** `KeyboardEvent.code` values with a live press or release edge. */
    keys: { pressed: string[]; released: string[] };

    /** Players with a live edge; empty when no pad saw anything. */
    gamepad: InputTraceGamepad[];
}

/** Options for {@link InputTrace.start}. */
export interface InputTraceOptions {
    /** Entries to keep before recording stops on its own. Integer from 1 to 1000000; defaults to 10000. */
    maxEntries?: number;
}

/** What {@link InputTrace.stop} returns. */
export interface InputTraceResult {
    /** Entries in recording order. */
    entries: InputTraceEntry[];

    /** `true` when recording stopped because it hit `maxEntries`. */
    isTruncated: boolean;
}

/**
 * Bounded recorder of per-update and per-frame input edges. `BTAPI` owns one instance and calls
 * {@link record} only while {@link isRecording} is `true`.
 */
export class InputTrace {
    /** Whether {@link record} should be called. `false` until {@link start}, after {@link stop}, and once the cap is hit. */
    public isRecording: boolean = false;

    /** Entries of the current or last recording. */
    private entries: InputTraceEntry[] = [];

    /** Cap for the current recording. */
    private maxEntries: number = DEFAULT_MAX_ENTRIES;

    /** Whether the current or last recording hit its cap. */
    private isTruncated: boolean = false;

    /** Rendered frames recorded since {@link start}. */
    private frame: number = 0;

    /** Scratch vector for pointer deltas. */
    private readonly delta: Vector2i = new Vector2i(0, 0);

    /**
     * Clears any previous recording and starts a new one.
     *
     * @param options - See {@link InputTraceOptions}.
     * @throws {RangeError} When `maxEntries` is not an integer from 1 to 1000000.
     */
    public start(options: InputTraceOptions = {}): void {
        const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

        if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_ENTRIES_LIMIT) {
            throw new RangeError(
                `Input trace maxEntries must be an integer from 1 to ${String(MAX_ENTRIES_LIMIT)}, got ${String(maxEntries)}.`,
            );
        }

        this.entries = [];
        this.maxEntries = maxEntries;
        this.isTruncated = false;
        this.frame = 0;
        this.isRecording = true;
    }

    /**
     * Stops recording and returns what was recorded. Calling it again returns the same result.
     *
     * @returns The entries and whether the cap was hit.
     */
    public stop(): InputTraceResult {
        this.isRecording = false;

        return { entries: this.entries, isTruncated: this.isTruncated };
    }

    /**
     * Appends one entry. Call after `demo.update()` and before the inputs' `endUpdate`, or after
     * `demo.render()` and before the overlay and `PointerInput.endFrame`.
     *
     * @param clock - Loop phase being recorded.
     * @param tick - Current `BT.ticks`.
     * @param pointer - Pointer subsystem, or `null` when not attached.
     * @param keyboard - Keyboard subsystem, or `null` when not attached.
     * @param gamepad - Gamepad subsystem, or `null` when not attached.
     */
    public record(
        clock: InputTraceClock,
        tick: number,
        pointer: PointerInput | null,
        keyboard: KeyboardInput | null,
        gamepad: GamepadInput | null,
    ): void {
        if (!this.isRecording) {
            return;
        }

        const pointerClock: PointerClock = clock === 'update' ? 'update' : 'frame';
        const entry: InputTraceEntry = {
            clock,
            tick,
            frame: this.frame,
            pointer: [],
            wheel: pointer?.getScrollDelta(pointerClock) ?? 0,
            keys: { pressed: [], released: [] },
            gamepad: [],
        };

        if (pointer) {
            this.recordPointer(pointer, pointerClock, entry.pointer);
        }

        keyboard?.collectEdges(entry.keys.pressed, entry.keys.released);

        if (gamepad) {
            for (let player = 0; player < GAMEPAD_PLAYER_COUNT; player++) {
                const pressed = gamepad.getPressedMask(player);
                const released = gamepad.getReleasedMask(player);

                if (pressed !== 0 || released !== 0) {
                    entry.gamepad.push({ player, pressed, released });
                }
            }
        }

        if (clock === 'render') {
            this.frame++;
        }

        this.entries.push(entry);

        if (this.entries.length >= this.maxEntries) {
            this.isTruncated = true;
            this.isRecording = false;
        }
    }

    /**
     * Appends every pointer slot with a live edge or a nonzero delta on `clock`.
     *
     * @param pointer - Pointer subsystem.
     * @param clock - Pointer clock to read.
     * @param out - Receives the slots.
     */
    private recordPointer(pointer: PointerInput, clock: PointerClock, out: InputTracePointer[]): void {
        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            let pressed = 0;
            let released = 0;

            let flag = BTN_POINTER_A;

            for (const code of POINTER_BUTTON_CODES) {
                if (pointer.isButtonPressed(code, slot, clock)) {
                    pressed |= flag;
                }

                if (pointer.isButtonReleased(code, slot, clock)) {
                    released |= flag;
                }

                flag <<= 1;
            }

            pointer.getDeltaTo(slot, this.delta, clock);

            if (pressed !== 0 || released !== 0 || this.delta.x !== 0 || this.delta.y !== 0) {
                out.push({ slot, pressed, released, dx: this.delta.x, dy: this.delta.y });
            }
        }
    }
}
