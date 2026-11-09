/**
 * Module-scoped seam between `AudioManager` and `AudioClip`: the decode context `AudioClip`
 * decodes and synthesizes against, and the two callbacks it fires on unload and hot-replace.
 *
 * Follows the module-level state style used in `AssetLoader.ts`: one plain mutable object
 * rather than a class, since there is exactly one live audio subsystem per engine instance.
 * `AudioManager.attach()` fills it in; `AudioManager.detach()` puts the idle defaults back.
 */

/** Shape of {@link audioHooks}. */
interface Hooks {
    /** Context `AudioClip.load()` and `AudioClip.synth()` decode against, or `null` when none is attached. */
    context: AudioContext | null;

    /**
     * Called by `AudioClip.unload()` and `AudioClip.hotReload()` with the buffer being released.
     * `AudioManager` wires `VoicePool.stopVoicesUsingBuffer` here so an unloaded clip can never
     * keep playing from a stale node.
     */
    onUnload: (buffer: AudioBuffer) => void;

    /**
     * Called by `AudioClip.hotReload()` after swapping a clip's buffer in place. `AudioManager`
     * wires `MusicPlayer.hotReplaceCurrentBuffer` here (see BT-305) so a hot-reloaded music track
     * keeps playing. Returns whether playback restarted with `newBuffer`.
     */
    onHotReplace: (oldBuffer: AudioBuffer, newBuffer: AudioBuffer) => boolean;
}

/** Defaults while no audio subsystem is attached: no context, no-op callbacks. */
const IDLE: Readonly<Hooks> = Object.freeze({
    context: null,
    onUnload: () => {},
    onHotReplace: () => false,
});

/** The live hooks. Read by `AudioClip`; written only by `AudioManager.attach()` and {@link resetAudioHooks}. */
export const audioHooks: Hooks = { ...IDLE };

/** Restores the idle defaults, so the hooks never point at a closed context or a dropped pool. */
export function resetAudioHooks(): void {
    Object.assign(audioHooks, IDLE);
}
