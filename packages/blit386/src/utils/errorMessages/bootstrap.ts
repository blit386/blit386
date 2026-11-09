/**
 * Bootstrap and `configure()` messages: canvas lookup, engine start, keyboard layout.
 */

/**
 * Returns the canvas-not-found error message for the given canvas element ID.
 *
 * @param canvasID - The canvas element ID that was searched for.
 * @returns User-facing error string.
 */
export function canvasNotFoundError(canvasID: string): string {
    return `Can't find the canvas on the page. Make sure your HTML has a <canvas id='${canvasID}'> element.`;
}

/**
 * Generic engine initialization failure message.
 *
 * Shown when the engine returns false for any reason not covered by a more
 * specific GPU failure message.
 */
export const INIT_FAILED_MESSAGE =
    'Something went wrong starting the engine. Check the browser console (press F12) for details.';

/**
 * Describes an arbitrary `configure()` value for a diagnostic without ever throwing:
 * `JSON.stringify` output when it has one, otherwise a `<typeof>` placeholder (BigInt and
 * cyclic objects make `JSON.stringify` throw; functions and symbols make it return nothing).
 *
 * @param value - Value to describe.
 * @returns Short printable description.
 */
function describeConfigureValue(value: unknown): string {
    try {
        const json = JSON.stringify(value);

        if (json !== undefined) {
            return json;
        }
    } catch {
        // Fall through to the typeof placeholder.
    }

    return `<${typeof value}>`;
}

/**
 * Returns the warning for an unknown `keyboardLayout` hardware setting.
 *
 * @param value - Invalid `keyboardLayout` value from `configure()`.
 * @param validLayouts - Every accepted layout name.
 * @returns User-facing warning string.
 */
export function keyboardLayoutUnknownWarning(value: unknown, validLayouts: readonly string[]): string {
    const quoted = validLayouts.map((layout) => `'${layout}'`).join(' or ');

    return `keyboardLayout must be ${quoted} (got ${describeConfigureValue(value)}). Falling back to '${validLayouts[0]}'`;
}
