/**
 * Integer vector math messages.
 */

/**
 * Returns the error message for a `Vector2i` division by zero.
 *
 * @param method - Public method name that was called (`div`, `divTo`, `divInPlace`).
 * @returns User-facing error string.
 */
export function vectorDivideByZeroError(method: string): string {
    return `Can't divide by zero. Use a non-zero number for Vector2i.${method}.`;
}
