/**
 * `blit386/vite` plugin option messages. The options come from a plain-JavaScript `vite.config.js`, so nothing but
 * these checks stands between a typo and a plugin that silently does the wrong thing.
 */

/**
 * Returns the error message for an `assetTypes` value that is not one of the asset kinds.
 *
 * @param extension - The `assetTypes` key the bad value sits under.
 * @param kind - The value supplied.
 * @param kinds - Every accepted asset kind.
 * @returns User-facing error string.
 */
export function vitePluginAssetKindError(extension: string, kind: unknown, kinds: readonly string[]): string {
    return (
        `The blit386 vite plugin option assetTypes['${extension}'] is ${JSON.stringify(kind)}, which is not an asset kind. ` +
        `Use one of ${kinds.map((name) => `'${name}'`).join(', ')}`
    );
}

/**
 * Returns the error message for an `assetTypes` key that can never match a file extension.
 *
 * @param extension - The key supplied.
 * @returns User-facing error string.
 */
export function vitePluginExtensionKeyError(extension: string): string {
    return (
        `The blit386 vite plugin option assetTypes has the key '${extension}', which never matches a file. ` +
        `Write each extension in lowercase with a leading dot, like '.png'`
    );
}

/**
 * Returns the error message for a plugin option that must be a boolean.
 *
 * @param option - Option name.
 * @param value - The value supplied.
 * @returns User-facing error string.
 */
export function vitePluginBooleanOptionError(option: string, value: unknown): string {
    return `The blit386 vite plugin option ${option} is ${JSON.stringify(value)}. Use true or false, without quotes`;
}

/**
 * Returns the error message for an `assetDirs` value that is not a list of folder names.
 *
 * @param value - The value supplied.
 * @returns User-facing error string.
 */
export function vitePluginAssetDirsError(value: unknown): string {
    return (
        "The blit386 vite plugin option assetDirs must be a list of folder names, like ['public']. " +
        `Got ${JSON.stringify(value)}`
    );
}
