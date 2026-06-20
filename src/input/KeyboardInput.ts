/**
 * Keyboard input: DOM `code` tracking, edge detection, optional tick-based repeat,
 * and text accumulation via `beforeinput` (`inputString`).
 */

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
 * accumulates filtered text from `beforeinput`.
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

    private readonly onKeyDown: (event: KeyboardEvent) => void;

    private readonly onKeyUp: (event: KeyboardEvent) => void;

    private readonly onBeforeInput: (event: InputEvent) => void;

    private readonly onBlur: () => void;

    /**
     * Creates a keyboard input tracker with no listeners attached.
     */
    constructor() {
        this.onKeyDown = (event) => this.handleKeyDown(event);
        this.onKeyUp = (event) => this.handleKeyUp(event);
        this.onBeforeInput = (event) => this.handleBeforeInput(event);
        this.onBlur = () => this.clearAllState();
    }

    /**
     * Attaches listeners to the canvas and window. Also listens for `window`
     * `blur` to clear held keys and the text buffer when focus leaves the page.
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
        canvas.addEventListener('beforeinput', this.onBeforeInput as EventListener);

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
            canvas.removeEventListener('beforeinput', this.onBeforeInput as EventListener);
        }

        if (typeof globalThis.window !== 'undefined') {
            globalThis.window.removeEventListener('blur', this.onBlur);
        }

        this.canvas = null;
        this.getTicks = null;

        this.clearAllState();
    }

    /**
     * Ends a fixed update step: snapshots `prevHeld`, clears pending edges and
     * {@link getInputString}. Call once per `demo.update()` (not once per render frame).
     *
     * @param _currentTick - Reserved for future use; fixed-update tick when the demo read input.
     */
    public endUpdate(_currentTick: number): void {
        this.pendingPress.clear();
        this.pendingRelease.clear();

        this.prevHeld.clear();

        for (const code of this.held) {
            this.prevHeld.add(code);
        }

        this.inputBuffer = '';
    }

    /**
     * Alias for {@link endUpdate}; kept for tests and callers that still use the old name.
     *
     * @deprecated Call {@link endUpdate} once per fixed update instead.
     * @param currentTick - Passed through to {@link endUpdate}.
     */
    public endFrame(currentTick: number): void {
        this.endUpdate(currentTick);
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

        if (first === undefined) {
            return false;
        }

        const dt = currentTick - first;

        return dt > 0 && dt % repeatRate === 0;
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
     * Text accumulated since the last {@link endFrame} from `beforeinput`.
     * Accepts printable ASCII (32-126) plus Tab, Escape, Backspace, and Enter.
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
        if (codes.length === 0) {
            return false;
        }

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
        if (codes.length === 0) {
            return false;
        }

        if (codes.some((c) => this.pendingPress.has(c))) {
            return true;
        }

        const isDown = this.isButtonDown(codes);
        const isPrevDown = codes.some((c) => this.prevHeld.has(c));

        if (!isDown) {
            return false;
        }

        if (!isPrevDown) {
            return true;
        }

        if (repeatRate === undefined || repeatRate <= 0) {
            return false;
        }

        const first = this.getOrMinFirstPressTick(codes);

        if (first === undefined) {
            return false;
        }

        const dt = currentTick - first;

        return dt > 0 && dt % repeatRate === 0;
    }

    /**
     * OR semantics: released if no key down now but at least one was down last frame.
     *
     * @param codes - `KeyboardEvent.code` values for one logical button.
     * @returns `true` when the logical button transitions from down to up.
     */
    public isButtonReleased(codes: readonly string[]): boolean {
        if (codes.length === 0) {
            return false;
        }

        if (codes.some((c) => this.pendingRelease.has(c))) {
            return true;
        }

        if (this.isButtonDown(codes)) {
            return false;
        }

        return codes.some((c) => this.prevHeld.has(c));
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

    /** Clears held keys, repeat anchors, and text (window blur / detach). */
    private clearAllState(): void {
        this.held.clear();
        this.prevHeld.clear();
        this.pendingPress.clear();
        this.pendingRelease.clear();
        this.firstPressTick.clear();
        this.inputBuffer = '';
    }

    /**
     * Applies first keydown for a code and queues Tab / Escape for {@link getInputString}.
     *
     * @param event - DOM keydown event.
     */
    private handleKeyDown(event: KeyboardEvent): void {
        const code = event.code;

        if (this.held.has(code)) {
            return;
        }

        this.held.add(code);
        this.pendingPress.add(code);

        const tick = this.getTicks?.() ?? 0;

        this.firstPressTick.set(code, tick);

        // `beforeinput` does not reliably fire for Tab / Escape; mirror text-input spec.
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
     * Filters `beforeinput` into {@link getInputString}.
     *
     * @param event - DOM beforeinput event.
     */
    private handleBeforeInput(event: InputEvent): void {
        const inputType = event.inputType;

        if (inputType === 'insertText' || inputType === 'insertCompositionText') {
            const data = event.data;

            if (data === null || data === undefined) {
                return;
            }

            for (let i = 0; i < data.length; i++) {
                const cp = data.charCodeAt(i);

                // Printable ASCII 32-127, plus Tab (9) and ESC (27) when present as text.
                if ((cp >= 32 && cp <= 127) || cp === 9 || cp === 27) {
                    this.inputBuffer += String.fromCharCode(cp);
                }
            }

            return;
        }

        if (inputType === 'deleteContentBackward') {
            this.inputBuffer += '\x08';

            return;
        }

        if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
            this.inputBuffer += '\x0d';

            return;
        }
    }
}
