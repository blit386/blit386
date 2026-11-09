/**
 * Keyboard input: DOM `code` tracking, edge detection, optional tick-based repeat,
 * and text accumulation from `keydown` `event.key` (`inputString`).
 */

import { isRepeatTick } from './repeatTick';

/**
 * `KeyboardEvent.code` values that scroll the host page by default.
 * When {@link KeyboardInput.setIsCapturingScroll} is enabled, `keydown` calls
 * `preventDefault` for these codes so games can map arrows / Space without moving the page.
 */
const SCROLL_CODES: ReadonlySet<string> = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
    'PageUp',
    'PageDown',
    'Home',
    'End',
]);

/** Lowest code point {@link KeyboardInput.getInputString} accepts as typed text (space). */
const FIRST_PRINTABLE = 32;

/** Highest code point {@link KeyboardInput.getInputString} accepts as typed text (`~`). */
const LAST_PRINTABLE = 126;

/** Options supplied when attaching to the canvas. */
export interface KeyboardAttachOptions {
    /**
     * Returns the current fixed-update tick (same as `BT.ticks`).
     * Used when recording first key-down time for `isKeyPressed(..., repeatRate)`.
     */
    getTicks: () => number;
}

/**
 * Tracks held keys using `KeyboardEvent.code`, snapshots once per frame for
 * edge detection (aligned with fixed-update timing via {@link endUpdate}), and
 * accumulates filtered text from `keydown` (a canvas never receives `beforeinput`).
 */
export class KeyboardInput {
    /** Keys currently held (`keydown`, cleared on `keyup` / blur). */
    private readonly held: Set<string> = new Set();

    /** Snapshot of `held` at the last {@link endUpdate} (previous fixed tick). */
    private readonly prevHeld: Set<string> = new Set();

    /**
     * Key codes that received a `keydown` since the last {@link endUpdate}.
     * Buffered so press edges survive render-only frames (for example 120 Hz display
     * with `targetFPS: 60`).
     */
    private readonly pendingPress: Set<string> = new Set();

    /**
     * Key codes that received a `keyup` since the last {@link endUpdate}.
     * Paired with {@link pendingPress} for the same high-refresh edge case.
     */
    private readonly pendingRelease: Set<string> = new Set();

    /** Tick index when each code first went down (for repeat). */
    private readonly firstPressTick: Map<string, number> = new Map();

    /** Characters queued for {@link getInputString}; cleared in {@link endUpdate}. */
    private inputBuffer: string = '';

    private canvas: HTMLCanvasElement | null = null;

    private getTicks: (() => number) | null = null;

    /**
     * When true, scroll-key `keydown` events call `preventDefault`.
     * Set from `HardwareSettings.isCapturingKeyboardScroll`.
     */
    private isCapturingScroll = false;

    private readonly onKeyDown: (event: KeyboardEvent) => void;

    private readonly onKeyUp: (event: KeyboardEvent) => void;

    private readonly onBlur: () => void;

    /**
     * Creates a keyboard input tracker with no listeners attached.
     */
    constructor() {
        this.onKeyDown = (event) => this.handleKeyDown(event);
        this.onKeyUp = (event) => this.handleKeyUp(event);
        this.onBlur = () => this.releaseAll();
    }

    /**
     * Attaches listeners to the canvas and window. Also listens for `blur`
     * on the canvas and the `window` to release held keys (with a release edge) and clear the text buffer when focus
     * leaves either.
     *
     * @param canvas - Canvas that receives keyboard events when focused.
     * @param options - Supplies {@link KeyboardAttachOptions.getTicks} for repeat timing.
     */
    public attach(canvas: HTMLCanvasElement, options: KeyboardAttachOptions): void {
        this.detach();

        this.canvas = canvas;
        this.getTicks = options.getTicks;

        canvas.addEventListener('keydown', this.onKeyDown);
        canvas.addEventListener('keyup', this.onKeyUp);
        canvas.addEventListener('blur', this.onBlur);

        if (typeof globalThis.window !== 'undefined') {
            globalThis.window.addEventListener('blur', this.onBlur);
        }
    }

    /**
     * Removes listeners and resets state.
     */
    public detach(): void {
        const canvas = this.canvas;

        if (canvas !== null) {
            canvas.removeEventListener('keydown', this.onKeyDown);
            canvas.removeEventListener('keyup', this.onKeyUp);
            canvas.removeEventListener('blur', this.onBlur);
        }

        if (typeof globalThis.window !== 'undefined') {
            globalThis.window.removeEventListener('blur', this.onBlur);
        }

        this.canvas = null;
        this.getTicks = null;

        this.clearAllState();
    }

    /**
     * Enables or disables configure-time keyboard scroll capture on the canvas.
     *
     * When enabled, `keydown` for arrow keys, Space, PageUp/PageDown, Home, and End
     * calls `preventDefault` so the host page does not scroll while the canvas is
     * focused. When disabled (the default), those keys keep their browser defaults.
     *
     * @param enabled - Whether the demo opted into keyboard scroll capture.
     */
    public setIsCapturingScroll(enabled: boolean): void {
        this.isCapturingScroll = enabled;
    }

    /**
     * Ends a fixed update step: snapshots `prevHeld`, clears pending edges and
     * {@link getInputString}. Call once per `demo.update()` (not once per render frame).
     */
    public endUpdate(): void {
        this.pendingPress.clear();
        this.pendingRelease.clear();

        this.prevHeld.clear();

        for (const code of this.held) {
            this.prevHeld.add(code);
        }

        this.inputBuffer = '';
    }

    /**
     * Whether `code` is held this frame (`KeyboardEvent.code`).
     *
     * @param code - DOM key code string (for example `"Space"`).
     * @returns `true` while the key is held.
     */
    public isKeyDown(code: string): boolean {
        return this.held.has(code);
    }

    /**
     * Edge or optional repeat (fixed ticks). `repeatRate <= 0` means edge only.
     *
     * @param code - DOM key code string.
     * @param repeatRate - Ticks between repeats; omit or non-positive for edge only.
     * @param currentTick - Current fixed-update tick (`BT.ticks`).
     * @returns `true` on the initial press edge or on repeat ticks when configured.
     */
    public isKeyPressed(code: string, repeatRate: number | undefined, currentTick: number): boolean {
        const isPressEdge = this.pendingPress.has(code) || (this.held.has(code) && !this.prevHeld.has(code));

        if (repeatRate === undefined || repeatRate <= 0) {
            return isPressEdge;
        }

        if (isPressEdge) {
            return true;
        }

        if (!this.held.has(code)) {
            return false;
        }

        const first = this.firstPressTick.get(code);

        return isRepeatTick(first, repeatRate, currentTick);
    }

    /**
     * Released edge for `code`.
     *
     * @param code - DOM key code string.
     * @returns `true` on the frame the key transitions from down to up.
     */
    public isKeyReleased(code: string): boolean {
        if (this.pendingRelease.has(code)) {
            return true;
        }

        return !this.held.has(code) && this.prevHeld.has(code);
    }

    /**
     * Appends every key code for which {@link isKeyPressed} (edge only, no repeat) or
     * {@link isKeyReleased} is true right now, so the dev-only input trace reports exactly what
     * `update()` would see. Allocates; call it only while the trace is recording.
     *
     * @param pressed - Receives codes that went down since the last {@link endUpdate}.
     * @param released - Receives codes that went up since the last {@link endUpdate}.
     */
    public collectEdges(pressed: string[], released: string[]): void {
        for (const code of new Set([...this.pendingPress, ...this.held])) {
            if (this.isKeyPressed(code, undefined, 0)) {
                pressed.push(code);
            }
        }

        for (const code of new Set([...this.pendingRelease, ...this.prevHeld])) {
            if (this.isKeyReleased(code)) {
                released.push(code);
            }
        }
    }

    /**
     * Whether at least one key is held this frame.
     *
     * @returns `true` while any key is down.
     */
    public isAnyKeyDown(): boolean {
        return this.held.size > 0;
    }

    /**
     * Press edge for any key: fires when a key goes down, even if other keys are already held.
     * With `repeatRate > 0` it also fires every `repeatRate` ticks while keys stay held, counted
     * from the earliest-pressed key that is still down.
     *
     * @param repeatRate - Ticks between repeats; omit or non-positive for edge only.
     * @param currentTick - Current fixed-update tick (`BT.ticks`).
     * @returns `true` on a press edge or a repeat tick when configured.
     */
    public isAnyKeyPressed(repeatRate: number | undefined, currentTick: number): boolean {
        if (this.pendingPress.size > 0) {
            return true;
        }

        let first: number | undefined;

        for (const code of this.held) {
            if (!this.prevHeld.has(code)) {
                return true;
            }

            const t = this.firstPressTick.get(code);

            if (t !== undefined && (first === undefined || t < first)) {
                first = t;
            }
        }

        if (repeatRate === undefined || repeatRate <= 0) {
            return false;
        }

        return isRepeatTick(first, repeatRate, currentTick);
    }

    /**
     * Release edge for "everything is up": no key is held now, and at least one was held since
     * the last {@link endUpdate}. Releasing one key while another stays down does not count.
     *
     * @returns `true` on the update where the last held key comes up.
     */
    public isAnyKeyReleased(): boolean {
        if (this.held.size > 0) {
            return false;
        }

        return this.pendingRelease.size > 0 || this.prevHeld.size > 0;
    }

    /**
     * Text accumulated since the last {@link endUpdate} from `keydown`.
     * Accepts printable ASCII (32-126) plus Tab, Escape, Backspace, and Enter; IME composition is not seen.
     *
     * @returns Buffered characters for the current frame.
     */
    public getInputString(): string {
        return this.inputBuffer;
    }

    /**
     * Logical OR of mapped key codes: held if any mapped code is down.
     *
     * @param codes - `KeyboardEvent.code` values for one logical button.
     * @returns `true` if any listed code is held.
     */
    public isButtonDown(codes: readonly string[]): boolean {
        for (const code of codes) {
            if (this.held.has(code)) {
                return true;
            }
        }

        return false;
    }

    /**
     * OR semantics: pressed when logical button transitions from no mapped keys
     * held to at least one held, or on repeat ticks when configured.
     *
     * @param codes - `KeyboardEvent.code` values for one logical button.
     * @param repeatRate - Optional tick repeat interval for held buttons.
     * @param currentTick - Current fixed-update tick (`BT.ticks`).
     * @returns `true` on the initial edge or on repeat ticks when configured.
     */
    public isButtonPressed(codes: readonly string[], repeatRate: number | undefined, currentTick: number): boolean {
        const isPrevDown = codes.some((c) => this.prevHeld.has(c));

        // A second mapped key pressed while another was already held at the last update is not a new edge.
        // shortcut: a key released and pressed again within one update tick reports no edge; fine below one tick (~16 ms).
        if (!isPrevDown && codes.some((c) => this.pendingPress.has(c))) {
            return true;
        }

        if (!this.isButtonDown(codes)) {
            return false;
        }

        if (!isPrevDown) {
            return true;
        }

        if (repeatRate === undefined || repeatRate <= 0) {
            return false;
        }

        const first = this.getOrMinFirstPressTick(codes);

        return isRepeatTick(first, repeatRate, currentTick);
    }

    /**
     * OR semantics: released if no key down now but at least one was down last frame.
     *
     * @param codes - `KeyboardEvent.code` values for one logical button.
     * @returns `true` when the logical button transitions from down to up.
     */
    public isButtonReleased(codes: readonly string[]): boolean {
        // Another mapped key still held means the logical button never went up.
        if (this.isButtonDown(codes)) {
            return false;
        }

        return codes.some((c) => this.pendingRelease.has(c) || this.prevHeld.has(c));
    }

    /**
     * Minimum `firstPressTick` among codes that are still held (OR-button repeat).
     *
     * @param codes - Key codes that belong to one logical button.
     * @returns Smallest tick anchor among held keys, or `undefined`.
     */
    private getOrMinFirstPressTick(codes: readonly string[]): number | undefined {
        let min: number | undefined;

        for (const code of codes) {
            if (!this.held.has(code)) {
                continue;
            }

            const t = this.firstPressTick.get(code);

            if (t !== undefined && (min === undefined || t < min)) {
                min = t;
            }
        }

        return min;
    }

    /**
     * Releases every held key when focus leaves (canvas / window blur): each becomes a release edge for the next
     * update, since no `keyup` will arrive for it. `prevHeld` and `pendingPress` are kept, so those edges read as
     * down-to-up and a key pressed since the last update still reports its press.
     */
    private releaseAll(): void {
        for (const code of this.held) {
            this.pendingRelease.add(code);
        }

        this.held.clear();
        this.firstPressTick.clear();
        this.inputBuffer = '';
    }

    /** Clears held keys, edges, repeat anchors, and text (detach). */
    private clearAllState(): void {
        this.held.clear();
        this.prevHeld.clear();
        this.pendingPress.clear();
        this.pendingRelease.clear();
        this.firstPressTick.clear();
        this.inputBuffer = '';
    }

    /**
     * Queues typed text for {@link getInputString} (OS key repeats included), then applies the first keydown for a
     * code and queues Tab / Escape.
     *
     * @param event - DOM keydown event.
     */
    private handleKeyDown(event: KeyboardEvent): void {
        const code = event.code;

        // Block browser page scroll before the held early-return so key-repeat
        // keydowns stay suppressed while the key is held.
        if (this.isCapturingScroll && SCROLL_CODES.has(code)) {
            event.preventDefault();
        }

        // macOS sends no keyup for a key pressed while Meta is held, so it would stay down forever.
        if (event.metaKey && !code.startsWith('Meta')) {
            return;
        }

        this.appendText(event);

        if (this.held.has(code)) {
            return;
        }

        this.held.add(code);
        this.pendingPress.add(code);

        const tick = this.getTicks?.() ?? 0;

        this.firstPressTick.set(code, tick);

        // Tab / Escape are queued once per press, not on OS key repeat.
        if (code === 'Tab') {
            this.inputBuffer += '\x09';
        } else if (code === 'Escape') {
            this.inputBuffer += '\x1b';
        }
    }

    /**
     * Removes a code on keyup.
     *
     * @param event - DOM keyup event.
     */
    private handleKeyUp(event: KeyboardEvent): void {
        const code = event.code;

        if (!this.held.delete(code)) {
            return;
        }

        this.firstPressTick.delete(code);
        this.pendingRelease.add(code);
    }

    /**
     * Appends the character a keydown types, or BS / CR for Backspace / Enter. Shortcuts type nothing (see
     * {@link isShortcut}; Meta ones never get here).
     *
     * @param event - DOM keydown event.
     */
    private appendText(event: KeyboardEvent): void {
        const key: unknown = event.key;

        // Synthetic keydowns (Chrome autofill, hand-built test events) can arrive without a `key`.
        if (typeof key !== 'string') {
            return;
        }

        if (key === 'Backspace') {
            this.inputBuffer += '\x08';
        } else if (key === 'Enter') {
            this.inputBuffer += '\x0d';
        } else if (key.length === 1 && !isShortcut(event, key)) {
            const cp = key.charCodeAt(0);

            if (cp >= FIRST_PRINTABLE && cp <= LAST_PRINTABLE) {
                this.inputBuffer += key;
            }
        }
    }
}

/**
 * Whether a one-character keydown is a shortcut rather than typing.
 *
 * - Ctrl alone is a shortcut. Ctrl+Alt types: Windows reports AltGr (`@`, `{` on many layouts) that way.
 * - Alt alone is a shortcut when the key still reports its own character (Alt+A gives `a` on Windows and Linux). When Alt
 *   changes the character it is a macOS Option composition (Option+L gives `@` on a German layout) and types.
 *
 * @param event - DOM keydown event.
 * @param key - `event.key`, already known to be one character.
 * @returns `true` when the key should not reach {@link KeyboardInput.getInputString}.
 */
const isShortcut = (event: KeyboardEvent, key: string): boolean => {
    if (event.ctrlKey) {
        return !event.altKey;
    }

    if (!event.altKey) {
        return false;
    }

    // shortcut: compares with the key's US position, so Alt+A on a French layout (code KeyQ) still types.
    return event.code === `Key${key.toUpperCase()}` || event.code === `Digit${key}`;
};
