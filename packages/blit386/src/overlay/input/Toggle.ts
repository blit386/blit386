import type { KeyboardInput } from '../../input/KeyboardInput';
import type { PointerInput } from '../../input/PointerInput';
import { POINTER_SLOT_COUNT } from '../../input/PointerInput';
import type { Rect2i } from '../../utils/Rect2i';
import { isPointerInOverlayToggleCorner } from '../layout/layoutHelpers';
import { OVERLAY_TOGGLE_KEY_CODE, POINTER_PRIMARY_BUTTON } from './constants';

/**
 * Handles overlay body visibility toggle input (Backquote and corner pointer).
 */
export class Toggle {
    #isBodyVisible: boolean;

    readonly #isEnabled: boolean;

    /**
     * Creates toggle state from configure-time visibility and input flags.
     *
     * @param isOverlayVisibleAtStart – Initial overlay body visibility from configure.
     * @param isOverlayToggleEnabled – When false, toggle input is ignored.
     */
    constructor(isOverlayVisibleAtStart = false, isOverlayToggleEnabled = true) {
        this.#isBodyVisible = isOverlayVisibleAtStart;
        this.#isEnabled = isOverlayToggleEnabled;
    }

    /**
     * Whether the overlay body is currently drawn (runtime toggle).
     *
     * @returns `true` while metrics bars and palette grid are rendered.
     */
    get isBodyVisible(): boolean {
        return this.#isBodyVisible;
    }

    /**
     * Handles toggle input (Backquote and bottom-left corner press).
     *
     * @param pointer – Pointer subsystem, or `null` when unavailable.
     * @param isTogglePressed – Whether the Backquote toggle key edge fired this frame. Callers must
     * sample this before the keyboard subsystem's own end-of-tick edge reset runs, so a press landing
     * inside a fixed-update tick is not lost by the time this render-phase check runs.
     * @param toggleRect – Bottom-left toggle hit region.
     * @param isPointerPressConsumed – When true, skip pointer corner toggle (palette swatch handled the press).
     */
    handleInput(
        pointer: PointerInput | null,
        isTogglePressed: boolean,
        toggleRect: Rect2i,
        isPointerPressConsumed = false,
    ): void {
        if (!this.#isEnabled) {
            return;
        }

        if (isTogglePressed) {
            this.#isBodyVisible = !this.#isBodyVisible;

            return;
        }

        if (!pointer || isPointerPressConsumed) {
            return;
        }

        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            if (!pointer.isButtonPressed(POINTER_PRIMARY_BUTTON, slot)) {
                continue;
            }

            const pos = pointer.getPos(slot);

            if (isPointerInOverlayToggleCorner(pos, toggleRect)) {
                this.#isBodyVisible = !this.#isBodyVisible;

                return;
            }
        }
    }

    /**
     * Backward-compatible alias for {@link handleInput}.
     *
     * @deprecated Deprecated since 1.1.0 (2026-05-31). Use {@link handleInput} instead.
     * @param pointer – Pointer subsystem, or `null` when unavailable.
     * @param keyboard – Keyboard subsystem, or `null` when unavailable.
     * @param currentTick – Current fixed-update tick for keyboard edge detection.
     * @param toggleRect – Bottom-left toggle hit region.
     * @param isPointerPressConsumed – When true, skip pointer corner toggle.
     */
    handleToggle(
        pointer: PointerInput | null,
        keyboard: KeyboardInput | null,
        currentTick: number,
        toggleRect: Rect2i,
        isPointerPressConsumed = false,
    ): void {
        const isTogglePressed = keyboard?.isKeyPressed(OVERLAY_TOGGLE_KEY_CODE, undefined, currentTick) ?? false;

        this.handleInput(pointer, isTogglePressed, toggleRect, isPointerPressConsumed);
    }
}
