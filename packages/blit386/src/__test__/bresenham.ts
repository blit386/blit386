/**
 * Reference Bresenham walk shared by the line-clipping tests.
 *
 * It is the full-length kernel both backends use, so a clipped line can be compared against it pixel for pixel.
 */

/** Inclusive pixel rectangle a walk is filtered to. */
export interface WalkBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/**
 * Walks a whole Bresenham line and returns the visited pixels, optionally only those inside `bounds`.
 * Filtering while walking keeps very long lines from allocating one entry per pixel.
 *
 * @param x0 - Start X.
 * @param y0 - Start Y.
 * @param x1 - End X.
 * @param y1 - End Y.
 * @param bounds - Keeps only pixels inside this inclusive rectangle when given.
 * @returns Flat `[x, y, x, y, ...]` pairs in walk order.
 */
export function walkBresenham(x0: number, y0: number, x1: number, y1: number, bounds?: WalkBounds): number[] {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    const out: number[] = [];

    while (true) {
        if (!bounds || (cx >= bounds.minX && cx <= bounds.maxX && cy >= bounds.minY && cy <= bounds.maxY)) {
            out.push(cx, cy);
        }

        if (cx === x1 && cy === y1) {
            return out;
        }

        const e2 = err * 2;

        if (e2 > -dy) {
            err -= dy;
            cx += sx;
        }

        if (e2 < dx) {
            err += dx;
            cy += sy;
        }
    }
}
