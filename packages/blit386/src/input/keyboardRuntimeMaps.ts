import type { KeyboardLayout } from '../core/IBTDemo';
import { createDefaultKeyboardRuntimeMaps } from './defaultKeyboardMap';

/**
 * Mutable runtime keyboard maps for keyboard players 0 and 1.
 *
 * Lives in its own module so both the `BT` facade (`BT.inputMap`, `BT.inputMapReset`,
 * face-button reads) and `BTAPI` (which seeds the maps from
 * `HardwareSettings.keyboardLayout` before the game's `init()`) can reach it without a
 * circular import.
 */

/** Layout the maps were last seeded from; `'versus'` until `BTAPI` applies `configure()`. */
let activeLayout: KeyboardLayout = 'versus';

/** Runtime face-button → key-code lists for keyboard player 0. */
let player0Keys: Map<number, string[]>;

/** Runtime face-button → key-code lists for keyboard player 1. */
let player1Keys: Map<number, string[]>;

/**
 * Replaces both runtime maps with fresh copies of the active layout's defaults.
 */
export function resetKeyboardFaceButtonMaps(): void {
    [player0Keys, player1Keys] = createDefaultKeyboardRuntimeMaps(activeLayout);
}

/**
 * Sets the active keyboard layout and reseeds both runtime maps from its defaults.
 *
 * @param layout - Layout to seed from.
 */
export function setKeyboardLayout(layout: KeyboardLayout): void {
    activeLayout = layout;
    resetKeyboardFaceButtonMaps();
}

/**
 * Returns the runtime key-code list for one face button of a keyboard player.
 *
 * @param player - Zero-based player index; only `0` and `1` have keyboard maps.
 * @param button - Face-button bit flag.
 * @returns Key codes, or `null` for players without a keyboard map or unknown buttons.
 */
export function getKeyboardFaceButtonKeys(player: number, button: number): readonly string[] | null {
    if (player === 0) {
        return player0Keys.get(button) ?? null;
    }

    if (player === 1) {
        return player1Keys.get(button) ?? null;
    }

    return null;
}

/**
 * Replaces the runtime key-code list for one face button of a keyboard player.
 *
 * @param player - Zero-based player index; indices other than `0` and `1` are ignored.
 * @param button - Face-button bit flag.
 * @param codes - `KeyboardEvent.code` values; the array is stored as given.
 */
export function setKeyboardFaceButtonKeys(player: number, button: number, codes: string[]): void {
    if (player === 0) {
        player0Keys.set(button, codes);
    } else if (player === 1) {
        player1Keys.set(button, codes);
    }
}

resetKeyboardFaceButtonMaps();
