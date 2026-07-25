/**
 * Hypercube – Fez-style rotating tesseract wireframe.
 *
 * A tesseract is a 4D cube: two 3D cubes linked along a fourth axis (W).
 * We rotate in 4D, then project down to 2D so you can see the links stretch
 * and the "inner" cube pass through the "outer" one – like the Fez logo.
 */

import { bootstrap, BT, Color32, Palette, Vector2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} PaletteType */
/** @typedef {import('blit386').Vector2i} Vector2iType */

/**
 * One wire of the tesseract. `color` is a fixed palette slot so painter's-order
 * sorting never swaps which cube an edge belongs to.
 *
 * @typedef {object} Edge
 * @property {number} i
 * @property {number} j
 * @property {number} depth
 * @property {number} color
 */

const SIZE = 400;
const SCALE = 36;

/** Perspective distance for the 4D → 3D step (larger = flatter). */
const DIST_4 = 2.6;

/** Perspective distance for the 3D → 2D step. */
const DIST_3 = 3.2;

const C_BG = 1;
const C_NEAR = 7;

/** Fixed slots – stable colors that do not swap when edges are depth-sorted. */
const C_CUBE_A = 8;
const C_CUBE_B = 9;
const C_LINK = 10;
const C_DOT = 11;

const LINE_SLOTS = [C_CUBE_A, C_CUBE_B, C_LINK, C_DOT];

/** Hue drift in degrees per second. */
const HUE_SPEED = 28;
const LINE_SAT = 88;
const LINE_LIGHT = 58;
const LIGHT_PULSE = 10;
const LIGHT_PULSE_RATE = 1.1;

/**
 * The 16 corners of a unit tesseract (±1 on x, y, z, w).
 * Built once at load; never mutated – each frame copies into a scratch vector.
 *
 * @type {number[][]}
 */
const VERTICES = [];

for (let i = 0; i < 16; i++) {
    // Each bit of i picks +1 or -1 on one axis (bit 0 = X, 1 = Y, 2 = Z, 3 = W).
    VERTICES.push([(i & 1) !== 0 ? 1 : -1, (i & 2) !== 0 ? 1 : -1, (i & 4) !== 0 ? 1 : -1, (i & 8) !== 0 ? 1 : -1]);
}

/**
 * Farther edges first. Tie-break on endpoints so equal depths stay stable
 * (avoids color flicker when two edges share a depth).
 *
 * @param {Edge} a
 * @param {Edge} b
 * @returns {number}
 */
function compareEdgeDepth(a, b) {
    return a.depth - b.depth || a.i - b.i || a.j - b.j;
}

/** @implements {IBTDemo} */
class Demo {
    /** @type {PaletteType | null} */
    palette = null;

    /** Screen positions after 4D → 2D projection (reused every frame). */
    /** @type {Vector2iType[]} */
    projected = [];

    /** Per-vertex depth for painter's algorithm. */
    /** @type {number[]} */
    depths = [];

    /** @type {Edge[]} */
    edgeOrder = [];

    /** Starting hues for cube A / cube B / link / dot (degrees). */
    /** @type {number[]} */
    baseHues = [];

    /** Scratch 4D point reused while rotating each corner (avoids per-frame arrays). */
    /** @type {number[]} */
    scratch = [0, 0, 0, 0];

    /** @type {number} */
    angleXW = 0.35;

    /** @type {number} */
    angleYZ = 0.9;

    /** @type {number} */
    angleXY = 0.1;

    /** @type {number} */
    angleZW = 0.2;

    /**
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(SIZE, SIZE),
            maxCanvasSize: new Vector2i(SIZE * 2, SIZE * 2),
            targetFPS: 60,
            isOverlayEnabled: true,
            isOverlayVisibleAtStart: true,
            isOverlayPaletteEnabled: true,
            overlayStyle: {
                barPaletteIndex: C_NEAR,
                textPaletteIndex: C_BG,
                gapPaletteIndex: C_BG,
            },
        };
    }

    /**
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = Palette.pico8();

        // Spread the four line colors around the wheel; randomize the starting angle.
        const start = Math.random() * 360;

        this.baseHues = [start, start + 90, start + 180, start + 270];
        this.applyLineColors(0);

        BT.paletteSet(this.palette);

        for (let i = 0; i < 16; i++) {
            this.projected.push(new Vector2i(0, 0));
            this.depths.push(0);
        }

        // Two corners form an edge when their indices differ in exactly one bit
        // (they are neighbors on the 4D hypercube).
        for (let i = 0; i < 16; i++) {
            for (let j = i + 1; j < 16; j++) {
                const axis = i ^ j;

                // Exactly one bit set: axis is a power of two.
                if (axis !== 0 && (axis & (axis - 1)) === 0) {
                    // Bit 3 (value 8) means the edge spans W – a strut between the two cubes.
                    // Otherwise the edge lives on the cube whose W sign matches endpoint i.
                    const color = axis === 8 ? C_LINK : (i & 8) !== 0 ? C_CUBE_B : C_CUBE_A;

                    this.edgeOrder.push({ i, j, depth: 0, color });
                }
            }
        }

        return true;
    }

    /**
     * @param {number} timeSeconds
     * @returns {void}
     */
    applyLineColors(timeSeconds) {
        for (let i = 0; i < LINE_SLOTS.length; i++) {
            const hue = (this.baseHues[i] + timeSeconds * HUE_SPEED) % 360;
            const light = LINE_LIGHT + Math.sin(timeSeconds * LIGHT_PULSE_RATE + i) * LIGHT_PULSE;

            // init() always sets this.palette before update() runs.
            this.palette.set(LINE_SLOTS[i], Color32.fromHSL(hue, LINE_SAT, light));
        }
    }

    /**
     * Rotate a 4D point in the plane of axes `a` and `b` (0=X, 1=Y, 2=Z, 3=W).
     * `c` / `s` are cos/sin of the angle – precomputed once per frame.
     *
     * @param {number[]} v
     * @param {number} c
     * @param {number} s
     * @param {number} a
     * @param {number} b
     * @returns {void}
     */
    rotatePlane(v, c, s, a, b) {
        const x = v[a];
        const y = v[b];

        v[a] = x * c - y * s;
        v[b] = x * s + y * c;
    }

    /**
     * @returns {void}
     */
    update() {
        const dt = BT.deltaSeconds;

        this.angleXW += 0.55 * dt;
        this.angleYZ += 0.38 * dt;
        this.angleXY += 0.12 * dt;
        this.angleZW += 0.22 * dt;

        this.applyLineColors(BT.timeSeconds);

        const cx = SIZE / 2;
        const cy = SIZE / 2;

        const cXW = Math.cos(this.angleXW);
        const sXW = Math.sin(this.angleXW);
        const cYZ = Math.cos(this.angleYZ);
        const sYZ = Math.sin(this.angleYZ);
        const cXY = Math.cos(this.angleXY);
        const sXY = Math.sin(this.angleXY);
        const cZW = Math.cos(this.angleZW);
        const sZW = Math.sin(this.angleZW);

        const v = this.scratch;

        for (let i = 0; i < 16; i++) {
            const src = VERTICES[i];

            v[0] = src[0];
            v[1] = src[1];
            v[2] = src[2];
            v[3] = src[3];

            // Spin in four planes so the two cubes tumble and the W-links twist.
            this.rotatePlane(v, cXW, sXW, 0, 3);
            this.rotatePlane(v, cYZ, sYZ, 1, 2);
            this.rotatePlane(v, cXY, sXY, 0, 1);
            this.rotatePlane(v, cZW, sZW, 2, 3);

            // 4D → 3D perspective: points farther in W shrink toward the origin.
            const w = DIST_4 / (DIST_4 - v[3]);
            const x3 = v[0] * w;
            const y3 = v[1] * w;
            const z3 = v[2] * w;

            // 3D → 2D perspective, then center on the canvas.
            const p = DIST_3 / (DIST_3 - z3);
            const x2 = x3 * p * SCALE + cx;
            const y2 = y3 * p * SCALE + cy;

            this.projected[i].set(x2, y2);

            // Blend Z and W so links that dive "into" W sort behind nearer faces.
            this.depths[i] = z3 + v[3] * 0.35;
        }

        // Update depth on each edge in place. Do NOT rebuild edges from a sorted
        // index list – that pairs the wrong color with the wrong endpoints and flashes.
        for (let e = 0; e < this.edgeOrder.length; e++) {
            const edge = this.edgeOrder[e];

            edge.depth = (this.depths[edge.i] + this.depths[edge.j]) * 0.5;
        }

        this.edgeOrder.sort(compareEdgeDepth);
    }

    /**
     * @returns {void}
     */
    render() {
        BT.clear(C_BG);

        for (let e = 0; e < this.edgeOrder.length; e++) {
            const edge = this.edgeOrder[e];

            BT.drawLine(this.projected[edge.i], this.projected[edge.j], edge.color);
        }

        for (let i = 0; i < 16; i++) {
            BT.drawPixel(this.projected[i], C_DOT);
        }
    }
}

bootstrap(Demo);
