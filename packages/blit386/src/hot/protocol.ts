/**
 * Shared types and DOM/HMR event names for the engine hot-reload runtime.
 *
 * Value-free (types and string constants only) so it can be imported from both the
 * browser-facing `src/hot/` runtime and the `src/vite/` plugin package
 * without pulling `vite` into the published engine bundle.
 */

/**
 * Every asset kind the plugin can broadcast; the one list the payload type and the runtime check derive from.
 * `'image'`, `'audio'`, and `'font'` are hot-replaced in place; `'other'` is accepted but falls back to a hard reload.
 */
export const ASSET_KINDS = ['image', 'audio', 'font', 'other'] as const;

/**
 * Payload describing a changed asset, broadcast by the `blit386/vite` plugin's asset
 * watcher (`src/vite/assets.ts`) as a Vite custom HMR event.
 *
 * `type` is one of {@link ASSET_KINDS}: today's values are the asset kinds the engine can
 * hot-replace (BT-305); future kinds (levels, maps, animations) can extend that list
 * without changing the event name or the envelope shape.
 */
export interface AssetChangedPayload {
    /** URL of the changed asset, matching whatever the engine cached it under. */
    url: string;

    /** Asset kind, used to route to the right hot-replace handler. */
    type: (typeof ASSET_KINDS)[number];

    /** `Date.now()` when the plugin observed the change, for logging/ordering. */
    timestamp: number;
}

/** Vite custom HMR event name for asset changes; shared between the plugin and the engine. */
export const ASSET_CHANGED_EVENT = 'blit386:asset-changed';

/** DOM `CustomEvent` name dispatched on the engine canvas after a hot reload. */
export const HOT_RELOAD_DOM_EVENT = 'blit386:hot-reload';
