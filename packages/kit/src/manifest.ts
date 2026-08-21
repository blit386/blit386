/**
 * The `.blit/manifest.json` ownership manifest: where it lives and what shape it has.
 *
 * Single source of truth for both halves of the round trip. `create-blit386` stamps the manifest at
 * scaffold time; `blit agents sync` and `blit agents add` read it back, reconcile, and write it
 * again. Both import these declarations through `@blit386/kit/adapters`, so the two sides cannot
 * drift apart.
 *
 * A leaf module on purpose, like `ownership.ts`: one type-only import, no filesystem access, so
 * `adapters.ts` can depend on it without a cycle.
 */

import type { FileClass } from './ownership';

/** The per-project kit directory, relative to the project root. */
export const BLIT_DIR = '.blit';

/** The manifest filename inside `BLIT_DIR`. */
export const MANIFEST_FILE = 'manifest.json';

/**
 * The pristine-copies directory inside `BLIT_DIR`.
 *
 * Holds the kit content exactly as generated, which `sync` uses as the merge ancestor for a
 * three-way merge against the user's edits.
 */
export const BASE_DIR = 'base';

/** Template variables substituted into kit content (package-manager commands, project name, ...). */
export type TemplateVars = Record<string, string>;

/** One entry in `.blit/manifest.json`, as written. */
export interface ManifestEntry {
    /** File path relative to the project root, using forward slashes. */
    path: string;
    /** Ownership class determining how `blit agents sync` handles this file. */
    class: FileClass;
    /** Kit version that last wrote this file. */
    kitVersion: string;
    /**
     * SHA-256 hex digest of the reconciled on-disk content from the last sync (at scaffold time this
     * is simply the generated content). `--check`/doctor compare the current file against this to
     * detect drift, so a clean-merged file is in-sync, not flagged forever. The pristine kit version
     * used as the merge ancestor lives separately in `.blit/base/<path>`.
     */
    sha256: string;
}

/** The full `.blit/manifest.json` structure, as written. */
export interface BlitManifest {
    /** Kit version that last wrote this manifest. */
    kitVersion: string;
    /** ISO-8601 creation timestamp. */
    createdAt: string;
    /**
     * Template variables used at scaffold time (package-manager commands, project name, ...).
     * `blit agents sync` reads these back so it regenerates kit files with the exact same values,
     * independent of the environment it runs in.
     */
    vars: TemplateVars;
    /** One entry per generated file, sorted by path for stable diffs. */
    files: ManifestEntry[];
}

/** Widen `K` to optional, leaving every other field of `T` alone. */
type LegacyOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * `ManifestEntry` as read back from disk.
 *
 * `kitVersion` is widened because manifests written by older scaffolders lack it. See
 * `ReadBlitManifest` for why this is a derived type rather than a schema version.
 */
export type ReadManifestEntry = LegacyOptional<ManifestEntry, 'kitVersion'>;

/**
 * `BlitManifest` as read back from disk.
 *
 * The reader must accept manifests written by any released scaffolder, so fields that arrived after
 * the format did are optional here. Deriving that from the written shape – rather than declaring a
 * second, hand-maintained interface – is what keeps the two halves honest: a field added to
 * `BlitManifest` is required of every writer and simultaneously visible to the reader.
 *
 * This is also the shape `sync` and `add` write, not just read: both preserve `createdAt`/`vars`
 * only when the manifest they read had them, so a legacy manifest stays legacy rather than gaining
 * a fabricated creation timestamp.
 *
 * Deliberately not a schema version. A version field is absent from every manifest already in the
 * wild, so the reader would keep this widened branch indefinitely and gain a second one beside it;
 * and the v0-to-v1 upgrade that would justify the fork cannot be written honestly, since it would
 * have to invent a `createdAt` that no one knows.
 */
export type ReadBlitManifest = LegacyOptional<Omit<BlitManifest, 'files'>, 'createdAt' | 'vars'> & {
    /** One entry per tracked file. */
    files: ReadManifestEntry[];
};
