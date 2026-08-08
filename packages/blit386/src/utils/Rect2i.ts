import { Vector2i } from './Vector2i';

/**
 * Integer rectangle for pixel-perfect bounds and regions.
 *
 * Used throughout the engine for sprite regions, display-space bounds, and
 * zero-allocation geometry helpers. Both convenience getters and allocation-free
 * `*To()` helpers are provided so callers can choose between readability and
 * hot-path efficiency.
 *
 * @since 0.1.0
 */
export class Rect2i {
    /** The cached singleton for zero rectangle. */
    private static readonly _zero: Rect2i = Object.freeze(Rect2i.fromValuesUnchecked(0, 0, 0, 0));

    /**
     * Creates an integer rectangle, truncating all inputs toward zero.
     *
     * @param x – Left-edge X coordinate (defaults to 0).
     * @param y – Top-edge Y coordinate (defaults to 0).
     * @param width – Width in pixels (defaults to 0).
     * @param height – Height in pixels (defaults to 0).
     */
    constructor(
        /** Left edge X coordinate (defaults to 0). */
        public x: number = 0,

        /** Top edge Y coordinate (defaults to 0). */
        public y: number = 0,

        /** Width in pixels (defaults to 0). */
        public width: number = 0,

        /** Height in pixels (defaults to 0). */
        public height: number = 0,
    ) {
        // Truncate to integer using bitwise OR (faster than Math.floor).
        this.x = x | 0;
        this.y = y | 0;
        this.width = width | 0;
        this.height = height | 0;
    }

    /**
     * Gets the exclusive right edge (`x + width`).
     * @returns Right edge X coordinate.
     */
    get right(): number {
        return this.x + this.width;
    }

    /**
     * Gets the exclusive bottom edge (`y + height`).
     * @returns Bottom edge Y coordinate.
     */
    get bottom(): number {
        return this.y + this.height;
    }

    /**
     * Gets the truncated horizontal center coordinate.
     * @returns Center X coordinate.
     */
    get centerX(): number {
        return (this.x + this.width / 2) | 0;
    }

    /**
     * Gets the truncated vertical center coordinate.
     * @returns Center Y coordinate.
     */
    get centerY(): number {
        return (this.y + this.height / 2) | 0;
    }

    /**
     * Gets the top-left corner as a new vector.
     * @returns Vector2i at (x, y).
     */
    get min(): Vector2i {
        return Vector2i.fromXYUnchecked(this.x, this.y);
    }

    /**
     * Gets the exclusive bottom-right corner as a new vector.
     * @returns Vector2i at (x + width, y + height).
     */
    get max(): Vector2i {
        return Vector2i.fromXYUnchecked(this.x + this.width, this.y + this.height);
    }

    /**
     * Gets the truncated center point as a new vector.
     * @returns Vector2i at the rectangle center.
     */
    get center(): Vector2i {
        return Vector2i.fromXYUnchecked((this.x + this.width / 2) | 0, (this.y + this.height / 2) | 0);
    }

    /**
     * Gets the top-left position as a new vector.
     * @returns Vector2i at (x, y).
     */
    get position(): Vector2i {
        return Vector2i.fromXYUnchecked(this.x, this.y);
    }

    /**
     * Sets the position (top-left corner) from a vector.
     *
     * @param value – New position vector.
     */
    set position(value: Vector2i) {
        this.x = value.x | 0;
        this.y = value.y | 0;
    }

    /**
     * Gets the size as a new vector.
     * @returns Vector2i at (width, height).
     */
    get size(): Vector2i {
        return Vector2i.fromXYUnchecked(this.width, this.height);
    }

    /**
     * Sets the size from a vector.
     *
     * @param value – New size vector (x=width, y=height).
     */
    set size(value: Vector2i) {
        this.width = value.x | 0;
        this.height = value.y | 0;
    }

    /**
     * Returns a zero-sized rectangle at origin.
     * Returns a cached frozen singleton – do not modify.
     *
     * @returns Rectangle at (0, 0) with size (0, 0) (cached).
     */
    static zero(): Rect2i {
        return Rect2i._zero;
    }

    /**
     * Creates a rectangle from two corner points.
     *
     * Note: min must be less than or equal to max component-wise.
     * If min > max on any axis, the resulting width/height will be negative,
     * which may cause unexpected behavior in intersection/containment tests.
     *
     * @param min – Top-left corner.
     * @param max – Bottom-right corner (exclusive; same half-open interval as {@link isContaining}).
     * @returns New rectangle spanning from min to max.
     */
    static fromMinMax(min: Vector2i, max: Vector2i): Rect2i {
        // Vector2i values are already integers, use unchecked.
        return Rect2i.fromValuesUnchecked(min.x, min.y, max.x - min.x, max.y - min.y);
    }

    /**
     * Creates a rectangle from two corner points specified as raw coordinates.
     * Zero allocation alternative to fromMinMax() when you have raw coordinates.
     *
     * Note: min coordinates must be less than or equal to max coordinates.
     * If min > max on any axis, the resulting width/height will be negative.
     *
     * @param minX – Left-edge X coordinate.
     * @param minY – Top-edge Y coordinate.
     * @param maxX – Right-edge X coordinate.
     * @param maxY – Bottom-edge Y coordinate.
     * @returns New rectangle spanning from (minX, minY) to (maxX, maxY).
     */
    static fromMinMaxXY(minX: number, minY: number, maxX: number, maxY: number): Rect2i {
        const x = minX | 0;
        const y = minY | 0;

        return Rect2i.fromValuesUnchecked(x, y, (maxX | 0) - x, (maxY | 0) - y);
    }

    /**
     * Creates a rectangle centered on a point with a given size.
     *
     * @param center – Center point of the rectangle.
     * @param size – Width and height as a vector.
     * @returns New rectangle centered on the given point.
     */
    static fromCenterSize(center: Vector2i, size: Vector2i): Rect2i {
        // Use |0 to truncate division results.
        const halfWidth = (size.x / 2) | 0;
        const halfHeight = (size.y / 2) | 0;

        // All arithmetic on integers, use unchecked.
        return Rect2i.fromValuesUnchecked(center.x - halfWidth, center.y - halfHeight, size.x, size.y);
    }

    /**
     * Creates a rectangle centered on raw coordinates with a given size.
     * Zero allocation alternative to fromCenterSize() when you have raw coordinates.
     *
     * @param centerX – Center X coordinate.
     * @param centerY – Center Y coordinate.
     * @param width – Width of the rectangle.
     * @param height – Height of the rectangle.
     * @returns New rectangle centered on the given point.
     */
    static fromCenterSizeXY(centerX: number, centerY: number, width: number, height: number): Rect2i {
        const w = width | 0;
        const h = height | 0;
        const halfWidth = (w / 2) | 0;
        const halfHeight = (h / 2) | 0;

        return Rect2i.fromValuesUnchecked((centerX | 0) - halfWidth, (centerY | 0) - halfHeight, w, h);
    }

    /**
     * Creates a Rect2i from integer values without truncation.
     * Use this in hot paths when values are guaranteed to be integers.
     *
     * WARNING: Passing non-integer values will result in non-integer rect components.
     * Only use when you’re certain the values are already integers.
     *
     * @param x – Left-edge X coordinate (must be integer).
     * @param y – Top-edge Y coordinate (must be integer).
     * @param width – Width in pixels (must be integer).
     * @param height – Height in pixels (must be integer).
     * @returns New Rect2i with the specified values.
     */
    static fromValuesUnchecked(x: number, y: number, width: number, height: number): Rect2i {
        const r = Object.create(Rect2i.prototype) as Rect2i;

        r.x = x;
        r.y = y;
        r.width = width;
        r.height = height;

        return r;
    }

    /**
     * Writes the top-left corner (min) to an existing vector.
     * Zero allocation alternative to the min getter.
     *
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    minTo(out: Vector2i): Vector2i {
        out.x = this.x;
        out.y = this.y;

        return out;
    }

    /**
     * Writes the bottom-right corner (exclusive max) to an existing vector.
     * Zero allocation alternative to the max getter.
     *
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    maxTo(out: Vector2i): Vector2i {
        out.x = this.x + this.width;
        out.y = this.y + this.height;

        return out;
    }

    /**
     * Writes the center point to an existing vector.
     * Zero allocation alternative to the center getter.
     *
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    centerTo(out: Vector2i): Vector2i {
        out.x = (this.x + this.width / 2) | 0;
        out.y = (this.y + this.height / 2) | 0;

        return out;
    }

    /**
     * Writes the position (top-left corner) to an existing vector.
     * Zero allocation alternative to the position getter.
     *
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    positionTo(out: Vector2i): Vector2i {
        out.x = this.x;
        out.y = this.y;

        return out;
    }

    /**
     * Writes the size (width, height) to an existing vector.
     * Zero allocation alternative to the size getter.
     *
     * @param out – Vector to write to.
     * @returns The out vector for chaining.
     */
    sizeTo(out: Vector2i): Vector2i {
        out.x = this.width;
        out.y = this.height;

        return out;
    }

    /**
     * Tests if a point lies within this rectangle.
     * Uses half-open interval: includes min, excludes max.
     *
     * @param point – Point to test.
     * @returns True if point is inside the rectangle.
     */
    isContaining(point: Vector2i): boolean {
        return (
            point.x >= this.x && point.x < this.x + this.width && point.y >= this.y && point.y < this.y + this.height
        );
    }

    /**
     * Backward-compatible alias for {@link isContaining}.
     *
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isContaining} instead.
     * @param point – Point to test.
     * @returns True if point is inside the rectangle.
     */
    contains(point: Vector2i): boolean {
        return this.isContaining(point);
    }

    /**
     * Tests raw coordinates against this rectangle without allocating a vector.
     *
     * @param px – X coordinate to test.
     * @param py – Y coordinate to test.
     * @returns True if point is inside the rectangle.
     */
    isContainingXY(px: number, py: number): boolean {
        return px >= this.x && px < this.x + this.width && py >= this.y && py < this.y + this.height;
    }

    /**
     * Backward-compatible alias for {@link isContainingXY}.
     *
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isContainingXY} instead.
     * @param px – X coordinate to test.
     * @param py – Y coordinate to test.
     * @returns True if point is inside the rectangle.
     */
    containsXY(px: number, py: number): boolean {
        return this.isContainingXY(px, py);
    }

    /**
     * Tests if this rectangle overlaps with another.
     *
     * @param other – Rectangle to test against.
     * @returns True if rectangles overlap.
     */
    isIntersecting(other: Rect2i): boolean {
        return !(
            other.x >= this.x + this.width ||
            other.x + other.width <= this.x ||
            other.y >= this.y + this.height ||
            other.y + other.height <= this.y
        );
    }

    /**
     * Backward-compatible alias for {@link isIntersecting}.
     *
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isIntersecting} instead.
     * @param other – Rectangle to test against.
     * @returns True if rectangles overlap.
     */
    intersects(other: Rect2i): boolean {
        return this.isIntersecting(other);
    }

    /**
     * Calculates the overlapping region of two rectangles.
     *
     * @param other – Rectangle to intersect with.
     * @returns New rectangle representing the overlap, or null if no overlap.
     */
    intersection(other: Rect2i): Rect2i | null {
        if (!this.isIntersecting(other)) {
            return null;
        }

        const x1 = Math.max(this.x, other.x);
        const y1 = Math.max(this.y, other.y);
        const x2 = Math.min(this.x + this.width, other.x + other.width);
        const y2 = Math.min(this.y + this.height, other.y + other.height);

        // All values are integers from integer arithmetic, use unchecked.
        return Rect2i.fromValuesUnchecked(x1, y1, x2 - x1, y2 - y1);
    }

    /**
     * Calculates the overlapping region and writes it into an existing rectangle.
     *
     * @param other – Rectangle to intersect with.
     * @param out – Rectangle to write the result to.
     * @returns True if intersection exists (out is valid), false otherwise (out unchanged).
     */
    intersectTo(other: Rect2i, out: Rect2i): boolean {
        if (!this.isIntersecting(other)) {
            return false;
        }

        const x1 = Math.max(this.x, other.x);
        const y1 = Math.max(this.y, other.y);

        out.x = x1;
        out.y = y1;
        out.width = Math.min(this.x + this.width, other.x + other.width) - x1;
        out.height = Math.min(this.y + this.height, other.y + other.height) - y1;

        return true;
    }

    /**
     * Backward-compatible alias for {@link intersectTo}.
     *
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link intersectTo} instead.
     * @param other – Rectangle to intersect with.
     * @param out – Rectangle to write the result to.
     * @returns True if intersection exists (out is valid), false otherwise (out unchanged).
     */
    intersectionTo(other: Rect2i, out: Rect2i): boolean {
        return this.intersectTo(other, out);
    }

    /**
     * Calculates intersection depth for collision resolution.
     * Returns how much the rectangles overlap in each axis.
     * Useful for pushing objects apart after collision detection.
     *
     * Note: Creates a new Vector2i. Use intersectionDepthTo() in hot paths.
     *
     * Assumes this rectangle already isIntersecting {@link other}. Call
     * {@link isIntersecting} first; if they don't overlap, the returned depths
     * may be zero or negative and aren't meaningful for resolution.
     *
     * @param other – Rectangle to measure overlap with.
     * @returns Vector with overlap depth in X and Y axes.
     */
    intersectionDepth(other: Rect2i): Vector2i {
        // Inline center calculation to avoid allocations.
        const centerAX = (this.x + this.width / 2) | 0;
        const centerBX = (other.x + other.width / 2) | 0;
        const centerAY = (this.y + this.height / 2) | 0;
        const centerBY = (other.y + other.height / 2) | 0;

        const xDepth = centerAX < centerBX ? this.x + this.width - other.x : other.x + other.width - this.x;
        const yDepth = centerAY < centerBY ? this.y + this.height - other.y : other.y + other.height - this.y;

        // Integer arithmetic results, use unchecked.
        return Vector2i.fromXYUnchecked(xDepth, yDepth);
    }

    /**
     * Calculates intersection depth and writes to an existing vector.
     * Zero allocation alternative to intersectionDepth().
     *
     * Assumes this rectangle already isIntersecting {@link other}. Call
     * {@link isIntersecting} first; if they don't overlap, the returned depths
     * may be zero or negative and aren't meaningful for resolution.
     *
     * @param other – Rectangle to measure overlap with.
     * @param out – Vector to write the result to.
     * @returns The out vector for chaining.
     */
    intersectionDepthTo(other: Rect2i, out: Vector2i): Vector2i {
        // Inline center calculation to avoid allocations.
        const centerAX = (this.x + this.width / 2) | 0;
        const centerBX = (other.x + other.width / 2) | 0;
        const centerAY = (this.y + this.height / 2) | 0;
        const centerBY = (other.y + other.height / 2) | 0;

        out.x = centerAX < centerBX ? this.x + this.width - other.x : other.x + other.width - this.x;
        out.y = centerAY < centerBY ? this.y + this.height - other.y : other.y + other.height - this.y;

        return out;
    }

    /**
     * Checks if this rectangle equals another (all components match).
     *
     * @param other – Rectangle to compare with.
     * @returns True if position and size are identical.
     */
    isEqual(other: Rect2i): boolean {
        return this.x === other.x && this.y === other.y && this.width === other.width && this.height === other.height;
    }

    /**
     * Backward-compatible alias for {@link isEqual}.
     *
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isEqual} instead.
     * @param other – Rectangle to compare with.
     * @returns True if position and size are identical.
     */
    equals(other: Rect2i): boolean {
        return this.isEqual(other);
    }

    /**
     * Creates an independent copy of this rectangle.
     *
     * @returns New rectangle with same bounds.
     */
    clone(): Rect2i {
        // Values are already integers, use unchecked.
        return Rect2i.fromValuesUnchecked(this.x, this.y, this.width, this.height);
    }

    /**
     * Copies this rectangle's values to an existing rectangle.
     * Zero allocation alternative to clone().
     *
     * @param out – Rectangle to write to.
     * @returns The out rectangle for chaining.
     */
    cloneTo(out: Rect2i): Rect2i {
        out.x = this.x;
        out.y = this.y;
        out.width = this.width;
        out.height = this.height;

        return out;
    }

    /**
     * Formats the rectangle as a readable string.
     *
     * @returns String in format Rect2i(x, y, width, height).
     */
    toString(): string {
        return `Rect2i(${this.x}, ${this.y}, ${this.width}, ${this.height})`;
    }

    /**
     * Sets all components of this rectangle.
     * Modifies this rectangle directly for maximum performance.
     *
     * WARNING: Mutates this rectangle. Don't use on frozen/cached singletons.
     *
     * @param x – New x position.
     * @param y – New y position.
     * @param width – New width.
     * @param height – New height.
     * @returns This rectangle for chaining.
     */
    set(x: number, y: number, width: number, height: number): this {
        this.x = x | 0;
        this.y = y | 0;
        this.width = width | 0;
        this.height = height | 0;

        return this;
    }

    /**
     * Sets only the position of this rectangle, keeping the size unchanged.
     * Modifies this rectangle directly for maximum performance.
     *
     * WARNING: Mutates this rectangle. Don't use on frozen/cached singletons.
     *
     * @param x – New x position.
     * @param y – New y position.
     * @returns This rectangle for chaining.
     */
    setPosition(x: number, y: number): this {
        this.x = x | 0;
        this.y = y | 0;

        return this;
    }

    /**
     * Sets only the size of this rectangle, keeping position unchanged.
     * Modifies this rectangle directly for maximum performance.
     *
     * WARNING: Mutates this rectangle. Don't use on frozen/cached singletons.
     *
     * @param width – New width.
     * @param height – New height.
     * @returns This rectangle for chaining.
     */
    setSize(width: number, height: number): this {
        this.width = width | 0;
        this.height = height | 0;

        return this;
    }

    /**
     * Copies values from another rectangle.
     * Modifies this rectangle directly for maximum performance.
     *
     * WARNING: Mutates this rectangle. Don't use on frozen/cached singletons.
     *
     * @param other – Rectangle to copy from.
     * @returns This rectangle for chaining.
     */
    copyFrom(other: Rect2i): this {
        this.x = other.x;
        this.y = other.y;
        this.width = other.width;
        this.height = other.height;

        return this;
    }

    /**
     * Moves this rectangle by the given offset.
     * Modifies this rectangle directly for maximum performance.
     *
     * WARNING: Mutates this rectangle. Don't use on frozen/cached singletons.
     *
     * @param dx – X offset to add.
     * @param dy – Y offset to add.
     * @returns This rectangle for chaining.
     */
    translate(dx: number, dy: number): this {
        this.x += dx | 0;
        this.y += dy | 0;

        return this;
    }

    /**
     * Expands this rectangle by the given amount on all sides.
     * Modifies this rectangle directly for maximum performance.
     *
     * WARNING: Mutates this rectangle. Don't use on frozen/cached singletons.
     *
     * @param amount – Amount to expand (positive) or shrink (negative).
     * @returns This rectangle for chaining.
     */
    expand(amount: number): this {
        const a = amount | 0;

        this.x -= a;
        this.y -= a;
        this.width += a * 2;
        this.height += a * 2;

        return this;
    }

    /**
     * Expands this rectangle by different amounts horizontally and vertically.
     * Modifies this rectangle directly for maximum performance.
     *
     * WARNING: Mutates this rectangle. Don't use on frozen/cached singletons.
     *
     * @param horizontal – Amount to expand horizontally.
     * @param vertical – Amount to expand vertically.
     * @returns This rectangle for chaining.
     */
    expandXY(horizontal: number, vertical: number): this {
        const h = horizontal | 0;
        const v = vertical | 0;

        this.x -= h;
        this.y -= v;
        this.width += h * 2;
        this.height += v * 2;

        return this;
    }
}
