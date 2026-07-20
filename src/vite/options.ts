/**
 * Options for the `blit386` Vite plugin ({@link "./index".blit386}): the public option shape,
 * its defaults, and the resolution step that applies the Vite root to `assetDirs`.
 */

import path from 'node:path';

import type { AssetChangedPayload } from '../hot/protocol';

/** Asset kind used to route a changed asset to the right hot-replace handler. */
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

    /** Directories to watch for asset changes, resolved against the Vite root. Default: `['public']`. */
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

/** Fully resolved plugin options, with `root` already applied to {@link Blit386PluginOptions.assetDirs}. */
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

/** Default {@link Blit386PluginOptions.assetDirs}. */
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
    const [pathWithoutQuery] = id.split('?');

    return DEFAULT_INCLUDE_PATTERN.test(pathWithoutQuery ?? id);
}

/**
 * Resolves user-provided {@link Blit386PluginOptions} against defaults, applying `root` to `assetDirs`.
 *
 * @param options - User-provided options, or `undefined` for all defaults.
 * @param root - Vite's resolved project root (absolute path).
 * @returns Fully resolved options.
 */
export function resolveOptions(options: Blit386PluginOptions | undefined, root: string): ResolvedBlit386PluginOptions {
    const assetDirs = (options?.assetDirs ?? DEFAULT_ASSET_DIRS).map((dir) => path.resolve(root, dir));
    const assetTypes = new Map(Object.entries({ ...DEFAULT_ASSET_TYPES, ...options?.assetTypes }));

    return {
        include: options?.include ?? defaultInclude,
        assetDirs,
        assetTypes,
        fullReloadOnUnknownAssets: options?.fullReloadOnUnknownAssets ?? true,
    };
}
