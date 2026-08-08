/**
 * Asset hot-update handling for the `blit386` Vite plugin: maps a changed file under a
 * configured asset directory to its served URL, resolves its asset kind by extension, and
 * broadcasts a `blit386:asset-changed` (or full-reload) HMR payload.
 */

import path from 'node:path';

import { ASSET_CHANGED_EVENT } from '../hot/protocol';
import type { AssetKind } from './options';

/** Minimal shape of the payload {@link handleAssetHotUpdate} sends, matching Vite's HMR payload union. */
export type HotSendPayload = { type: 'custom'; event: string; data: unknown } | { type: 'full-reload' };

/** Parameters for {@link handleAssetHotUpdate}. */
export interface HandleAssetHotUpdateParams {
    /** Absolute path of the changed file, as reported by Vite's `hotUpdate` hook. */
    file: string;

    /** Name of the Vite dev environment this hot update fired for (`'client'`, `'ssr'`, ...). */
    environmentName: string;

    /** Sends an HMR payload to connected clients; matches Vite's `server.ws.send`. */
    send: (payload: HotSendPayload) => void;

    /** Resolved, absolute asset directories to watch. */
    assetDirs: readonly string[];

    /** Resolved extension-to-asset-kind lookup. */
    assetTypes: ReadonlyMap<string, AssetKind>;

    /** Whether an unrecognized extension under an asset dir triggers a full reload. */
    fullReloadOnUnknownAssets: boolean;
}

/**
 * Maps an absolute file path to its served URL when it falls under one of `assetDirs`.
 *
 * @param file – Absolute file path.
 * @param assetDirs – Resolved, absolute asset directories.
 * @returns A leading-slash URL relative to the matching asset dir, or `null` when `file` is outside all of them.
 */
export function resolveAssetUrl(file: string, assetDirs: readonly string[]): string | null {
    for (const dir of assetDirs) {
        const relative = path.relative(dir, file);

        if (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)) {
            return `/${relative.split(path.sep).join('/')}`;
        }
    }

    return null;
}

/**
 * Looks up a file's asset kind by its lowercased extension.
 *
 * @param file – File path.
 * @param assetTypes – Extension-to-asset-kind lookup.
 * @returns The matched asset kind, or `null` when the extension is not registered.
 */
export function assetTypeForFile(file: string, assetTypes: ReadonlyMap<string, AssetKind>): AssetKind | null {
    return assetTypes.get(path.extname(file).toLowerCase()) ?? null;
}

/**
 * Handles a single Vite `hotUpdate` event for a possible asset change: broadcasts a
 * `blit386:asset-changed` payload for a recognized asset kind, a `full-reload` for an
 * unrecognized one (when enabled), or defers to Vite's default handling otherwise.
 *
 * Only acts for the `'client'` environment – Vite's environment API fires `hotUpdate` once per
 * environment (`'client'` and `'ssr'` by default; verified empirically against this repo's
 * installed Vite version), and this plugin has nothing SSR-specific to do.
 *
 * @param params – See {@link HandleAssetHotUpdateParams}.
 * @returns `[]` (suppressing Vite's default module-graph update) when this handler acted; `undefined` otherwise.
 */
export function handleAssetHotUpdate(params: HandleAssetHotUpdateParams): [] | undefined {
    if (params.environmentName !== 'client') {
        return undefined;
    }

    const url = resolveAssetUrl(params.file, params.assetDirs);

    if (url === null) {
        return undefined;
    }

    const type = assetTypeForFile(params.file, params.assetTypes);

    if (type) {
        params.send({ type: 'custom', event: ASSET_CHANGED_EVENT, data: { url, type, timestamp: Date.now() } });

        return [];
    }

    if (params.fullReloadOnUnknownAssets) {
        params.send({ type: 'full-reload' });

        return [];
    }

    return undefined;
}
