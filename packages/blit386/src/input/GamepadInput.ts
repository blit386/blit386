/**
 * Gamepad input subsystem.
 *
 * Uses the browser Gamepad API. Each public query re-polls
 * `navigator.getGamepads()` before reading state. Previous-state is snapshotted
 * at end-of-frame for edge detection ({@link isButtonPressed} /
 * {@link isButtonReleased}) and optional repeat timing.
 */
/* eslint-disable security/detect-object-injection */

/** Maximum supported local gamepad players. */
export const GAMEPAD_PLAYER_COUNT = 4;

/** Default analog dead zone for stick axes. */
export const DEFAULT_GAMEPAD_DEAD_ZONE = 0.75;

/** Standard mapping button indices (W3C standard gamepad mapping). */
const GP_BUTTON_A = 0;
const GP_BUTTON_B = 1;
const GP_BUTTON_X = 2;
const GP_BUTTON_Y = 3;
const GP_BUTTON_L = 4;
const GP_BUTTON_R = 5;
const GP_BUTTON_SELECT = 8;
const GP_BUTTON_START = 9;
const GP_BUTTON_UP = 12;
const GP_BUTTON_DOWN = 13;
const GP_BUTTON_LEFT = 14;
const GP_BUTTON_RIGHT = 15;

/** Face/button bit flags mirrored from `BT.BTN_*` to avoid circular imports. */
const BTN_UP = 1 << 0;
const BTN_DOWN = 1 << 1;
const BTN_LEFT = 1 << 2;
const BTN_RIGHT = 1 << 3;
const BTN_A = 1 << 4;
const BTN_B = 1 << 5;
const BTN_X = 1 << 6;
const BTN_Y = 1 << 7;
const BTN_L = 1 << 8;
const BTN_R = 1 << 9;
const BTN_START = 1 << 10;
const BTN_SELECT = 1 << 11;

/** Axis constants mirrored from `BT.AXIS_*` to avoid circular imports. */
const AXIS_LEFT_X = 0;
const AXIS_LEFT_Y = 1;
const AXIS_RIGHT_X = 2;
const AXIS_RIGHT_Y = 3;
const AXIS_TRIGGER_L = 4;
const AXIS_TRIGGER_R = 5;

const VALID_BUTTON_FLAGS = [
    BTN_UP,
    BTN_DOWN,
    BTN_LEFT,
    BTN_RIGHT,
    BTN_A,
    BTN_B,
    BTN_X,
    BTN_Y,
    BTN_L,
    BTN_R,
    BTN_START,
    BTN_SELECT,
] as const;

const VALID_AXIS_INDICES = [
    AXIS_LEFT_X,
    AXIS_LEFT_Y,
    AXIS_RIGHT_X,
    AXIS_RIGHT_Y,
    AXIS_TRIGGER_L,
    AXIS_TRIGGER_R,
] as const;

/**
 * Reads and clamps a raw stick axis to `[-1, 1]`.
 *
 * @param pad - Gamepad object.
 * @param index - Raw axis index.
 * @returns Clamped axis value.
 */
function getAxis(pad: Gamepad, index: number): number {
    const value = pad.axes[index] ?? 0;

    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(-1, Math.min(1, value));
}

/**
 * Reads a trigger/button analog value and clamps to `[0, 1]`.
 *
 * @param pad - Gamepad object.
 * @param index - Raw button index.
 * @returns Clamped analog value.
 */
function getButtonValue(pad: Gamepad, index: number): number {
    const button = pad.buttons[index];

    if (!button) {
        return 0;
    }

    const value = Number.isFinite(button.value) ? button.value : button.pressed ? 1 : 0;

    return Math.max(0, Math.min(1, value));
}

/**
 * Checks digital down-state for a gamepad button.
 *
 * @param pad - Gamepad object.
 * @param index - Raw button index.
 * @returns `true` when considered pressed.
 */
function isButtonDown(pad: Gamepad, index: number): boolean {
    const button = pad.buttons[index];

    if (!button) {
        return false;
    }

    return button.pressed || button.value >= 0.5;
}

/**
 * Per-player gamepad snapshot used for current and previous frame state.
 */
interface PlayerSnapshot {
    /** Whether a gamepad is connected for this player slot. */
    isConnected: boolean;
    /** Current button-state bitmask (`BTN_*`). */
    buttons: number;
    /** Snapshot axis values in `AXIS_*` order. */
    axes: readonly [number, number, number, number, number, number];
}

/**
 * Polling-based gamepad input tracker with per-frame previous-state snapshots.
 */
export class GamepadInput {
    /** Current polled state per player slot. */
    private readonly current: readonly [PlayerSnapshot, PlayerSnapshot, PlayerSnapshot, PlayerSnapshot];

    /** End-of-frame previous snapshot per player slot. */
    private readonly previous: readonly [PlayerSnapshot, PlayerSnapshot, PlayerSnapshot, PlayerSnapshot];

    /** First tick each button was pressed per player (for repeat behavior). */
    private readonly firstPressTick: readonly [
        Map<number, number>,
        Map<number, number>,
        Map<number, number>,
        Map<number, number>,
    ];

    /** Current analog stick dead-zone threshold. */
    private deadZone: number;

    /** Event handler for `gamepadconnected`. */
    private readonly onConnected: (event: Event) => void;

    /** Event handler for `gamepaddisconnected`. */
    private readonly onDisconnected: (event: Event) => void;

    /**
     * Creates a gamepad input tracker.
     *
     * @param deadZone - Stick dead-zone threshold in `[0, 0.99]`.
     */
    constructor(deadZone: number = DEFAULT_GAMEPAD_DEAD_ZONE) {
        this.current = [
            this.createEmptySnapshot(),
            this.createEmptySnapshot(),
            this.createEmptySnapshot(),
            this.createEmptySnapshot(),
        ];
        this.previous = [
            this.createEmptySnapshot(),
            this.createEmptySnapshot(),
            this.createEmptySnapshot(),
            this.createEmptySnapshot(),
        ];
        this.firstPressTick = [new Map(), new Map(), new Map(), new Map()];
        this.deadZone = this.sanitizeDeadZone(deadZone);
        this.onConnected = () => this.poll();
        this.onDisconnected = () => this.poll();
    }

    /**
     * Attaches global gamepad connect/disconnect listeners.
     *
     * Also performs an immediate state poll so queries are accurate before the
     * first frame-end snapshot.
     */
    public attach(): void {
        if (typeof globalThis.window !== 'undefined') {
            globalThis.window.addEventListener('gamepadconnected', this.onConnected);
            globalThis.window.addEventListener('gamepaddisconnected', this.onDisconnected);
        }

        this.poll();
    }

    /**
     * Detaches global listeners and clears cached state.
     */
    public detach(): void {
        if (typeof globalThis.window !== 'undefined') {
            globalThis.window.removeEventListener('gamepadconnected', this.onConnected);
            globalThis.window.removeEventListener('gamepaddisconnected', this.onDisconnected);
        }

        this.clearAllState();
    }

    /**
     * Sets the analog stick dead zone used by {@link GamepadInput.getAxis} for stick axes.
     *
     * @param deadZone - New dead-zone threshold.
     */
    public setDeadZone(deadZone: number): void {
        this.deadZone = this.sanitizeDeadZone(deadZone);
    }

    /**
     * Returns the current analog stick dead-zone threshold.
     *
     * @returns Current dead-zone threshold in `[0, 0.99]`.
     */
    public getDeadZone(): number {
        return this.deadZone;
    }

    /**
     * Polls gamepads, then snapshots current state into previous-state storage
     * for next frame's edge detection.
     *
     * @param _currentTick - Current engine tick (unused; kept for BTAPI parity).
     */
    public endFrame(_currentTick: number): void {
        this.poll();

        for (let i = 0; i < GAMEPAD_PLAYER_COUNT; i++) {
            const current = this.current[i];
            const previous = this.previous[i];

            if (!current || !previous) {
                continue;
            }

            previous.isConnected = current.isConnected;
            previous.buttons = current.buttons;
            previous.axes = [...current.axes] as PlayerSnapshot['axes'];

            if (!current.isConnected) {
                this.firstPressTick[i]?.clear();
            }
        }
    }

    /**
     * Reports whether any button in `buttonMask` is currently held for `player`.
     *
     * @param buttonMask - One or more `BTN_*` bit flags.
     * @param player - Zero-based player index.
     * @returns `true` when any requested button is currently down.
     */
    public isButtonDown(buttonMask: number, player: number): boolean {
        const index = this.normalizePlayer(player);

        if (index === null || buttonMask <= 0) {
            return false;
        }

        this.poll();

        const current = this.current[index];

        if (!current?.isConnected) {
            return false;
        }

        return (current.buttons & buttonMask) !== 0;
    }

    /**
     * Reports press-edge (and optional repeat) for button masks.
     *
     * Matching uses ANY semantics across `buttonMask` bits.
     *
     * @param buttonMask - One or more `BTN_*` bit flags.
     * @param player - Zero-based player index.
     * @param repeatRate - Tick interval for repeat (`<= 0` or omitted = edge only).
     * @param currentTick - Current fixed-update tick.
     * @returns `true` on press edge or repeat tick.
     */
    public isButtonPressed(
        buttonMask: number,
        player: number,
        repeatRate: number | undefined,
        currentTick: number,
    ): boolean {
        const index = this.normalizePlayer(player);

        if (index === null || buttonMask <= 0) {
            return false;
        }

        this.poll();

        const current = this.current[index];
        const previous = this.previous[index];

        if (!current?.isConnected || !previous) {
            return false;
        }

        const edgeMask = current.buttons & ~previous.buttons & buttonMask;

        if (edgeMask !== 0) {
            this.recordNewPressTicks(index, edgeMask, currentTick);
            return true;
        }

        if (repeatRate === undefined || repeatRate <= 0) {
            return false;
        }

        const heldMask = current.buttons & buttonMask;

        if (heldMask === 0) {
            return false;
        }

        const first = this.getMinFirstPressTick(index, heldMask);

        if (first === undefined) {
            return false;
        }

        const dt = currentTick - first;

        return dt > 0 && dt % repeatRate === 0;
    }

    /**
     * Reports whether any button in `buttonMask` was released this frame, including
     * when the gamepad disconnects while buttons were held.
     *
     * @param buttonMask - One or more `BTN_*` bit flags.
     * @param player - Zero-based player index.
     * @returns `true` when any requested button transitions from down to up.
     */
    public isButtonReleased(buttonMask: number, player: number): boolean {
        const index = this.normalizePlayer(player);

        if (index === null || buttonMask <= 0) {
            return false;
        }

        this.poll();

        const current = this.current[index];
        const previous = this.previous[index];

        if (!previous) {
            return false;
        }

        if (!current?.isConnected && previous.isConnected) {
            return (previous.buttons & buttonMask) !== 0;
        }

        if (!current?.isConnected) {
            return false;
        }

        return (~current.buttons & previous.buttons & buttonMask) !== 0;
    }

    /**
     * Reads a gamepad axis for a player.
     *
     * Stick axes apply dead-zone filtering. Trigger axes return raw `[0, 1]`.
     *
     * @param axis - Axis constant (`AXIS_*`).
     * @param player - Zero-based player index.
     * @returns Axis value, or `0` for invalid/disconnected inputs.
     */
    public getAxis(axis: number, player: number): number {
        const index = this.normalizePlayer(player);

        if (index === null || !VALID_AXIS_INDICES.includes(axis as (typeof VALID_AXIS_INDICES)[number])) {
            return 0;
        }

        this.poll();

        const snapshot = this.current[index];

        if (!snapshot?.isConnected) {
            return 0;
        }

        return snapshot.axes[axis as (typeof VALID_AXIS_INDICES)[number]] ?? 0;
    }

    /**
     * Reports whether a gamepad is connected for the given player slot.
     *
     * @param player - Zero-based player index.
     * @returns `true` when connected.
     */
    public isConnected(player: number): boolean {
        const index = this.normalizePlayer(player);

        if (index === null) {
            return false;
        }

        this.poll();

        return this.current[index]?.isConnected ?? false;
    }

    /**
     * Counts connected gamepads across tracked player slots.
     *
     * @returns Number of connected gamepads in `[0, GAMEPAD_PLAYER_COUNT]`.
     */
    public connectedCount(): number {
        this.poll();

        let count = 0;

        for (let i = 0; i < GAMEPAD_PLAYER_COUNT; i++) {
            if (this.current[i]?.isConnected) {
                count++;
            }
        }

        return count;
    }

    /**
     * Creates an empty disconnected player snapshot.
     *
     * @returns Fresh disconnected snapshot.
     */
    private createEmptySnapshot(): PlayerSnapshot {
        return {
            isConnected: false,
            buttons: 0,
            axes: [0, 0, 0, 0, 0, 0],
        };
    }

    /**
     * Normalizes and clamps dead-zone configuration.
     *
     * @param deadZone - Requested dead-zone value.
     * @returns Clamped dead-zone value.
     */
    private sanitizeDeadZone(deadZone: number): number {
        if (!Number.isFinite(deadZone)) {
            return DEFAULT_GAMEPAD_DEAD_ZONE;
        }

        return Math.max(0, Math.min(deadZone, 0.99));
    }

    /**
     * Polls `navigator.getGamepads()` and refreshes current snapshots.
     */
    private poll(): void {
        const pads = this.read();

        for (let player = 0; player < GAMEPAD_PLAYER_COUNT; player++) {
            const snapshot = this.current[player];

            if (!snapshot) {
                continue;
            }

            const pad = pads[player];

            if (!pad?.connected) {
                snapshot.isConnected = false;
                snapshot.buttons = 0;
                snapshot.axes = [0, 0, 0, 0, 0, 0];
                continue;
            }

            snapshot.isConnected = true;
            snapshot.buttons = this.mapButtons(pad);
            snapshot.axes = this.mapAxes(pad);
            this.dropReleasedTickAnchors(player, snapshot.buttons);
        }
    }

    /**
     * Safely reads browser gamepads (empty when unavailable).
     *
     * @returns Current browser gamepad array or an empty array.
     */
    private read(): readonly (Gamepad | null)[] {
        if (typeof globalThis.navigator === 'undefined' || typeof globalThis.navigator.getGamepads !== 'function') {
            return [];
        }

        return globalThis.navigator.getGamepads();
    }

    /**
     * Maps standard Gamepad API buttons to `BTN_*` bit flags.
     *
     * @param pad - Gamepad object from browser API.
     * @returns Button-state bitmask.
     */
    private mapButtons(pad: Gamepad): number {
        let mask = 0;

        if (isButtonDown(pad, GP_BUTTON_UP)) {
            mask |= BTN_UP;
        }
        if (isButtonDown(pad, GP_BUTTON_DOWN)) {
            mask |= BTN_DOWN;
        }
        if (isButtonDown(pad, GP_BUTTON_LEFT)) {
            mask |= BTN_LEFT;
        }
        if (isButtonDown(pad, GP_BUTTON_RIGHT)) {
            mask |= BTN_RIGHT;
        }
        if (isButtonDown(pad, GP_BUTTON_A)) {
            mask |= BTN_A;
        }
        if (isButtonDown(pad, GP_BUTTON_B)) {
            mask |= BTN_B;
        }
        if (isButtonDown(pad, GP_BUTTON_X)) {
            mask |= BTN_X;
        }
        if (isButtonDown(pad, GP_BUTTON_Y)) {
            mask |= BTN_Y;
        }
        if (isButtonDown(pad, GP_BUTTON_L)) {
            mask |= BTN_L;
        }
        if (isButtonDown(pad, GP_BUTTON_R)) {
            mask |= BTN_R;
        }
        if (isButtonDown(pad, GP_BUTTON_START)) {
            mask |= BTN_START;
        }
        if (isButtonDown(pad, GP_BUTTON_SELECT)) {
            mask |= BTN_SELECT;
        }

        return mask;
    }

    /**
     * Maps gamepad axis/button values into `AXIS_*` order.
     *
     * @param pad - Gamepad object from browser API.
     * @returns Axis tuple in engine API order.
     */
    private mapAxes(pad: Gamepad): PlayerSnapshot['axes'] {
        const leftX = this.applyStickDeadZone(getAxis(pad, 0));
        const leftY = this.applyStickDeadZone(getAxis(pad, 1));
        const rightX = this.applyStickDeadZone(getAxis(pad, 2));
        const rightY = this.applyStickDeadZone(getAxis(pad, 3));
        const triggerL = getButtonValue(pad, 6);
        const triggerR = getButtonValue(pad, 7);

        return [leftX, leftY, rightX, rightY, triggerL, triggerR];
    }

    /**
     * Applies configured dead zone and re-normalizes stick range.
     *
     * @param value - Raw stick axis value.
     * @returns Dead-zone filtered value.
     */
    private applyStickDeadZone(value: number): number {
        const abs = Math.abs(value);

        if (abs <= this.deadZone) {
            return 0;
        }

        const normalized = (abs - this.deadZone) / (1 - this.deadZone);

        return Math.sign(value) * Math.min(1, normalized);
    }

    /**
     * Validates player slot index.
     *
     * @param player - Caller-supplied player index.
     * @returns Normalized index or `null` when invalid.
     */
    private normalizePlayer(player: number): number | null {
        if (!Number.isInteger(player) || player < 0 || player >= GAMEPAD_PLAYER_COUNT) {
            return null;
        }

        return player;
    }

    /**
     * Stores first-press ticks for newly pressed buttons in this frame.
     *
     * @param player - Player slot index.
     * @param edgeMask - Newly pressed button bits.
     * @param tick - Current engine tick.
     */
    private recordNewPressTicks(player: number, edgeMask: number, tick: number): void {
        const table = this.firstPressTick[player];

        if (!table) {
            return;
        }

        for (const flag of VALID_BUTTON_FLAGS) {
            if ((edgeMask & flag) !== 0 && !table.has(flag)) {
                table.set(flag, tick);
            }
        }
    }

    /**
     * Finds the oldest held-button first-press tick within `heldMask`.
     *
     * @param player - Player slot index.
     * @param heldMask - Currently held button bits.
     * @returns Earliest held-button tick anchor, if any.
     */
    private getMinFirstPressTick(player: number, heldMask: number): number | undefined {
        const table = this.firstPressTick[player];

        if (!table) {
            return undefined;
        }

        let min: number | undefined;

        for (const flag of VALID_BUTTON_FLAGS) {
            if ((heldMask & flag) === 0) {
                continue;
            }

            const t = table.get(flag);

            if (t !== undefined && (min === undefined || t < min)) {
                min = t;
            }
        }

        return min;
    }

    /**
     * Removes repeat anchors for buttons no longer held.
     *
     * @param player - Player slot index.
     * @param heldMask - Current held button mask.
     */
    private dropReleasedTickAnchors(player: number, heldMask: number): void {
        const table = this.firstPressTick[player];

        if (!table) {
            return;
        }

        for (const flag of VALID_BUTTON_FLAGS) {
            if ((heldMask & flag) === 0) {
                table.delete(flag);
            }
        }
    }

    /**
     * Clears all snapshots and repeat anchors.
     */
    private clearAllState(): void {
        for (let i = 0; i < GAMEPAD_PLAYER_COUNT; i++) {
            const current = this.current[i];
            const previous = this.previous[i];

            if (current) {
                current.isConnected = false;
                current.buttons = 0;
                current.axes = [0, 0, 0, 0, 0, 0];
            }

            if (previous) {
                previous.isConnected = false;
                previous.buttons = 0;
                previous.axes = [0, 0, 0, 0, 0, 0];
            }

            this.firstPressTick[i]?.clear();
        }
    }
}
