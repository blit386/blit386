// Keeps asking for a random point until one lands inside a rectangle.
//
// draw() is any function that returns a point like { x, y }. The rectangle is given as
// its smallest and largest x and y, and both ends count as inside. Points that land
// outside are thrown away and drawn again, so the points you keep still follow the
// shape of the original randomness - nothing gets squashed onto the edge.
//
// This only ends if draw() can land inside the rectangle, so aim it at a spot that is
// already inside.
export function sampleInside(draw, minX, maxX, minY, maxY) {
    for (;;) {
        const point = draw();

        if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
            return point;
        }
    }
}
