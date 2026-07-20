/**
 * The `blit386/vite` dev-server plugin: injects the hot-reload registration snippet into a
 * demo/game's entry module and broadcasts asset changes under configured asset directories, so
 * edits hot-swap through the engine's runtime (`src/hot/`) instead of forcing a full page reload.
 *
 * Dev-only by construction (`apply: 'serve'`); production builds never see the injected snippet.
 * Uses Vite's `hotUpdate` environment-API hook rather than the legacy `handleHotUpdate` - verified
 * empirically that only `hotUpdate` fires for asset changes on the installed Vite version.
 */

import process from 'node:process';

import type { Plugin } from 'vite';

import { handleAssetHotUpdate } from './assets';
import type { Blit386PluginOptions } from './options';
import { resolveOptions } from './options';
import { injectSnippet, shouldInjectSnippet } from './transform';

export type { AssetKind, Blit386PluginOptions, ResolvedBlit386PluginOptions } from './options';

/**
 * Creates the `blit386/vite` dev-server plugin.
 *
 * @since 1.4.0
 * @param options - See {@link Blit386PluginOptions}; every field is optional.
 * @returns A Vite `Plugin`, active only in `serve` (dev-server) mode.
 *
 * @example
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { blit386 } from 'blit386/vite';
 *
 * export default defineConfig({
 *     plugins: [blit386()],
 * });
 */
export function blit386(options?: Blit386PluginOptions): Plugin {
    let resolved = resolveOptions(options, process.cwd());

    return {
        name: 'blit386',
        apply: 'serve',

        configResolved(config) {
            resolved = resolveOptions(options, config.root);
        },

        transform(code, id) {
            if (!shouldInjectSnippet(code, id, resolved.include)) {
                return null;
            }

            return injectSnippet(code);
        },

        // Method shorthand, not an arrow function - Vite needs its own `this` bound here for `this.environment`.
        hotUpdate(update) {
            return handleAssetHotUpdate({
                file: update.file,
                environmentName: this.environment.name,
                send: (payload) => update.server.ws.send(payload),
                assetDirs: resolved.assetDirs,
                assetTypes: resolved.assetTypes,
                fullReloadOnUnknownAssets: resolved.fullReloadOnUnknownAssets,
            });
        },
    };
}
