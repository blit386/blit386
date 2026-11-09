/**
 * The CSS-like named-color registry behind `Color32.registerColor`, `updateColor`, `unregisterColor`, and
 * `resolveNamedColor`.
 *
 * Imports `Color32` as a type only: `Color32` builds its registry in a static field initializer, so a value import
 * here would read the class before it exists. The class passes in a factory for frozen colors instead.
 */

import type { Color32 } from './Color32';

/** Builds a frozen color from raw byte channels. */
type FrozenColorFactory = (r: number, g: number, b: number, a: number) => Color32;

/** Built-in colors as `[name, r, g, b]`, all fully opaque. */
const DEFAULT_COLORS: ReadonlyArray<readonly [string, number, number, number]> = [
    ['black', 0, 0, 0],
    ['white', 255, 255, 255],
    ['red', 255, 0, 0],
    ['green', 0, 255, 0],
    ['blue', 0, 0, 255],
    ['yellow', 255, 255, 0],
    ['cyan', 0, 255, 255],
    ['magenta', 255, 0, 255],
    ['gray', 128, 128, 128],
    ['orange', 255, 165, 0],
    ['pink', 255, 192, 203],
    ['purple', 128, 0, 128],
    ['brown', 165, 42, 42],
    ['lime', 0, 255, 0],
    ['navy', 0, 0, 128],
    ['teal', 0, 128, 128],
    ['maroon', 128, 0, 0],
    ['olive', 128, 128, 0],
    ['coral', 255, 127, 80],
    ['gold', 255, 215, 0],
    ['silver', 192, 192, 192],
    ['indigo', 75, 0, 130],
    ['violet', 238, 130, 238],
    ['turquoise', 64, 224, 208],
    ['salmon', 250, 128, 114],
    ['khaki', 240, 230, 140],
    ['plum', 221, 160, 221],
    ['crimson', 220, 20, 60],
    ['tomato', 255, 99, 71],
    ['cornflowerblue', 100, 149, 237],
];

/** Built-in aliases as `[alias, target]`; an alias shares its target's object, so updates and removals follow it. */
const DEFAULT_ALIASES: ReadonlyArray<readonly [string, string]> = [['grey', 'gray']];

/**
 * Case-insensitive name to frozen-color map, seeded with the built-in colors.
 */
export class NamedColorRegistry {
    /** Normalized name to frozen color; aliases share one object. */
    private readonly colors = new Map<string, Color32>();

    /**
     * Seeds the registry with the built-in colors and aliases.
     *
     * @param freeze - Builds a frozen color from raw byte channels.
     */
    public constructor(private readonly freeze: FrozenColorFactory) {
        for (const [name, r, g, b] of DEFAULT_COLORS) {
            this.colors.set(name, freeze(r, g, b, 255));
        }

        for (const [name, target] of DEFAULT_ALIASES) {
            const value = this.colors.get(target);
            if (value === undefined) {
                throw new Error(`Named color alias target '${target}' is not registered.`);
            }

            this.colors.set(name, value);
        }
    }

    /**
     * Adds a new name.
     *
     * @param name - Color name; trimmed and lowercased.
     * @param color - Color to store (copied and frozen).
     * @throws Error when the name is empty or already registered.
     */
    public register(name: string, color: Color32): void {
        const key = normalize(name);

        if (this.colors.has(key)) {
            throw new Error(`Named color '${key}' is already registered.`);
        }

        this.colors.set(key, this.copy(color));
    }

    /**
     * Replaces an existing name and every alias that shares its object.
     *
     * @param name - Existing color name or alias.
     * @param color - Replacement color (copied and frozen).
     * @throws Error when the name is empty or not registered.
     */
    public update(name: string, color: Color32): void {
        const current = this.require(name);
        const frozen = this.copy(color);

        for (const [key, value] of this.colors) {
            if (value === current) {
                this.colors.set(key, frozen);
            }
        }
    }

    /**
     * Removes an existing name and every alias that shares its object.
     *
     * @param name - Existing color name or alias.
     * @throws Error when the name is empty or not registered.
     */
    public unregister(name: string): void {
        const current = this.require(name);
        const keysToDelete: string[] = [];

        for (const [key, value] of this.colors) {
            if (value === current) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.colors.delete(key);
        }
    }

    /**
     * Looks up a name.
     *
     * @param name - Color name; trimmed and lowercased.
     * @returns The frozen color, or `undefined` when the name is unknown.
     * @throws Error when the name is empty.
     */
    public resolve(name: string): Color32 | undefined {
        return this.colors.get(normalize(name));
    }

    /**
     * Copies and freezes a caller's color so registry entries can never change under a reader.
     *
     * @param color - Source color.
     * @returns Frozen copy.
     */
    private copy(color: Color32): Color32 {
        return this.freeze(color.r, color.g, color.b, color.a);
    }

    /**
     * Returns the stored color for a name that must already exist.
     *
     * @param name - Color name or alias.
     * @returns The stored frozen color.
     * @throws Error when the name is empty or not registered.
     */
    private require(name: string): Color32 {
        const key = normalize(name);
        const current = this.colors.get(key);

        if (current === undefined) {
            throw new Error(`Named color '${key}' is not registered.`);
        }

        return current;
    }
}

/**
 * Normalizes a color name for case-insensitive lookups.
 *
 * @param name - Input color name.
 * @returns Trimmed lowercase name.
 * @throws Error when the name is empty after trimming.
 */
function normalize(name: string): string {
    const key = name.trim().toLowerCase();
    if (key.length === 0) {
        throw new Error('Color name cannot be empty.');
    }

    return key;
}
