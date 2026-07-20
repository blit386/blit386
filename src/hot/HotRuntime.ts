/**
 * Vite HMR context registration, hot-swap generation counter, hard-reload
 * request, and hot-reload broadcast for the engine's hot-reload runtime.
 *
 * Depends on `BTAPI` (for the canvas to dispatch the broadcast on) but never
 * on `vite` itself - {@link HotContext} is a structural type matching Vite's
 * `import.meta.hot`, not an import from the `vite` package.
 */

import { BTAPI } from '../core/BTAPI';
import { ASSET_CHANGED_EVENT, HOT_RELOAD_DOM_EVENT } from './protocol';

/**
 * Minimal structural shape of Vite's `import.meta.hot` context that the engine
 * depends on. Kept structural (not imported from `vite`) so the published
 * engine bundle never depends on Vite's types or runtime.
 *
 * @since 1.4.0
 */
export interface HotContext {
    /** Persistent data bag Vite preserves across a module's hot replacement. */
    data: Record<string, unknown>;

    /** Subscribes to a Vite custom HMR event (for example an asset-changed broadcast). */
    on(event: string, callback: (payload: unknown) => void): void;

    /** Requests Vite fall back to a full page reload, with an optional reason string. */
    invalidate(message?: string): void;

    /** Marks the current module as self-accepting; called once by the injected snippet. */
    accept(): void;
}

/** Registered Vite HMR context, or `null` before {@link registerHotContext} runs. */
let hot: HotContext | null = null;

/** Hot-swap generation counter; advanced only through {@link nextGeneration}. */
let generation = 0;

/**
 * True once {@link registerHotContext} has wired the asset-changed listener, so a
 * re-evaluated entry module (every hot reload re-runs top-level module code) does
 * not attach the listener a second time.
 */
let wired = false;

/**
 * Placeholder asset-changed handler; replaced with real hot-replace routing to
 * `AssetLoader`/`SpriteSheet`/`AudioClip`/`BitmapFont` in BT-305.
 *
 * @param payload - Asset-changed event payload from the Vite plugin.
 */
function handleAssetChanged(payload: unknown): void {
    void payload;
}

/**
 * Registers the active Vite HMR context and wires the asset-changed listener
 * exactly once.
 *
 * The entire body runs in try/catch: this function executes synchronously at
 * the entry module's top level (via the snippet the `blit386/vite` plugin
 * injects), so a throw here (for example from an incompatible or broken `hot`
 * object) must not abort loading the game.
 *
 * @param context - Vite's `import.meta.hot` context.
 */
export function registerHotContext(context: HotContext): void {
    try {
        if (!wired) {
            context.on(ASSET_CHANGED_EVENT, handleAssetChanged);
            wired = true;
        }

        hot = context;
    } catch (err) {
        console.error('[BT] Failed to register the hot-reload context:', err);
    }
}

/**
 * Registers the active Vite HMR context so the engine can hot-swap the demo
 * class in place instead of reloading the page.
 *
 * Wired automatically by the snippet the `blit386/vite` plugin (BT-306)
 * injects into a demo/game's entry module, immediately after the
 * `bootstrap(Game)` call:
 *
 * ```js
 * import { registerHotReload as __blit386_registerHotReload } from 'blit386';
 * if (import.meta.hot) {
 *     import.meta.hot.accept();
 *     __blit386_registerHotReload(import.meta.hot);
 * }
 * ```
 *
 * Never called by hand - it does nothing useful without the plugin's matching
 * asset watcher and snippet injection.
 *
 * @since 1.4.0
 * @param hot - Vite's `import.meta.hot` context (or a structurally compatible object).
 */
export function registerHotReload(hot: HotContext): void {
    registerHotContext(hot);
}

/**
 * Reports whether a Vite HMR context is registered.
 *
 * Gates dev-only registries and logic so production builds (no
 * `import.meta.hot`, so {@link registerHotContext} never runs) pay nothing for
 * hot reload.
 *
 * @returns `true` once {@link registerHotContext} has run.
 */
export function isHotActive(): boolean {
    return hot !== null;
}

/**
 * Advances and returns the module-level hot-swap generation counter.
 *
 * @returns The new generation number after incrementing.
 */
export function nextGeneration(): number {
    generation += 1;

    return generation;
}

/**
 * Requests a full page reload through Vite's invalidation API, falling back to
 * a direct reload when no HMR context is registered.
 *
 * @param reason - Human-readable reason surfaced in Vite's overlay/log.
 */
export function requestHardReload(reason: string): void {
    if (hot) {
        hot.invalidate(reason);

        return;
    }

    globalThis.location.reload();
}

/**
 * Logs and broadcasts a completed hot reload.
 *
 * Dispatches on the engine canvas so games can add a listener scoped to their
 * own canvas element; falls back to `window` before the canvas exists.
 *
 * @param reason - Which swap tier ran (`'methods'` mutated the prototype in place; `'reinit'` re-ran `init()`).
 * @param generationValue - Generation number after this swap.
 * @param elapsedMs - Wall-clock duration of the swap, for the console line.
 */
export function announce(reason: 'methods' | 'reinit', generationValue: number, elapsedMs: number): void {
    console.log(`[BT] Hot reload #${generationValue} (${reason}) in ${elapsedMs.toFixed(1)}ms`);

    const target: EventTarget = BTAPI.instance.getCanvas() ?? globalThis.window;

    target.dispatchEvent(
        new CustomEvent(HOT_RELOAD_DOM_EVENT, {
            detail: { reason, generation: generationValue },
            bubbles: true,
            composed: true,
        }),
    );
}
