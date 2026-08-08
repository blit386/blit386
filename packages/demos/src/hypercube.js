/**
 * Hypercube – Fez-style rotating tesseract wireframe.
 * @description A Fez-style rotating tesseract: watch a four-dimensional cube turn on a 256x256 PICO-8 sized canvas.
 *
 * A tesseract is a 4D cube: two 3D cubes linked along a fourth axis (W).
 * We rotate in 4D, then project down to 2D so you can see the links stretch
 * and the "inner" cube pass through the "outer" one – like the Fez logo.
 *
 * Drag (mouse or touch) spins it like a trackball: horizontal = yaw around Y,
 * vertical = pitch around X. On release the spin keeps the finger's 2D velocity
 * (inertia), then that spin vector slowly fades back to the automatic tumble.
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

/**
 * Angular velocity in each rotation plane (radians per second).
 *
 * @typedef {object} Spin
 * @property {number} xw
 * @property {number} yz
 * @property {number} xy
 * @property {number} zw
 * @property {number} xz
 */

const SIZE = 320;
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
 * The automatic Fez tumble – the "home" spin vector we always fade back to.
 * `xz` stays 0 at rest; drag/flick uses it for screen-space yaw.
 *
 * @type {Readonly<Spin>}
 */
const HOME_SPIN = Object.freeze({
    xw: 0.55,
    yz: 0.38,
    xy: 0.12,
    zw: 0.22,
    xz: 0,
});

/**
 * Radians of trackball turn per pixel of drag.
 * Horizontal pixels yaw (XZ); vertical pixels pitch (YZ).
 */
const DRAG_SENSITIVITY = 0.01;

/**
 * How quickly we smooth the finger's instantaneous velocity while dragging
 * (higher = snappier, lower = softer). Used so a noisy last frame does not
 * become a wild flick.
 */
const VELOCITY_SMOOTH = 14;

/**
 * How quickly free spin eases back toward HOME_SPIN after release (per second).
 * Lower = longer coast on the flick before the Fez tumble returns.
 */
const SPIN_FADE = 1.15;

/** Cap on flick spin so a frantic swipe cannot spin forever. */
const MAX_FLICK_SPIN = 8;

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

/**
 * Clamp one spin component into ±MAX_FLICK_SPIN.
 *
 * @param {number} value
 * @returns {number}
 */
function clampFlick(value) {
    return Math.max(-MAX_FLICK_SPIN, Math.min(MAX_FLICK_SPIN, value));
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

    /** Screen-space yaw (XZ plane – around Y). @type {number} */
    angleXZ = 0;

    /** Free-motion angular velocity; eases toward HOME_SPIN. @type {Spin} */
    spin = { ...HOME_SPIN };

    /**
     * Smoothed finger yaw/pitch (radians / sec) while dragging.
     * On release these become spin.xz / spin.yz so the model coasts.
     *
     * @type {{ xz: number, yz: number }}
     */
    fingerSpin = { xz: 0, yz: 0 };

    /** Pointer slot currently steering (−1 = none). @type {number} */
    dragSlot = -1;

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
        // BT.random is the engine's shared random number generator.
        // Its float() method returns a decimal from the first value up to (but not including) the second,
        // so this lands anywhere on the 360-degree color wheel.
        const start = BT.random.float(0, 360);

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
     * Mouse (slot 0): primary button held. Touch slots: contact active.
     * Same rule as pointer-paint.
     *
     * @param {number} slot
     * @returns {boolean}
     */
    isDragHeld(slot) {
        if (!BT.isPointerActive(slot)) {
            return false;
        }

        return slot === 0 ? BT.isDown(BT.BTN_POINTER_A, 0) : true;
    }

    /**
     * @param {number} dt
     * @returns {void}
     */
    integrateSpin(dt) {
        this.angleXW += this.spin.xw * dt;
        this.angleYZ += this.spin.yz * dt;
        this.angleXY += this.spin.xy * dt;
        this.angleZW += this.spin.zw * dt;
        this.angleXZ += this.spin.xz * dt;
    }

    /**
     * Exponential ease of `spin` toward HOME_SPIN (soft settle, no hard stop).
     *
     * @param {number} dt
     * @returns {void}
     */
    fadeSpinToHome(dt) {
        const t = 1 - Math.exp(-SPIN_FADE * dt);

        this.spin.xw += (HOME_SPIN.xw - this.spin.xw) * t;
        this.spin.yz += (HOME_SPIN.yz - this.spin.yz) * t;
        this.spin.xy += (HOME_SPIN.xy - this.spin.xy) * t;
        this.spin.zw += (HOME_SPIN.zw - this.spin.zw) * t;
        this.spin.xz += (HOME_SPIN.xz - this.spin.xz) * t;
    }

    /**
     * Trackball drag + flick inertia. While held: yaw/pitch from pointer delta
     * and EMA the finger velocity. On release: that velocity becomes `spin`,
     * then fades back to HOME_SPIN.
     *
     * @param {number} dt
     * @returns {void}
     */
    updateDrag(dt) {
        const wasDragging = this.dragSlot >= 0;

        // Stick with the current finger; otherwise claim the first held slot.
        if (this.dragSlot >= 0 && !this.isDragHeld(this.dragSlot)) {
            this.dragSlot = -1;
        }

        if (this.dragSlot < 0) {
            for (let slot = 0; slot < 4; slot++) {
                if (this.isDragHeld(slot)) {
                    this.dragSlot = slot;
                    // Drop press-frame jitter so it cannot become a throw.
                    this.fingerSpin.xz = 0;
                    this.fingerSpin.yz = 0;
                    break;
                }
            }
        }

        if (this.dragSlot >= 0) {
            const delta = BT.pointerDelta(this.dragSlot);

            // Trackball: horizontal → yaw (XZ / around Y); vertical → pitch (YZ / around X).
            const dYaw = delta.x * DRAG_SENSITIVITY;
            const dPitch = delta.y * DRAG_SENSITIVITY;

            this.angleXZ += dYaw;
            this.angleYZ += dPitch;

            // Guard dt so a hitch cannot explode the velocity sample.
            if (dt > 0.0001) {
                const alpha = 1 - Math.exp(-VELOCITY_SMOOTH * dt);

                this.fingerSpin.xz += (dYaw / dt - this.fingerSpin.xz) * alpha;
                this.fingerSpin.yz += (dPitch / dt - this.fingerSpin.yz) * alpha;
            }

            return;
        }

        // Coast on the flick (trackball axes only); fade restores the Fez planes.
        if (wasDragging) {
            this.spin.xz = clampFlick(this.fingerSpin.xz);
            this.spin.yz = clampFlick(this.fingerSpin.yz);
            this.spin.xw = 0;
            this.spin.xy = 0;
            this.spin.zw = 0;
        }

        this.integrateSpin(dt);
        this.fadeSpinToHome(dt);
    }

    /**
     * @returns {void}
     */
    update() {
        const dt = BT.deltaSeconds;

        this.updateDrag(dt);

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
        const cXZ = Math.cos(this.angleXZ);
        const sXZ = Math.sin(this.angleXZ);

        const v = this.scratch;

        for (let i = 0; i < 16; i++) {
            const src = VERTICES[i];

            v[0] = src[0];
            v[1] = src[1];
            v[2] = src[2];
            v[3] = src[3];

            // 4D tumble planes, then screen-space yaw (XZ) so a horizontal drag
            // turns the projected object like a solid in front of you.
            this.rotatePlane(v, cXW, sXW, 0, 3);
            this.rotatePlane(v, cYZ, sYZ, 1, 2);
            this.rotatePlane(v, cXY, sXY, 0, 1);
            this.rotatePlane(v, cZW, sZW, 2, 3);
            this.rotatePlane(v, cXZ, sXZ, 0, 2);

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
