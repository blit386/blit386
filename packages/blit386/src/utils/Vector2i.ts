/**
 * Integer 2D vector for pixel-perfect positioning.
 *
 * Used for points, sizes, directions, and camera offsets throughout the engine.
 * The API includes both allocation-free `*To()` / `*InPlace()` variants and
 * convenience methods that return new vectors.
 *
 * @since 0.1.0
 */
export class Vector2i {
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
     * @param x – Horizontal component (defaults to 0).
     * @param y – Vertical component (defaults to 0).
     */
    constructor(
        /** Horizontal component (defaults to 0). */
        public x: number = 0,

        /** Vertical component (defaults to 0). */
        public y: number = 0,
    ) {
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
     * @param value – The new width value.
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
     * @param value – The new height value.
     */
    set height(value: number) {
        this.y = value | 0;
    }

    /**
     * Returns a zero vector (0, 0).
     * Returns a cached frozen singleton – do not modify.
     *
     * @returns Vector at origin (cached).
     */
    static zero(): Vector2i {
        return Vector2i._zero;
    }

    /**
     * Returns a unit vector (1, 1).
     * Returns a cached frozen singleton – do not modify.
     *
     * @returns Vector with both components set to 1 (cached).
     */
    static one(): Vector2i {
        return Vector2i._one;
    }

    /**
     * Returns an up direction vector (0, -1).
     * In screen coordinates, Y increases downward, so up is negative.
     * Returns a cached frozen singleton – do not modify.
     *
     * @returns Vector pointing up (cached).
     */
    static up(): Vector2i {
        return Vector2i._up;
    }

    /**
     * Returns a down direction vector (0, 1).
     * Returns a cached frozen singleton – do not modify.
     *
     * @returns Vector pointing down (cached).
     */
    static down(): Vector2i {
        return Vector2i._down;
    }

    /**
     * Returns a left-direction vector (-1, 0).
     * Returns a cached frozen singleton – do not modify.
     *
     * @returns Vector pointing left (cached).
     */
    static left(): Vector2i {
        return Vector2i._left;
    }

    /**
     * Returns a right-direction vector (1, 0).
     * Returns a cached frozen singleton – do not modify.
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
     * @param x – Horizontal component (must be integer).
     * @param y – Vertical component (must be integer).
     * @returns New Vector2i with the specified values.
     */
    public static fromXYUnchecked(x: number, y: number): Vector2i {
        const v = Object.create(Vector2i.prototype) as Vector2i;

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
     * @param x – Floating-point x coordinate.
     * @param y – Floating-point y coordinate.
     * @returns New integer vector.
     */
    static fromFloat(x: number, y: number): Vector2i {
        return new Vector2i(x | 0, y | 0);
    }

    /**
     * Calculates distance between two vectors.
     *
     * @param a – First vector.
     * @param b – Second vector.
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
     * @param a – First vector.
     * @param b – Second vector.
     * @returns Squared distance between a and b.
     */
    static sqrDistance(a: Vector2i, b: Vector2i): number {
        const dx = b.x - a.x;
        const dy = b.y - a.y;

        return dx * dx + dy * dy;
    }

    /**
     * Calculates dot product of two vectors.
     * The static version – use instance method a.dot(b) when you have vector instances.
     *
     * @param a – First vector.
     * @param b – Second vector.
     * @returns Scalar dot product.
     */
    static dotProduct(a: Vector2i, b: Vector2i): number {
        return a.x * b.x + a.y * b.y;
    }

    /**
     * Linearly interpolates between two vectors.
     * Result is truncated to integers. t is clamped to [0, 1].
     *
     * @param a – Start vector.
     * @param b – End vector.
     * @param t – Interpolation factor, clamped to [0, 1] (0 = a, 1 = b).
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
     * @param a – Start vector.
     * @param b – End vector.
     * @param t – Interpolation factor, clamped to [0, 1] (0 = a, 1 = b).
     * @param out – Vector to write the result to.
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
     * @param other – Vector to add.
     * @returns New vector with summed components.
     */
    add(other: Vector2i): Vector2i {
        // Integer + integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x + other.x, this.y + other.y);
    }

    /**
     * Adds raw `x` and `y` offsets and returns the result as a new vector.
     *
     * @param x – X offset to add.
     * @param y – Y offset to add.
     * @returns New vector with summed components.
     */
    addXY(x: number, y: number): Vector2i {
        // Integer + integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x + (x | 0), this.y + (y | 0));
    }

    /**
     * Subtracts another vector and returns the result as a new vector.
     *
     * @param other – Vector to subtract.
     * @returns New vector with difference of components.
     */
    sub(other: Vector2i): Vector2i {
        // Integer – integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x - other.x, this.y - other.y);
    }

    /**
     * Subtracts raw `x` and `y` offsets and returns the result as a new vector.
     *
     * @param x – X offset to subtract.
     * @param y – Y offset to subtract.
     * @returns New vector with difference of components.
     */
    subXY(x: number, y: number): Vector2i {
        // Integer – integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x - (x | 0), this.y - (y | 0));
    }

    /**
     * Multiplies both components by a scalar and returns a new vector.
     *
     * @param scalar – Value to multiply both components by.
     * @returns New vector with scaled components.
     */
    mul(scalar: number): Vector2i {
        return new Vector2i(this.x * scalar, this.y * scalar);
    }

    /**
     * Performs component-wise multiplication with another vector.
     *
     * @param other – Vector to multiply with.
     * @returns New vector with multiplied components.
     */
    mulVec(other: Vector2i): Vector2i {
        // Integer * integer = integer, use unchecked.
        return Vector2i.fromXYUnchecked(this.x * other.x, this.y * other.y);
    }

    /**
     * Divides both components by a scalar and truncates toward zero.
     *
     * @param scalar – Value to divide both components by.
     * @returns New vector with divided and truncated components.
     * @throws Error if scalar is zero.
     */
    div(scalar: number): Vector2i {
        if (scalar === 0) {
            throw new Error("Can't divide by zero. Use a non-zero number for Vector2i.div.");
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
     * @param other – Vector to compare with.
     * @returns New vector with minimum components.
     */
    min(other: Vector2i): Vector2i {
        return Vector2i.fromXYUnchecked(Math.min(this.x, other.x), Math.min(this.y, other.y));
    }

    /**
     * Returns the component-wise maximum of this vector and another.
     *
     * @param other – Vector to compare with.
     * @returns New vector with maximum components.
     */
    max(other: Vector2i): Vector2i {
        return Vector2i.fromXYUnchecked(Math.max(this.x, other.x), Math.max(this.y, other.y));
    }

    /**
     * Clamps both components into a numeric range.
     *
     * @param minVal – Minimum value for both components.
     * @param maxVal – Maximum value for both components.
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
     * @param minVec – Vector with minimum values.
     * @param maxVec – Vector with maximum values.
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
     * @param other – Vector to dot with.
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
     * @param other – Vector to cross with.
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
     * Adds another vector and writes the result to an existing vector.
     * Zero allocation alternative to add().
     *
     * @param other – Vector to add.
     * @param out – Vector to write the result to.
     * @returns The out vector for chaining.
     */
    addTo(other: Vector2i, out: Vector2i): Vector2i {
        out.x = this.x + other.x;
        out.y = this.y + other.y;

        return out;
    }

    /**
     * Subtracts another vector and writes the result to an existing vector.
     * Zero allocation alternative to sub().
     *
     * @param other – Vector to subtract.
     * @param out – Vector to write the result to.
     * @returns The out vector for chaining.
     */
    subTo(other: Vector2i, out: Vector2i): Vector2i {
        out.x = this.x - other.x;
        out.y = this.y - other.y;

        return out;
    }

    /**
     * Multiplies by scalar and writes the result to an existing vector.
     * Zero allocation alternative to mul().
     *
     * @param scalar – Value to multiply by.
     * @param out – Vector to write the result to.
     * @returns The out vector for chaining.
     */
    mulTo(scalar: number, out: Vector2i): Vector2i {
        out.x = (this.x * scalar) | 0;
        out.y = (this.y * scalar) | 0;

        return out;
    }

    /**
     * Divides by scalar and writes the result to an existing vector.
     * Zero allocation alternative to div().
     *
     * @param scalar – Value to divide by.
     * @param out – Vector to write the result to.
     * @returns The out vector for chaining.
     * @throws Error if scalar is zero.
     */
    divTo(scalar: number, out: Vector2i): Vector2i {
        if (scalar === 0) {
            throw new Error("Can't divide by zero. Use a non-zero number for Vector2i.divTo.");
        }

        out.x = (this.x / scalar) | 0;
        out.y = (this.y / scalar) | 0;

        return out;
    }

    /**
     * Copies this vector's values to an existing vector.
     * Zero allocation alternative to clone().
     *
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    cloneTo(out: Vector2i): Vector2i {
        out.x = this.x;
        out.y = this.y;

        return out;
    }

    /**
     * Writes negated values to an existing vector.
     * Zero allocation alternative to negate().
     *
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    negateTo(out: Vector2i): Vector2i {
        out.x = -this.x;
        out.y = -this.y;

        return out;
    }

    /**
     * Writes absolute values to an existing vector.
     * Zero allocation alternative to abs().
     *
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    absTo(out: Vector2i): Vector2i {
        out.x = Math.abs(this.x);
        out.y = Math.abs(this.y);

        return out;
    }

    /**
     * Writes component-wise minimum to an existing vector.
     * Zero allocation alternative to min().
     *
     * @param other – Vector to compare with.
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    minTo(other: Vector2i, out: Vector2i): Vector2i {
        out.x = Math.min(this.x, other.x);
        out.y = Math.min(this.y, other.y);

        return out;
    }

    /**
     * Writes component-wise maximum to an existing vector.
     * Zero allocation alternative to max().
     *
     * @param other – Vector to compare with.
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    maxTo(other: Vector2i, out: Vector2i): Vector2i {
        out.x = Math.max(this.x, other.x);
        out.y = Math.max(this.y, other.y);

        return out;
    }

    /**
     * Writes clamped values to an existing vector.
     * Zero allocation alternative to clamp().
     *
     * @param minVal – Minimum value for both components.
     * @param maxVal – Maximum value for both components.
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    clampTo(minVal: number, maxVal: number, out: Vector2i): Vector2i {
        const min = minVal | 0;
        const max = maxVal | 0;

        out.x = Math.max(min, Math.min(max, this.x));
        out.y = Math.max(min, Math.min(max, this.y));

        return out;
    }

    /**
     * Adds another vector to this one in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param other – Vector to add.
     * @returns This vector for chaining.
     */
    addInPlace(other: Vector2i): this {
        this.x += other.x;
        this.y += other.y;

        return this;
    }

    /**
     * Adds x and y values to this vector in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param x – X offset to add.
     * @param y – Y offset to add.
     * @returns This vector for chaining.
     */
    addXYInPlace(x: number, y: number): this {
        this.x += x | 0;
        this.y += y | 0;

        return this;
    }

    /**
     * Subtracts another vector from this one in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param other – Vector to subtract.
     * @returns This vector for chaining.
     */
    subInPlace(other: Vector2i): this {
        this.x -= other.x;
        this.y -= other.y;

        return this;
    }

    /**
     * Subtracts x and y values from this vector in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param x – X offset to subtract.
     * @param y – Y offset to subtract.
     * @returns This vector for chaining.
     */
    subXYInPlace(x: number, y: number): this {
        this.x -= x | 0;
        this.y -= y | 0;

        return this;
    }

    /**
     * Multiplies this vector by a scalar in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param scalar – Value to multiply both components by.
     * @returns This vector for chaining.
     */
    mulInPlace(scalar: number): this {
        this.x = (this.x * scalar) | 0;
        this.y = (this.y * scalar) | 0;

        return this;
    }

    /**
     * Component-wise multiplication with another vector in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param other – Vector to multiply with.
     * @returns This vector for chaining.
     */
    mulVecInPlace(other: Vector2i): this {
        this.x *= other.x;
        this.y *= other.y;

        return this;
    }

    /**
     * Divides this vector by a scalar in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param scalar – Value to divide both components by.
     * @returns This vector for chaining.
     * @throws Error if scalar is zero.
     */
    divInPlace(scalar: number): this {
        if (scalar === 0) {
            throw new Error("Can't divide by zero. Use a non-zero number for Vector2i.divInPlace.");
        }

        this.x = (this.x / scalar) | 0;
        this.y = (this.y / scalar) | 0;

        return this;
    }

    /**
     * Negates this vector in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @returns This vector for chaining.
     */
    negateInPlace(): this {
        this.x = -this.x;
        this.y = -this.y;

        return this;
    }

    /**
     * Applies absolute value to components in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @returns This vector for chaining.
     */
    absInPlace(): this {
        this.x = Math.abs(this.x);
        this.y = Math.abs(this.y);

        return this;
    }

    /**
     * Sets components to the minimum of this and other in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param other – Vector to compare with.
     * @returns This vector for chaining.
     */
    minInPlace(other: Vector2i): this {
        this.x = Math.min(this.x, other.x);
        this.y = Math.min(this.y, other.y);

        return this;
    }

    /**
     * Sets components to the maximum of this and other in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param other – Vector to compare with.
     * @returns This vector for chaining.
     */
    maxInPlace(other: Vector2i): this {
        this.x = Math.max(this.x, other.x);
        this.y = Math.max(this.y, other.y);

        return this;
    }

    /**
     * Clamps components to the given range in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param minVal – Minimum value for both components.
     * @param maxVal – Maximum value for both components.
     * @returns This vector for chaining.
     */
    clampInPlace(minVal: number, maxVal: number): this {
        const min = minVal | 0;
        const max = maxVal | 0;

        this.x = Math.max(min, Math.min(max, this.x));
        this.y = Math.max(min, Math.min(max, this.y));

        return this;
    }

    /**
     * Clamps components to vector bounds in place.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param minVec – Vector with minimum values.
     * @param maxVec – Vector with maximum values.
     * @returns This vector for chaining.
     */
    clampVecInPlace(minVec: Vector2i, maxVec: Vector2i): this {
        this.x = Math.max(minVec.x, Math.min(maxVec.x, this.x));
        this.y = Math.max(minVec.y, Math.min(maxVec.y, this.y));

        return this;
    }

    /**
     * Sets both components of this vector.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param x – New x component.
     * @param y – New y component.
     * @returns This vector for chaining.
     */
    set(x: number, y: number): this {
        this.x = x | 0;
        this.y = y | 0;

        return this;
    }

    /**
     * Copies values from another vector.
     * Modifies this vector directly for maximum performance.
     *
     * WARNING: Mutates this vector. Don't use on frozen/cached singletons.
     *
     * @param other – Vector to copy from.
     * @returns This vector for chaining.
     */
    copyFrom(other: Vector2i): this {
        this.x = other.x;
        this.y = other.y;

        return this;
    }

    /**
     * Calculates the Euclidean length of this vector.
     *
     * @returns Distance from origin (0,0) to this point.
     */
    magnitude(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    /**
     * Calculates the squared magnitude (avoids the sqrt for performance).
     * Useful for distance comparisons without the sqrt overhead.
     *
     * @returns Squared distance from origin.
     */
    sqrMagnitude(): number {
        return this.x * this.x + this.y * this.y;
    }

    /**
     * Calculates the Euclidean distance to another vector.
     *
     * @param other – Target vector.
     * @returns Distance between this and other.
     */
    distanceTo(other: Vector2i): number {
        const dx = other.x - this.x;
        const dy = other.y - this.y;

        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculates the Euclidean distance to raw coordinates.
     * Avoids creating a temporary Vector2i.
     *
     * @param x – Target X coordinate.
     * @param y – Target Y coordinate.
     * @returns Distance between this and the point.
     */
    distanceToXY(x: number, y: number): number {
        const dx = (x | 0) - this.x;
        const dy = (y | 0) - this.y;

        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculates the squared distance to another vector.
     * Avoids the sqrt for performance. Useful for distance comparisons.
     *
     * @param other – Target vector.
     * @returns Squared distance between this and other.
     */
    sqrDistanceTo(other: Vector2i): number {
        const dx = other.x - this.x;
        const dy = other.y - this.y;

        return dx * dx + dy * dy;
    }

    /**
     * Calculates the squared distance to raw coordinates.
     * Avoids the sqrt and temporary Vector2i allocation.
     *
     * @param x – Target X coordinate.
     * @param y – Target Y coordinate.
     * @returns Squared distance between this and the point.
     */
    sqrDistanceToXY(x: number, y: number): number {
        const dx = (x | 0) - this.x;
        const dy = (y | 0) - this.y;

        return dx * dx + dy * dy;
    }

    /**
     * Calculates the Manhattan (taxicab) distance to another vector.
     * Useful for tile-based movement costs.
     *
     * @param other – Target vector.
     * @returns Manhattan distance (|dx| + |dy|).
     */
    manhattanDistanceTo(other: Vector2i): number {
        return Math.abs(other.x - this.x) + Math.abs(other.y - this.y);
    }

    /**
     * Calculates the Manhattan distance to raw coordinates.
     * Avoids creating a temporary Vector2i.
     *
     * @param x – Target X coordinate.
     * @param y – Target Y coordinate.
     * @returns Manhattan distance (|dx| + |dy|).
     */
    manhattanDistanceToXY(x: number, y: number): number {
        return Math.abs((x | 0) - this.x) + Math.abs((y | 0) - this.y);
    }

    /**
     * Calculates the Chebyshev distance to another vector.
     * Useful for 8-directional movement (king's move in chess).
     *
     * @param other – Target vector.
     * @returns Chebyshev distance max(|dx|, |dy|).
     */
    chebyshevDistanceTo(other: Vector2i): number {
        return Math.max(Math.abs(other.x - this.x), Math.abs(other.y - this.y));
    }

    /**
     * Calculates the Chebyshev distance to raw coordinates.
     * Avoids creating a temporary Vector2i.
     *
     * @param x – Target X coordinate.
     * @param y – Target Y coordinate.
     * @returns Chebyshev distance max(|dx|, |dy|).
     */
    chebyshevDistanceToXY(x: number, y: number): number {
        return Math.max(Math.abs((x | 0) - this.x), Math.abs((y | 0) - this.y));
    }

    /**
     * Returns a direction vector pointing in the same direction.
     * Components are rounded to the nearest integer, producing one of 8 cardinal/diagonal
     * directions (or zero). Useful for grid-based movement and direction checks.
     *
     * Note: Result is not a true unit vector since integers can't represent
     * fractional components. Diagonal directions have magnitude ~1.41.
     *
     * @returns New direction vector, or zero vector if magnitude is 0.
     */
    normalized(): Vector2i {
        const sqrMag = this.x * this.x + this.y * this.y;

        if (sqrMag === 0) {
            return Vector2i.zero();
        }

        const mag = Math.sqrt(sqrMag);

        // Use Math.round to get meaningful 8-direction results.
        // Truncation would collapse most vectors to (0, 0).
        return new Vector2i(Math.round(this.x / mag), Math.round(this.y / mag));
    }

    /**
     * Checks if this vector equals another vector component-wise.
     *
     * @param other – Vector to compare with.
     * @returns True if both x and y components are equal.
     */
    isEqual(other: Vector2i): boolean {
        return this.x === other.x && this.y === other.y;
    }

    /**
     * Backward-compatible alias for {@link isEqual}.
     *
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isEqual} instead.
     * @param other – Vector to compare with.
     * @returns True if both x and y components are equal.
     */
    equals(other: Vector2i): boolean {
        return this.isEqual(other);
    }

    /**
     * Checks if this vector equals raw coordinates.
     * Avoids creating a temporary Vector2i for comparison.
     *
     * @param x – X coordinate to compare.
     * @param y – Y coordinate to compare.
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
    toString(): string {
        return `(${this.x}, ${this.y})`;
    }
}
