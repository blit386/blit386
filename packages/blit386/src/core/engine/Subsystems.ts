/**
 * Attaching and clearing the engine's input, audio, overlay and reduced-motion subsystems during init.
 * Part of {@link BTAPI}; not part of the BT API.
 */

import { AudioManager } from '../../audio/AudioManager';
import { GamepadInput } from '../../input/GamepadInput';
import { KeyboardInput } from '../../input/KeyboardInput';
import { setKeyboardLayout } from '../../input/keyboardRuntimeMaps';
import { PointerInput } from '../../input/PointerInput';
import { createOverlayLayout, Overlay, resolveOverlayTopLeftLabel } from '../../overlay';
import * as errorMessages from '../../utils/errorMessages';
import type { BTAPI } from '../BTAPI';
import { DEFAULT_AUDIO_VOICES } from '../mergeHardwareSettings';
import { ReducedMotion } from '../ReducedMotion';

/** Attaches and clears the input, audio, overlay and reduced-motion subsystems. */
export class Subsystems {
    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

    /**
     * Creates the engine overlay when enabled in hardware settings.
     */
    public setupOverlay(): void {
        this.engine.overlay = null;

        const hw = this.engine.hwSettings;

        if (!hw || hw.isOverlayEnabled === false || !this.engine.systemFont) {
            return;
        }

        const lineHeight = this.engine.systemFont.measureTextSize('A').height;
        const layout = createOverlayLayout(hw.displaySize.x, hw.displaySize.y, lineHeight);
        const pageTitle = typeof globalThis.document === 'undefined' ? undefined : globalThis.document.title;

        if (!this.engine.activeBackend) {
            throw new Error(errorMessages.OVERLAY_NO_BACKEND_MESSAGE);
        }

        this.engine.overlay = new Overlay(layout, resolveOverlayTopLeftLabel(pageTitle), this.engine.activeBackend, hw);
    }

    /**
     * Attaches pointer, keyboard, and gamepad input to the canvas.
     *
     * @param canvas - Render target canvas.
     */
    public attachInputSubsystems(canvas: HTMLCanvasElement): void {
        const hw = this.engine.hwSettings;

        if (!hw) {
            return;
        }

        this.engine.pointer?.detach();
        this.engine.pointer = new PointerInput();
        this.engine.pointer.attach(canvas, hw.displaySize);
        this.engine.pointer.setIsCapturingScroll(hw.isCapturingPointerScroll === true);

        this.engine.keyboard?.detach();
        this.engine.keyboard = new KeyboardInput();
        this.engine.keyboard.attach(canvas, {
            getTicks: () => this.engine.loop?.getTicks() ?? 0,
        });
        this.engine.keyboard.setIsCapturingScroll(hw.isCapturingKeyboardScroll === true);
        // Seed the keyboard maps before the game's init() runs, so BT.inputMap calls there win.
        setKeyboardLayout(hw.keyboardLayout ?? 'versus');

        // Own listener, separate from KeyboardInput - see handleClipboardShortcutKeydown's
        // doc comment. Remove-before-add guards against a duplicate registration if this
        // method ever runs twice against the same canvas.
        canvas.removeEventListener('keydown', this.engine.capture.handleClipboardShortcutKeydown);
        canvas.addEventListener('keydown', this.engine.capture.handleClipboardShortcutKeydown);

        this.engine.gamepad?.detach();
        this.engine.gamepad = new GamepadInput();
        this.engine.gamepad.attach();
    }

    /**
     * Attaches the audio context, bus graph, and unlock listeners to the canvas.
     *
     * @param canvas - Render target canvas.
     */
    public attachAudioSubsystem(canvas: HTMLCanvasElement): void {
        const hw = this.engine.hwSettings;

        if (!hw) {
            return;
        }

        this.engine.audio?.detach();
        this.engine.audio = new AudioManager();
        this.engine.audio.attach(canvas, hw.audioVoices ?? DEFAULT_AUDIO_VOICES);

        if (this.engine.diagnostics.isCollectAudioMetersEnabled) {
            this.engine.audio.enableBusMetering();
        }
    }

    /**
     * Attaches the reduced-motion preference listener, forwarding to the active demo's
     * optional {@link IBTDemo.onReducedMotionChange} looked up at call time, so hot swaps of
     * either tier reach the current handler.
     *
     * Extracted from {@link BTAPI.init} to keep that method's cyclomatic complexity within the
     * project's lint threshold, following the same pattern as {@link attachInputSubsystems}
     * and {@link attachAudioSubsystem}.
     */
    public attachReducedMotion(): void {
        this.engine.reducedMotion?.detach();
        this.engine.reducedMotion = new ReducedMotion();
        this.engine.reducedMotion.attach((prefersReduced) => this.engine.demo?.onReducedMotionChange?.(prefersReduced));
    }

    /**
     * Removes pointer, keyboard, gamepad, and audio subsystems.
     *
     * Pointer/keyboard detach DOM listeners; gamepad detaches polling state; audio
     * detaches unlock listeners and closes the audio context. All subsystem
     * references are cleared so listeners/contexts do not leak across restarts. Also
     * removes {@link FrameCaptureCommands.handleClipboardShortcutKeydown}, the bare-F9 listener attached
     * directly to the canvas outside `KeyboardInput`.
     */
    public clearInputSubsystems(): void {
        this.engine.pointer?.detach();
        this.engine.pointer = null;

        this.engine.keyboard?.detach();
        this.engine.keyboard = null;

        this.engine.canvas?.removeEventListener('keydown', this.engine.capture.handleClipboardShortcutKeydown);

        this.engine.gamepad?.detach();
        this.engine.gamepad = null;

        this.engine.audio?.detach();
        this.engine.audio = null;
    }
}
