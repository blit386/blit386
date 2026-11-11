/**
 * Options for the `blit386` Vite plugin ({@link "./index".blit386}): the public option shape,
 * its defaults, and the resolution step that applies the Vite root to `assetDirs`.
 */

import path from 'node:path';

import { ASSET_KINDS, type AssetChangedPayload } from '../hot/protocol';
import {
    vitePluginAssetDirsError,
    vitePluginAssetKindError,
    vitePluginBooleanOptionError,
    vitePluginExtensionKeyError,
} from '../utils/errorMessages/vite';

/**
 * Asset kind used to route a changed asset to the right hot-replace handler.
 *
 * @since 1.4.0
 */
export type AssetKind = AssetChangedPayload['type'];

/**
 * Options for the `blit386` Vite plugin. Every field is optional.
 *
 * @since 1.4.0
 */
export interface Blit386PluginOptions {
    /**
     * Predicate selecting which modules get the hot-reload snippet appended.
     * Default: a module id under `/src/` ending `.js`, `.ts`, `.mjs`, or `.mts`.
     */
    include?: (id: string) => boolean;

    /**
     * Directories to watch for asset changes, resolved against the Vite root. Only selects which files are
     * watched; the broadcast URL follows Vite's serving rules (`base` plus the path under `publicDir`, or under the
     * root for a file outside it). A folder outside both is not hot reloaded. Default: Vite's `publicDir`
     * (`public` unless the Vite config changes it; nothing is watched when `publicDir` is `false`).
     */
    assetDirs?: string[];

    /**
     * Maps a lowercased file extension (with leading dot) to an asset kind. Merged over, not replacing, the
     * defaults: image (`.png`, `.gif`, `.webp`, `.jpg`, `.jpeg`), audio (`.wav`, `.mp3`, `.ogg`, `.flac`), font
     * (`.btfont`).
     */
    assetTypes?: Record<string, AssetKind>;

    /** Whether an asset change with an unrecognized extension triggers a full page reload. Default: `true`. */
    fullReloadOnUnknownAssets?: boolean;
}

/**
 * Fully resolved plugin options, with `root` already applied to {@link Blit386PluginOptions.assetDirs}.
 *
 * @since 1.4.0
 */
export interface ResolvedBlit386PluginOptions {
    /** See {@link Blit386PluginOptions.include}. */
    include: (id: string) => boolean;

    /** Absolute, root-resolved asset directories. */
    assetDirs: string[];

    /** Extension-to-asset-kind lookup, defaults merged with any user overrides. */
    assetTypes: Map<string, AssetKind>;

    /** See {@link Blit386PluginOptions.fullReloadOnUnknownAssets}. */
    fullReloadOnUnknownAssets: boolean;
}

/** Matches a module id under `/src/` ending a JS/TS extension, ignoring any query suffix. */
const DEFAULT_INCLUDE_PATTERN = /\/src\/.*\.(?:js|ts|mjs|mts)$/;

/** Default {@link Blit386PluginOptions.assetDirs} when Vite's `publicDir` is not known. */
const DEFAULT_ASSET_DIRS = ['public'];

/** Default {@link Blit386PluginOptions.assetTypes}. */
const DEFAULT_ASSET_TYPES: Record<string, AssetKind> = {
    '.png': 'image',
    '.gif': 'image',
    '.webp': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.wav': 'audio',
    '.mp3': 'audio',
    '.ogg': 'audio',
    '.flac': 'audio',
    '.btfont': 'font',
};

/**
 * Default {@link Blit386PluginOptions.include} predicate: a module id under `/src/` ending a JS/TS extension.
 *
 * @param id - Module id, possibly with a `?query` suffix.
 * @returns `true` when `id` (with any query suffix stripped) matches the default pattern.
 */
export function defaultInclude(id: string): boolean {
    const [pathWithoutQuery = id] = id.split('?');

    return DEFAULT_INCLUDE_PATTERN.test(pathWithoutQuery);
}

/**
 * Resolves user-provided {@link Blit386PluginOptions} against defaults, applying `root` to `assetDirs`.
 *
 * @param options - User-provided options, or `undefined` for all defaults.
 * @param root - Vite's resolved project root (absolute path).
 * @param publicDir - Vite's resolved `publicDir` (absolute, or `''` for `publicDir: false`). When given and
 *   `options.assetDirs` is not, it becomes the only asset directory (none for `''`).
 * @returns Fully resolved options.
 * @throws Error naming the option when a value has the wrong shape (the options come from plain-JS config files).
 */
export function resolveOptions(
    options: Blit386PluginOptions | undefined,
    root: string,
    publicDir?: string,
): ResolvedBlit386PluginOptions {
    validateOptions(options ?? {});

    const defaultDirs = publicDir === undefined ? DEFAULT_ASSET_DIRS : publicDir === '' ? [] : [publicDir];
    const assetDirs = (options?.assetDirs ?? defaultDirs).map((dir) => path.resolve(root, dir));
    const assetTypes = new Map(Object.entries({ ...DEFAULT_ASSET_TYPES, ...options?.assetTypes }));

    return {
        include: options?.include ?? defaultInclude,
        assetDirs,
        assetTypes,
        fullReloadOnUnknownAssets: options?.fullReloadOnUnknownAssets ?? true,
    };
}

/**
 * Throws a clear error for an option value a plain-JS `vite.config.js` can pass but the plugin would misread: an
 * unknown asset kind, an extension key that never matches (no dot, uppercase), a non-boolean flag, or a non-list
 * `assetDirs`.
 *
 * @param options - User-provided options, read as untyped values.
 */
function validateOptions(options: Blit386PluginOptions): void {
    const { assetDirs, assetTypes, fullReloadOnUnknownAssets }: Record<string, unknown> = { ...options };

    if (assetDirs !== undefined && (!Array.isArray(assetDirs) || !assetDirs.every((dir) => typeof dir === 'string'))) {
        throw new Error(vitePluginAssetDirsError(assetDirs));
    }

    if (fullReloadOnUnknownAssets !== undefined && typeof fullReloadOnUnknownAssets !== 'boolean') {
        throw new Error(vitePluginBooleanOptionError('fullReloadOnUnknownAssets', fullReloadOnUnknownAssets));
    }

    for (const [extension, kind] of Object.entries(assetTypes ?? {})) {
        if (extension.length < 2 || !extension.startsWith('.') || extension !== extension.toLowerCase()) {
            throw new Error(vitePluginExtensionKeyError(extension));
        }

        if (!(ASSET_KINDS as readonly unknown[]).includes(kind)) {
            throw new Error(vitePluginAssetKindError(extension, kind, ASSET_KINDS));
        }
    }
}
