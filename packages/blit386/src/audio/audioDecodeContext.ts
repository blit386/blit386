/**
 * Module-scoped audio decode/unload seam that `AudioClip` depends on for decoding
 * synthesized buffers and for unload notification.
 *
 * Follows the module-level state style used in `AssetLoader.ts`: plain
 * module-scoped variables rather than a class, since there is exactly one
 * live decode context and one unload handler per engine instance.
 */

/** Current decode `AudioContext`, or `null` when no context is registered. */
let decodeContext: AudioContext | null = null;

/**
 * Registers the `AudioContext` that `AudioClip.load()` will use to decode
 * audio data, or clears the registration.
 *
 * Called by {@link AudioManager.attach} / {@link AudioManager.detach} so this
 * registry stays in sync with the live context lifecycle.
 *
 * @param context - Context to register, or `null` to clear it.
 */
export function setAudioDecodeContext(context: AudioContext | null): void {
    decodeContext = context;
}

/**
 * Returns the currently registered decode `AudioContext`.
 *
 * @returns The registered context, or `null` when none is registered.
 */
export function getAudioDecodeContext(): AudioContext | null {
    return decodeContext;
}

/**
 * Handler invoked by `AudioClip.unload()` with the buffer being released.
 *
 * `AudioManager.attach()` registers `VoicePool.stopVoicesUsingBuffer` here so an unloaded
 * clip's audio can never keep playing from a stale node; `AudioManager.detach()` restores the
 * no-op default. Defaults to a no-op before the first `attach()`.
 */
let audioClipUnloadHandler: (buffer: AudioBuffer) => void = () => {};

/**
 * Registers the handler invoked by `AudioClip.unload()` with the released buffer.
 *
 * @param handler - Handler to invoke on unload.
 */
export function setAudioClipUnloadHandler(handler: (buffer: AudioBuffer) => void): void {
    audioClipUnloadHandler = handler;
}

/**
 * Invokes the registered unload handler with the buffer being released.
 *
 * Called by `AudioClip.unload()`; a no-op until a voice pool registers a
 * handler via {@link setAudioClipUnloadHandler}.
 *
 * @param buffer - Buffer being released.
 */
export function notifyAudioClipUnload(buffer: AudioBuffer): void {
    audioClipUnloadHandler(buffer);
}

/**
 * Handler invoked by `AudioClip.hotReload()` after swapping a clip's buffer in
 * place, to restart the music player if the replaced buffer was the current track.
 *
 * `AudioManager.attach()` registers `MusicPlayer.hotReplaceCurrentBuffer` here (see
 * BT-305) so a hot-reloaded music track keeps playing without a manual `BT.musicPlay`
 * call; `AudioManager.detach()` restores the no-op default. Defaults to a no-op
 * returning `false` before the first `attach()`.
 *
 * @returns Whether the handler restarted playback with the new buffer.
 */
let musicHotReplaceHandler: (oldBuffer: AudioBuffer, newBuffer: AudioBuffer) => boolean = () => false;

/**
 * Registers the handler invoked by `AudioClip.hotReload()` to restart the current
 * music track when its buffer was just hot-replaced.
 *
 * @param handler - Handler to invoke; returns whether it restarted playback.
 */
export function setMusicHotReplaceHandler(handler: (oldBuffer: AudioBuffer, newBuffer: AudioBuffer) => boolean): void {
    musicHotReplaceHandler = handler;
}

/**
 * Invokes the registered music hot-replace handler with the old and new buffers.
 *
 * Called by `AudioClip.hotReload()`; a no-op (returns `false`) until a music player
 * registers a handler via {@link setMusicHotReplaceHandler}.
 *
 * @param oldBuffer - Buffer being replaced.
 * @param newBuffer - Replacement buffer.
 * @returns Whether the music player restarted playback with `newBuffer`.
 */
export function notifyMusicHotReplace(oldBuffer: AudioBuffer, newBuffer: AudioBuffer): boolean {
    return musicHotReplaceHandler(oldBuffer, newBuffer);
}
