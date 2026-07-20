/**
 * Shared types and DOM/HMR event names for the engine hot-reload runtime.
 *
 * Value-free (types and string constants only) so it can be imported from both the
 * browser-facing `src/hot/` runtime and the future `src/vite/` plugin package (BT-306)
 * without pulling `vite` into the published engine bundle.
 */

/**
 * Payload describing a changed asset, broadcast by the `blit386/vite` plugin's asset
 * watcher (`src/vite/assets.ts`) as a Vite custom HMR event.
 *
 * `type` is an open string union: today's values are the asset kinds the engine can
 * hot-replace (BT-305); future kinds (levels, maps, animations) can extend this union
 * without changing the event name or the envelope shape.
 */
export interface AssetChangedPayload {
    /** URL of the changed asset, matching whatever the engine cached it under. */
    url: string;

    /** Asset kind, used to route to the right hot-replace handler. */
    type: 'image' | 'audio' | 'font' | 'other';

    /** `Date.now()` when the plugin observed the change, for logging/ordering. */
    timestamp: number;
}

/** Vite custom HMR event name for asset changes; shared between the plugin and the engine. */
export const ASSET_CHANGED_EVENT = 'blit386:asset-changed';

/** DOM `CustomEvent` name dispatched on the engine canvas after a hot reload. */
export const HOT_RELOAD_DOM_EVENT = 'blit386:hot-reload';
