/**
 * The allocation-free half of {@link Vector2i}: the `*To` and `*InPlace` families, `set` / `copyFrom`, and the
 * magnitude and distance queries.
 *
 * Not exported from the package. `Vector2i` extends it, so every method here is a normal `Vector2i` method to callers.
 * `x` and `y` are declared, not defined, so the subclass constructor still creates them first and in the same order.
 */

import { vectorDivideByZeroError } from './errorMessages/math';
import type { Vector2i } from './Vector2i';

/**
 * Base class holding the zero-allocation operations of {@link Vector2i}.
 */
export abstract class Vector2iOps {
    /** X component (integer). Defined by the `Vector2i` constructor. */
    declare public x: number;

    /** Y component (integer). Defined by the `Vector2i` constructor. */
    declare public y: number;

    /**
     * Adds another vector and writes the result to an existing vector.
     * Zero allocation alternative to add().
     *
     * @param other - Vector to add.
     * @param out - Vector to write the result to.
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
     * @param other - Vector to subtract.
     * @param out - Vector to write the result to.
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
     * @param scalar - Value to multiply by.
     * @param out - Vector to write the result to.
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
     * @param scalar - Value to divide by.
     * @param out - Vector to write the result to.
     * @returns The out vector for chaining.
     * @throws Error if scalar is zero.
     */
    divTo(scalar: number, out: Vector2i): Vector2i {
        if (scalar === 0) {
            throw new Error(vectorDivideByZeroError('divTo'));
        }

        out.x = (this.x / scalar) | 0;
        out.y = (this.y / scalar) | 0;

        return out;
    }

    /**
     * Copies this vector's values to an existing vector.
     * Zero allocation alternative to clone().
     *
     * @param out - Vector to write to.
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
     * @param out - Vector to write to.
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
     * @param out - Vector to write to.
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
     * @param other - Vector to compare with.
     * @param out - Vector to write to.
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
     * @param other - Vector to compare with.
     * @param out - Vector to write to.
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
     * @param minVal - Minimum value for both components.
     * @param maxVal - Maximum value for both components.
     * @param out - Vector to write to.
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
     * @param other - Vector to add.
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
     * @param x - X offset to add.
     * @param y - Y offset to add.
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
     * @param other - Vector to subtract.
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
     * @param x - X offset to subtract.
     * @param y - Y offset to subtract.
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
     * @param scalar - Value to multiply both components by.
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
     * @param other - Vector to multiply with.
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
     * @param scalar - Value to divide both components by.
     * @returns This vector for chaining.
     * @throws Error if scalar is zero.
     */
    divInPlace(scalar: number): this {
        if (scalar === 0) {
            throw new Error(vectorDivideByZeroError('divInPlace'));
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
     * @param other - Vector to compare with.
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
     * @param other - Vector to compare with.
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
     * @param minVal - Minimum value for both components.
     * @param maxVal - Maximum value for both components.
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
     * @param minVec - Vector with minimum values.
     * @param maxVec - Vector with maximum values.
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
     * @param x - New x component.
     * @param y - New y component.
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
     * @param other - Vector to copy from.
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
     * @param other - Target vector.
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
     * @param x - Target X coordinate.
     * @param y - Target Y coordinate.
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
     * @param other - Target vector.
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
     * @param x - Target X coordinate.
     * @param y - Target Y coordinate.
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
     * @param other - Target vector.
     * @returns Manhattan distance (|dx| + |dy|).
     */
    manhattanDistanceTo(other: Vector2i): number {
        return Math.abs(other.x - this.x) + Math.abs(other.y - this.y);
    }

    /**
     * Calculates the Manhattan distance to raw coordinates.
     * Avoids creating a temporary Vector2i.
     *
     * @param x - Target X coordinate.
     * @param y - Target Y coordinate.
     * @returns Manhattan distance (|dx| + |dy|).
     */
    manhattanDistanceToXY(x: number, y: number): number {
        return Math.abs((x | 0) - this.x) + Math.abs((y | 0) - this.y);
    }

    /**
     * Calculates the Chebyshev distance to another vector.
     * Useful for 8-directional movement (king's move in chess).
     *
     * @param other - Target vector.
     * @returns Chebyshev distance max(|dx|, |dy|).
     */
    chebyshevDistanceTo(other: Vector2i): number {
        return Math.max(Math.abs(other.x - this.x), Math.abs(other.y - this.y));
    }

    /**
     * Calculates the Chebyshev distance to raw coordinates.
     * Avoids creating a temporary Vector2i.
     *
     * @param x - Target X coordinate.
     * @param y - Target Y coordinate.
     * @returns Chebyshev distance max(|dx|, |dy|).
     */
    chebyshevDistanceToXY(x: number, y: number): number {
        return Math.max(Math.abs((x | 0) - this.x), Math.abs((y | 0) - this.y));
    }
}
