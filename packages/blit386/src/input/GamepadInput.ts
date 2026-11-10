/**
 * Gamepad input subsystem.
 *
 * Uses the browser Gamepad API. `navigator.getGamepads()` is polled exactly
 * once per rendered frame, inside {@link GamepadInput.endFrame}. Previous-state
 * (for edge detection via {@link GamepadInput.isButtonPressed} /
 * {@link GamepadInput.isButtonReleased} and repeat anchors) rolls over once per
 * fixed update, inside {@link GamepadInput.endUpdate}, so every edge is reported
 * to exactly one update - like `KeyboardInput`. Public accessors read the cached
 * snapshot and never trigger a poll themselves.
 */
/* eslint-disable security/detect-object-injection */

import {
    ANY_BUTTON_MASK,
    GAMEPAD_AXIS_COUNT,
    type GamepadAxes,
    mapAxesInto,
    mapButtons,
    VALID_AXIS_INDICES,
    VALID_BUTTON_FLAGS,
} from './gamepadMapping';
import { isRepeatTick } from './repeatTick';

/** Maximum supported local gamepad players. */
export const GAMEPAD_PLAYER_COUNT = 4;

/** Marks a player seat with no gamepad on it. */
const NO_PAD_SLOT = -1;

/**
 * Per-player gamepad snapshot used for current state and the previous-update snapshot.
 */
interface PlayerSnapshot {
    /** Whether a gamepad is connected for this player slot. */
    isConnected: boolean;
    /** Current button-state bitmask (`BTN_*`). */
    buttons: number;
    /** Snapshot axis values in `AXIS_*` order. */
    axes: GamepadAxes;
}

/**
 * Polling-based gamepad input tracker with per-update previous-state snapshots.
 */
export class GamepadInput {
    /** Current polled state per player slot. */
    private readonly current: readonly [PlayerSnapshot, PlayerSnapshot, PlayerSnapshot, PlayerSnapshot];

    /** Snapshot taken at the last {@link GamepadInput.endUpdate}, per player slot. */
    private readonly previous: readonly [PlayerSnapshot, PlayerSnapshot, PlayerSnapshot, PlayerSnapshot];

    /** First tick each button was pressed per player (for repeat behavior). */
    private readonly firstPressTick: readonly [
        Map<number, number>,
        Map<number, number>,
        Map<number, number>,
        Map<number, number>,
    ];

    /** Browser gamepad index seated on each player, or `NO_PAD_SLOT` when the seat is free. */
    private readonly padSlots: number[] = [NO_PAD_SLOT, NO_PAD_SLOT, NO_PAD_SLOT, NO_PAD_SLOT];

    /** Event handler for `gamepadconnected`. */
    private readonly onConnected: (event: Event) => void;

    /** Event handler for `gamepaddisconnected`. */
    private readonly onDisconnected: (event: Event) => void;

    /** Creates a gamepad input tracker. */
    constructor() {
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
     * Polls gamepads once for the frame about to start. Call once per rendered
     * frame. It never rolls previous-state over, so an edge polled on a frame
     * that runs no update stays visible until an update reads it.
     */
    public endFrame(): void {
        this.poll();
    }

    /**
     * Ends a fixed update step: records the repeat anchor of every button that
     * went down since the last update, then snapshots current state into
     * previous-state. Call once per `demo.update()`, after it ran.
     *
     * @param currentTick - Tick of the update that just read input.
     */
    public endUpdate(currentTick: number): void {
        for (let i = 0; i < GAMEPAD_PLAYER_COUNT; i++) {
            const current = this.current[i];
            const previous = this.previous[i];

            if (!current || !previous) {
                continue;
            }

            const newPresses = current.buttons & ~previous.buttons;

            if (current.isConnected && newPresses !== 0) {
                this.recordNewPressTicks(i, newPresses, currentTick);
            }

            previous.isConnected = current.isConnected;
            previous.buttons = current.buttons;

            for (let a = 0; a < GAMEPAD_AXIS_COUNT; a++) {
                previous.axes[a] = current.axes[a] ?? 0;
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

        const current = this.current[index];
        const previous = this.previous[index];

        if (!current?.isConnected || !previous) {
            return false;
        }

        if ((this.getPressedMask(index) & buttonMask) !== 0) {
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

        return isRepeatTick(first, repeatRate, currentTick);
    }

    /**
     * Reports whether any button in `buttonMask` was released since the last update, including
     * when the gamepad disconnects while buttons were held.
     *
     * @param buttonMask - One or more `BTN_*` bit flags.
     * @param player - Zero-based player index.
     * @returns `true` when any requested button transitions from down to up.
     */
    public isButtonReleased(buttonMask: number, player: number): boolean {
        return buttonMask > 0 && (this.getReleasedMask(player) & buttonMask) !== 0;
    }

    /**
     * Every button that went down since the last update, as one mask. Edge only, no repeat. The one
     * home of the press-edge rule: {@link isButtonPressed} and the dev-only input trace both read it.
     *
     * @param player - Zero-based player index.
     * @returns `BTN_*` bits pressed since the last update, or `0`.
     */
    public getPressedMask(player: number): number {
        const index = this.normalizePlayer(player);
        const current = index === null ? undefined : this.current[index];
        const previous = index === null ? undefined : this.previous[index];

        if (!current?.isConnected || !previous) {
            return 0;
        }

        return current.buttons & ~previous.buttons;
    }

    /**
     * Every button that went up since the last update, as one mask; a disconnect releases every held
     * button. The one home of the release-edge rule: {@link isButtonReleased} and the dev-only input trace both read it.
     *
     * @param player - Zero-based player index.
     * @returns `BTN_*` bits released since the last update, or `0`.
     */
    public getReleasedMask(player: number): number {
        const index = this.normalizePlayer(player);
        const current = index === null ? undefined : this.current[index];
        const previous = index === null ? undefined : this.previous[index];

        if (!previous) {
            return 0;
        }

        if (!current?.isConnected) {
            return previous.isConnected ? previous.buttons : 0;
        }

        return ~current.buttons & previous.buttons;
    }

    /**
     * Whether any gamepad button is held for `player`. Sticks and triggers (analog or `BTN_L2` / `BTN_R2`) are not counted.
     *
     * @param player - Zero-based player index.
     * @returns `true` while any button is down.
     */
    public isAnyButtonDown(player: number): boolean {
        return this.isButtonDown(ANY_BUTTON_MASK, player);
    }

    /**
     * Press edge for any button: fires when a button goes down, even if others are already held.
     * With `repeatRate > 0` it also fires every `repeatRate` ticks while buttons stay held.
     *
     * @param player - Zero-based player index.
     * @param repeatRate - Ticks between repeats; omit or non-positive for edge only.
     * @param currentTick - Current fixed-update tick.
     * @returns `true` on a press edge or a repeat tick when configured.
     */
    public isAnyButtonPressed(player: number, repeatRate: number | undefined, currentTick: number): boolean {
        return this.isButtonPressed(ANY_BUTTON_MASK, player, repeatRate, currentTick);
    }

    /**
     * Release edge for "everything is up": no button is held now, and at least one was held at
     * the last update. Releasing one button while another stays down does not count; a
     * disconnect while buttons were held does.
     *
     * @param player - Zero-based player index.
     * @returns `true` on the first update after the last held button comes up.
     */
    public isAnyButtonReleased(player: number): boolean {
        const index = this.normalizePlayer(player);

        if (index === null) {
            return false;
        }

        const current = this.current[index];
        const previous = this.previous[index];

        if (!current || !previous || (previous.buttons & ANY_BUTTON_MASK) === 0) {
            return false;
        }

        return (current.buttons & ANY_BUTTON_MASK) === 0;
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

        return this.current[index]?.isConnected ?? false;
    }

    /**
     * Counts connected gamepads across tracked player slots.
     *
     * @returns Number of connected gamepads in `[0, GAMEPAD_PLAYER_COUNT]`.
     */
    public connectedCount(): number {
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
     * Polls `navigator.getGamepads()` and refreshes current snapshots.
     */
    private poll(): void {
        const pads = this.read();

        this.seatPads(pads);

        for (let player = 0; player < GAMEPAD_PLAYER_COUNT; player++) {
            const snapshot = this.current[player];

            if (!snapshot) {
                continue;
            }

            const slot = this.padSlots[player] ?? NO_PAD_SLOT;
            const pad = slot === NO_PAD_SLOT ? null : pads[slot];

            if (!pad?.connected) {
                snapshot.isConnected = false;
                snapshot.buttons = 0;
                snapshot.axes.fill(0);
                this.firstPressTick[player]?.clear();
                continue;
            }

            snapshot.isConnected = true;
            snapshot.buttons = mapButtons(pad);
            mapAxesInto(pad, snapshot.axes);
            this.dropReleasedTickAnchors(player, snapshot.buttons);
        }
    }

    /**
     * Seats browser gamepads on players. A newly connected pad takes the lowest free player
     * and keeps it until it disconnects, so Chromium's lone pad at browser index 1 is still
     * player 0, and a dropped pad never moves the other players to a different seat.
     *
     * @param pads - Result of `navigator.getGamepads()` for this poll.
     */
    private seatPads(pads: readonly (Gamepad | null)[]): void {
        for (let player = 0; player < GAMEPAD_PLAYER_COUNT; player++) {
            const slot = this.padSlots[player] ?? NO_PAD_SLOT;

            if (slot !== NO_PAD_SLOT && !pads[slot]?.connected) {
                this.padSlots[player] = NO_PAD_SLOT;
            }
        }

        for (let slot = 0; slot < pads.length; slot++) {
            if (!pads[slot]?.connected || this.padSlots.includes(slot)) {
                continue;
            }

            const freePlayer = this.padSlots.indexOf(NO_PAD_SLOT);

            if (freePlayer === -1) {
                break;
            }

            this.padSlots[freePlayer] = slot;

            // The seat may have been freed in this same poll; drop the old pad's press history.
            const previous = this.previous[freePlayer];

            if (previous) {
                previous.buttons = 0;
            }

            this.firstPressTick[freePlayer]?.clear();
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
     * Stores first-press ticks for buttons newly pressed since the last update.
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
                current.axes.fill(0);
            }

            if (previous) {
                previous.isConnected = false;
                previous.buttons = 0;
                previous.axes.fill(0);
            }

            this.firstPressTick[i]?.clear();
        }

        this.padSlots.fill(NO_PAD_SLOT);
    }
}
