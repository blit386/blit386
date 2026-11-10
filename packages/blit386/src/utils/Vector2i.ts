import { vectorDivideByZeroError } from './errorMessages/math';
import { Vector2iOps } from './Vector2iOps';

/**
 * Integer 2D vector for pixel-perfect positioning.
 *
 * Used for points, sizes, directions, and camera offsets throughout the engine.
 * The API includes both allocation-free `*To()` / `*InPlace()` variants and
 * convenience methods that return new vectors.
 *
 * @since 0.1.0
 * @changed 1.8.1 `normalized()` of a zero vector returns a new mutable vector instead of the frozen `Vector2i.zero()`.
 */
export class Vector2i extends Vector2iOps {
    /** The cached singleton for zero vector. */
    private static readonly _zero: Vector2i = Object.freeze(Vector2i.fromXYUnchecked(0, 0));

    /** The cached singleton for one vector. */
    private static readonly _one: Vector2i = Object.freeze(Vector2i.fromXYUnchecked(1, 1));

    /** The cached singleton for the up direction. */
    private static readonly _up: Vector2i = Object.freeze(Vector2i.fromXYUnchecked(0, -1));

    /** The cached singleton for the down direction. */
    private static readonly _down: Vector2i = Object.freeze(Vector2i.fromXYUnchecked(0, 1));

    /** The cached singleton for the left direction. */
    private static readonly _left: Vector2i = Object.freeze(Vector2i.fromXYUnchecked(-1, 0));

    /** The cached singleton for the right direction. */
    private static readonly _right: Vector2i = Object.freeze(Vector2i.fromXYUnchecked(1, 0));

    /**
     * Creates an integer 2D vector, truncating inputs toward zero.
     *
     * @param x - Horizontal component (defaults to 0).
     * @param y - Vertical component (defaults to 0).
     */
    constructor(
        /** Horizontal component (defaults to 0). */
        public override x: number = 0,

        /** Vertical component (defaults to 0). */
        public override y: number = 0,
    ) {
        super();

        // Truncate to integer using bitwise OR (faster than Math.floor).
        // |0 truncates toward zero, which is acceptable for most use cases.
        this.x = x | 0;
        this.y = y | 0;
    }

    /**
     * Alias for `x` when treating the vector as a size.
     * @returns The x component as width.
     */
    get width(): number {
        return this.x;
    }

    /**
     * Sets width (x component), truncated to integer.
     *
     * @param value - The new width value.
     */
    set width(value: number) {
        this.x = value | 0;
    }

    /**
     * Alias for `y` when treating the vector as a size.
     * @returns The y component as height.
     */
    get height(): number {
        return this.y;
    }

    /**
     * Sets height (y component), truncated to integer.
     *
     * @param value - The new height value.
     */
    set height(value: number) {
        this.y = value | 0;
    }

    /**
     * Returns a zero vector (0, 0).
     * Returns a cached frozen singleton - do not modify.
     *
     * @returns Vector at origin (cached).
     */
    static zero(): Vector2i {
        return Vector2i._zero;
    }

    /**
     * Returns a unit vector (1, 1).
     * Returns a cached frozen singleton - do not modify.
     *
     * @returns Vector with both components set to 1 (cached).
     */
    static one(): Vector2i {
        return Vector2i._one;
    }

    /**
     * Returns an up direction vector (0, -1).
     * In screen coordinates, Y increases downward, so up is negative.
     * Returns a cached frozen singleton - do not modify.
     *
     * @returns Vector pointing up (cached).
     */
    static up(): Vector2i {
        return Vector2i._up;
    }

    /**
     * Returns a down direction vector (0, 1).
     * Returns a cached frozen singleton - do not modify.
     *
     * @returns Vector pointing down (cached).
     */
    static down(): Vector2i {
        return Vector2i._down;
    }

    /**
     * Returns a left-direction vector (-1, 0).
     * Returns a cached frozen singleton - do not modify.
     *
     * @returns Vector pointing left (cached).
     */
    static left(): Vector2i {
        return Vector2i._left;
    }

    /**
     * Returns a right-direction vector (1, 0).
     * Returns a cached frozen singleton - do not modify.
     *
     * @returns Vector pointing right (cached).
     */
    static right(): Vector2i {
        return Vector2i._right;
    }

    /**
     * Creates a Vector2i from integer values without truncation.
     * Used internally in hot paths where values are guaranteed to be integers.
     *
     * @param x - Horizontal component (must be integer).
     * @param y - Vertical component (must be integer).
     * @returns New Vector2i with the specified values.
     */
    public static fromXYUnchecked(x: number, y: number): Vector2i {
        // Construct, then overwrite: same hidden class as `new Vector2i(...)`, raw values kept.
        const v = new Vector2i();

        v.x = x;
        v.y = y;

        return v;
    }

    /**
     * Creates an integer vector from floating-point coordinates.
     * Both values are truncated to integers using |0.
     *
     * Note: |0 truncates toward zero (e.g., -1.7 becomes -1, not -2).
     *
     * @param x - Floating-point x coordinate.
     * @param y - Floating-point y coordinate.
     * @returns New integer vector.
     */
    static fromFloat(x: number, y: number): Vector2i {
        return new Vector2i(x | 0, y | 0);
    }

    /**
     * Calculates distance between two vectors.
     *
     * @param a - First vector.
     * @param b - Second vector.
     * @returns Euclidean distance between a and b.
     */
    static distance(a: Vector2i, b: Vector2i): number {
        const dx = b.x - a.x;
        const dy = b.y - a.y;

        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculates squared distance between two vectors.
     * Avoids the sqrt for performance.
     *
     * @param a - First vector.
     * @param b - Second vector.
     * @returns Squared distance between a and b.
     */
    static sqrDistance(a: Vector2i, b: Vector2i): number {
        const dx = b.x - a.x;
        const dy = b.y - a.y;

        return dx * dx + dy * dy;
    }

    /**
     * Calculates dot product of two vectors.
     * The static version - use instance method a.dot(b) when you have vector instances.
     *
     * @param a - First vector.
     * @param b - Second vector.
     * @returns Scalar dot product.
     */
    static dotProduct(a: Vector2i, b: Vector2i): number {
        return a.x * b.x + a.y * b.y;
    }

    /**
     * Linearly interpolates between two vectors.
     * Result is truncated to integers. t is clamped to [0, 1].
     *
     * @param a - Start vector.
     * @param b - End vector.
     * @param t - Interpolation factor, clamped to [0, 1] (0 = a, 1 = b).
     * @returns New interpolated vector.
     */
    static lerp(a: Vector2i, b: Vector2i, t: number): Vector2i {
        const tc = Math.max(0, Math.min(1, t));

        return new Vector2i(a.x + (b.x - a.x) * tc, a.y + (b.y - a.y) * tc);
    }

    /**
     * Linearly interpolates between two vectors and writes to the existing vector.
     * Zero allocation alternative to lerp(). t is clamped to [0, 1].
     *
     * @param a - Start vector.
     * @param b - End vector.
     * @param t - Interpolation factor, clamped to [0, 1] (0 = a, 1 = b).
     * @param out - Vector to write the result to.
     * @returns The out vector for chaining.
     */
    static lerpTo(a: Vector2i, b: Vector2i, t: number, out: Vector2i): Vector2i {
        const tc = Math.max(0, Math.min(1, t));

        out.x = (a.x + (b.x - a.x) * tc) | 0;
        out.y = (a.y + (b.y - a.y) * tc) | 0;

        return out;
    }

    /**
     * Adds another vector and returns the result as a new vector.
     *
     * @param other - Vector to add.
     * @returns New vector with summed components.
     */
    add(other: Vector2i): Vector2i {
        // Integer + integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x + other.x, this.y + other.y);
    }

    /**
     * Adds raw `x` and `y` offsets and returns the result as a new vector.
     *
     * @param x - X offset to add.
     * @param y - Y offset to add.
     * @returns New vector with summed components.
     */
    addXY(x: number, y: number): Vector2i {
        // Integer + integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x + (x | 0), this.y + (y | 0));
    }

    /**
     * Subtracts another vector and returns the result as a new vector.
     *
     * @param other - Vector to subtract.
     * @returns New vector with difference of components.
     */
    sub(other: Vector2i): Vector2i {
        // Integer - integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x - other.x, this.y - other.y);
    }

    /**
     * Subtracts raw `x` and `y` offsets and returns the result as a new vector.
     *
     * @param x - X offset to subtract.
     * @param y - Y offset to subtract.
     * @returns New vector with difference of components.
     */
    subXY(x: number, y: number): Vector2i {
        // Integer - integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x - (x | 0), this.y - (y | 0));
    }

    /**
     * Multiplies both components by a scalar and returns a new vector.
     *
     * @param scalar - Value to multiply both components by.
     * @returns New vector with scaled components.
     */
    mul(scalar: number): Vector2i {
        return new Vector2i(this.x * scalar, this.y * scalar);
    }

    /**
     * Performs component-wise multiplication with another vector.
     *
     * @param other - Vector to multiply with.
     * @returns New vector with multiplied components.
     */
    mulVec(other: Vector2i): Vector2i {
        // Integer * integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x * other.x, this.y * other.y);
    }

    /**
     * Divides both components by a scalar and truncates toward zero.
     *
     * @param scalar - Value to divide both components by.
     * @returns New vector with divided and truncated components.
     * @throws Error if scalar is zero.
     */
    div(scalar: number): Vector2i {
        if (scalar === 0) {
            throw new Error(vectorDivideByZeroError('div'));
        }

        return new Vector2i((this.x / scalar) | 0, (this.y / scalar) | 0);
    }

    /**
     * Returns a new vector with both components negated.
     * @returns New negated vector.
     */
    negate(): Vector2i {
        // Negating integers stays integer, use unchecked.
        return Vector2i.fromXYUnchecked(-this.x, -this.y);
    }

    /**
     * Returns a new vector with absolute component values.
     * @returns New vector with abs(x), abs(y).
     */
    abs(): Vector2i {
        // Math.abs of integers stays integer, use unchecked.
        return Vector2i.fromXYUnchecked(Math.abs(this.x), Math.abs(this.y));
    }

    /**
     * Returns the component-wise minimum of this vector and another.
     *
     * @param other - Vector to compare with.
     * @returns New vector with minimum components.
     */
    min(other: Vector2i): Vector2i {
        return Vector2i.fromXYUnchecked(Math.min(this.x, other.x), Math.min(this.y, other.y));
    }

    /**
     * Returns the component-wise maximum of this vector and another.
     *
     * @param other - Vector to compare with.
     * @returns New vector with maximum components.
     */
    max(other: Vector2i): Vector2i {
        return Vector2i.fromXYUnchecked(Math.max(this.x, other.x), Math.max(this.y, other.y));
    }

    /**
     * Clamps both components into a numeric range.
     *
     * @param minVal - Minimum value for both components.
     * @param maxVal - Maximum value for both components.
     * @returns New vector with clamped components.
     */
    clamp(minVal: number, maxVal: number): Vector2i {
        const min = minVal | 0;
        const max = maxVal | 0;

        return Vector2i.fromXYUnchecked(Math.max(min, Math.min(max, this.x)), Math.max(min, Math.min(max, this.y)));
    }

    /**
     * Clamps both components into per-axis vector bounds.
     *
     * @param minVec - Vector with minimum values.
     * @param maxVec - Vector with maximum values.
     * @returns New vector with clamped components.
     */
    clampVec(minVec: Vector2i, maxVec: Vector2i): Vector2i {
        return Vector2i.fromXYUnchecked(
            Math.max(minVec.x, Math.min(maxVec.x, this.x)),
            Math.max(minVec.y, Math.min(maxVec.y, this.y)),
        );
    }

    /**
     * Calculates the dot product with another vector.
     *
     * @param other - Vector to dot with.
     * @returns Scalar dot product.
     */
    dot(other: Vector2i): number {
        return this.x * other.x + this.y * other.y;
    }

    /**
     * Calculates the 2D cross-product (perpendicular dot product).
     * Returns the z-component of the 3D cross-product if vectors were in XY plane.
     * Useful for determining which side of a line a point is on.
     *
     * @param other - Vector to cross with.
     * @returns Scalar cross-product (positive = other is counter-clockwise from this).
     */
    cross(other: Vector2i): number {
        return this.x * other.y - this.y * other.x;
    }

    /**
     * Returns a new vector perpendicular to this one (rotated 90 degrees counter-clockwise).
     *
     * @returns New perpendicular vector.
     */
    perpendicular(): Vector2i {
        return Vector2i.fromXYUnchecked(-this.y, this.x);
    }

    /**
     * Returns a new vector perpendicular to this one (rotated 90 degrees clockwise).
     *
     * @returns New perpendicular vector.
     */
    perpendicularCW(): Vector2i {
        return Vector2i.fromXYUnchecked(this.y, -this.x);
    }

    /**
     * Returns a direction vector pointing in the same direction.
     * Components are rounded to the nearest integer, producing one of 8 cardinal/diagonal
     * directions (or zero). Useful for grid-based movement and direction checks.
     *
     * Note: Result is not a true unit vector since integers can't represent
     * fractional components. Diagonal directions have magnitude ~1.41.
     *
     * @returns New direction vector, or a new zero vector if magnitude is 0.
     */
    normalized(): Vector2i {
        const sqrMag = this.x * this.x + this.y * this.y;

        if (sqrMag === 0) {
            return Vector2i.fromXYUnchecked(0, 0);
        }

        const mag = Math.sqrt(sqrMag);

        // Use Math.round to get meaningful 8-direction results.
        // Truncation would collapse most vectors to (0, 0).
        return new Vector2i(Math.round(this.x / mag), Math.round(this.y / mag));
    }

    /**
     * Checks if this vector equals another vector component-wise.
     *
     * @param other - Vector to compare with.
     * @returns True if both x and y components are equal.
     */
    isEqual(other: Vector2i): boolean {
        return this.x === other.x && this.y === other.y;
    }

    /**
     * Backward-compatible alias for {@link isEqual}.
     *
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isEqual} instead.
     * @param other - Vector to compare with.
     * @returns True if both x and y components are equal.
     */
    equals(other: Vector2i): boolean {
        return this.isEqual(other);
    }

    /**
     * Checks if this vector equals raw coordinates.
     * Avoids creating a temporary Vector2i for comparison.
     *
     * @param x - X coordinate to compare.
     * @param y - Y coordinate to compare.
     * @returns True if components match the given coordinates.
     */
    isEqualXY(x: number, y: number): boolean {
        return this.x === (x | 0) && this.y === (y | 0);
    }

    /**
     * Checks if this vector is the zero vector.
     *
     * @returns True if both components are zero.
     */
    isZero(): boolean {
        return this.x === 0 && this.y === 0;
    }

    /**
     * Creates an independent copy of this vector.
     *
     * Note: Creates a new Vector2i. Use cloneTo() in hot paths.
     *
     * @returns New vector with same x and y values.
     */
    clone(): Vector2i {
        // Values are already integers, use unchecked.
        return Vector2i.fromXYUnchecked(this.x, this.y);
    }

    /**
     * Formats the vector as a readable string.
     *
     * @returns String in format (x, y).
     */
    override toString(): string {
        return `(${this.x}, ${this.y})`;
    }
}
