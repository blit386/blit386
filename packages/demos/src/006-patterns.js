// Demo 006 - Patterns: animated mathematical art using only primitive drawing.
//
// Prerequisites: We learned about drawing and the game loop in Demo 001-Basics
// (https://blit-tech-demos.vancura.dev/001-basics), shapes in Demo 002-Primitives
// (https://vancura.dev/articles/blit-tech-primitives), and color in Demo 003-Colors
// (https://vancura.dev/articles/blit-tech-colors).
//
// We also use the palette system introduced in Demo 015-Palette-Presets
// (https://vancura.dev/articles/blit-tech-palette-presets) and demonstrated
// further in Demo 016-Palette-Animation (https://vancura.dev/articles/blit-tech-palette-animation).
//
// Live walkthrough: https://vancura.dev/articles/blit-tech-patterns
//
// All six patterns here are drawn using just pixels, lines, and rectangles
// no images needed. Each pattern is based on simple math (angles, waves, circles)
// that creates surprisingly complex-looking results.
//
// The six patterns arranged in a 2x3 grid are:
//   Spiral    - dots expanding outward in a spinning coil
//   Radial    - lines radiating from a center point like sun rays
//   Wave      - overlapping wave curves that interfere with each other
//   Circle    - a circle drawn from many tiny line segments
//   Lissajous - a smooth looping curve used in physics and electronics
//   Tunnel    - concentric rectangles that spin to look like a tunnel
//
// HOW COLORS WORK IN THIS DEMO:
//
// Every color must be registered in a "palette" before drawing. Think of it
// like choosing all your paint colors before starting a painting - you pick
// them out first, then use them by number ("color 5", "color 12", etc.).
//
// Some colors never change (white, background, wave colors) - those are set
// once during setup. Other colors animate (spiral, Lissajous, tunnel) - those
// are recalculated every tick in update() and stored back in the palette.
// The render() function only ever uses color numbers (indices), never Color32 objects.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration
//
// These numbers are the "addresses" in the palette table.
// Index 0 is always reserved for transparent - we never use it.
// We give each color a readable name so the code is easier to follow.

// Static colors (set once in init, never change).
const C_WHITE = 1; // Pure white - title text and font base color.
const C_BG = 2; // Very dark blue-black background.
const C_LABEL = 3; // Dim white - section labels ("Spiral", "Wave", etc.).
const C_DIM = 4; // Slightly dimmer - FPS counter text.
const C_WAVE_1 = 5; // Blue - primary sine wave.
const C_WAVE_2 = 6; // Orange - secondary cosine wave.
const C_WAVE_3 = 7; // Green - interference (both waves combined).

// Circle segments: 32 entries at indices 8..39.
// Each segment gets a different hue. Hue never changes so this is static.
const C_CIRCLE_BASE = 8;
const CIRCLE_SEGMENTS = 32;

// Radial rays: 12 entries at indices 40..51.
// Each ray has a fixed hue. Static.
const C_RADIAL_BASE = 40;
const RADIAL_LINES = 12;

// Dynamic colors (updated every tick in update()).

// Spiral dots: 100 entries at indices 60..159.
// The hue of each dot shifts forward as animTime grows, making colors scroll.
const C_SPIRAL_BASE = 60;
const SPIRAL_POINTS = 100;

// Lissajous curve: 32 color bands at indices 160..191.
// The 200-point curve is divided into 32 color groups that rotate over time.
const C_LISSAJOUS_BASE = 160;
const LISSAJOUS_BANDS = 32;

// Tunnel rectangles: 20 entries at indices 192..211.
// Outer rectangles are brighter and more saturated; inner ones are darker.
const C_TUNNEL_BASE = 192;
const TUNNEL_RECTS = 20;

// Engine overlay: measured FPS, target FPS, and demo name (enabled by default).

// #endregion

// #region Main Logic

/**
 * Demonstrates animated mathematical patterns using primitive drawing.
 * Each section shows a different algorithmic visual effect arranged in a 2x3 grid.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // animTime counts up in seconds. We use it to make patterns move.
    animTime = 0;

    // The palette holds all the colors we are allowed to use.
    // Think of it as a box of 256 numbered paint colors.
    palette = null;

    // #endregion

    // #region Pre-allocated Reusable Objects (Performance)

    // These Vector2i and Rect2i objects are created once and reused every frame.
    // Creating new objects inside a loop every frame can slow things down because
    // the browser has to clean up old objects. Reusing them avoids that.
    tempVec1 = new Vector2i(0, 0);
    tempVec2 = new Vector2i(0, 0);
    tempRect = new Rect2i(0, 0, 0, 0);

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Optional engine settings. We keep the default 320x240 screen and show the full
     * 256-slot palette in the overlay grid with 32 swatches per row.
     *
     * @returns {{ overlayPaletteView: boolean, overlayPaletteColumns: number, overlayStyle: { barPaletteIndex: number, textPaletteIndex: number } }}
     */
    configure() {
        return {
            overlayPaletteView: true,
            overlayStyle: {
                barPaletteIndex: 1,
                textPaletteIndex: 2,
                gapPaletteIndex: 2,
            },
            overlayTimingChart: true,
            overlayTimingChartDiagnostics: 'rich',
            overlayRendererDiagnosticsBar: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_WAVE_3,
                renderBarPaletteIndex: C_WAVE_1,
                warningPaletteIndex: C_WAVE_2,
                errorPaletteIndex: C_WAVE_2,
                tagPaletteIndex: C_LABEL,
            },
        };
    }

    /**
     * Runs once when the demo starts. Sets up the palette.
     *
     * IMPORTANT ORDER:
     *   1. Create palette            - make the 256-slot color table.
     *   2. Fill in static colors     - the ones that never change.
     *   3. BT.paletteSet()           - tell the engine to use this palette.
     *
     * @returns {Promise<boolean>} Returns true when ready to run.
     */
    async init() {
        // Step 1: Create the palette
        // BT.paletteCreate(256) makes a color table with 256 numbered slots.
        // Slot 0 is always transparent and cannot be changed.
        this.palette = BT.paletteCreate(256);

        // Step 2: Register static colors

        // Basic UI colors.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // White for title text.
        this.palette.set(C_BG, new Color32(15, 15, 25)); // Very dark blue-black background.
        this.palette.set(C_LABEL, new Color32(200, 200, 200)); // Dim white for pattern labels.
        this.palette.set(C_DIM, new Color32(150, 150, 150)); // Dimmer gray for FPS text.

        // Wave pattern: three fixed colors.
        this.palette.set(C_WAVE_1, new Color32(100, 200, 255)); // Blue wave.
        this.palette.set(C_WAVE_2, new Color32(255, 150, 100)); // Orange wave.
        this.palette.set(C_WAVE_3, new Color32(150, 255, 150)); // Green interference wave.

        // Circle segments: 32 colors spread across the rainbow.
        // Because these hues do not depend on animTime, we set them here once.
        for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
            // Spread 32 evenly-spaced hues across the 0-360 degree color wheel.
            const hue = (i / CIRCLE_SEGMENTS) * 360;
            this.palette.set(C_CIRCLE_BASE + i, Color32.fromHSL(hue, 100, 50));
        }

        // Radial rays: 12 colors, one per ray.
        for (let i = 0; i < RADIAL_LINES; i++) {
            // Slightly desaturated and brightened compared to the circle colors.
            const hue = (i / RADIAL_LINES) * 360;
            this.palette.set(C_RADIAL_BASE + i, Color32.fromHSL(hue, 80, 60));
        }

        // Spiral, Lissajous, and tunnel slots are left empty here.
        // They will be filled in by update() before the first frame renders.

        // Step 3: Activate the palette
        // This tells the engine "use this palette for all drawing from now on".
        BT.paletteSet(this.palette);

        console.log('[PatternsDemo] Initialized');
        return true;
    }

    /**
     * Runs at a fixed rate (60 times per second) to:
     *   1. Advance the animation timer.
     *   2. Recalculate dynamic palette entries for spiral, Lissajous, and tunnel.
     *
     * All color computation happens here. render() only uses palette index numbers.
     */
    update() {
        // deltaSeconds is one fixed update step in seconds (usually 1/60).
        this.animTime += BT.deltaSeconds;

        // Update spiral colors (100 animated dots)
        // Each dot gets a hue that depends on its position AND the current time.
        // As animTime grows, the hue offset grows too, making colors scroll outward.
        for (let i = 0; i < SPIRAL_POINTS; i++) {
            // Spread the base hue from 0 to 360 across the 100 dots.
            // animTime * 50 makes the colors scroll: 50 degrees per second.
            const hue = (i / SPIRAL_POINTS) * 360 + this.animTime * 50;

            // fromHSL takes hue (0-360), saturation (0-100), lightness (0-100).
            // Fully saturated (100) and mid-lightness (50) gives vivid rainbow colors.
            this.palette.set(C_SPIRAL_BASE + i, Color32.fromHSL(hue % 360, 100, 50));
        }

        // Update Lissajous color bands (32 bands for the 200-point curve)
        // We divide the 200 curve points into 32 color groups to save palette slots.
        for (let i = 0; i < LISSAJOUS_BANDS; i++) {
            // animTime * 30 rotates the color cycle: 30 degrees per second.
            const hue = (i / LISSAJOUS_BANDS) * 360 + this.animTime * 30;
            this.palette.set(C_LISSAJOUS_BASE + i, Color32.fromHSL(hue % 360, 100, 50));
        }

        // Update tunnel rectangle colors (20 rectangles)
        // Outer rectangles (high i, near viewer) get brighter hues.
        // Inner rectangles (low i, far away) get darker hues to suggest depth.
        for (let i = 0; i < TUNNEL_RECTS; i++) {
            // t goes from 0 (innermost/farthest) to 1 (outermost/nearest).
            const t = i / TUNNEL_RECTS;

            // The hue rotates at 50 degrees per second. Each rect offsets by t*360
            // so the colors spread across the rainbow from inner to outer.
            const hue = (t * 360 + this.animTime * 50) % 360;

            // Lightness goes from 30 (dark, far) to 70 (bright, near).
            const lightness = 30 + t * 40;

            this.palette.set(C_TUNNEL_BASE + i, Color32.fromHSL(hue, 100, lightness));
        }
    }

    /**
     * Runs once per screen refresh to draw all six pattern demonstrations.
     * Patterns are arranged in a 2x3 grid across the screen.
     *
     * Notice: there are NO Color32 objects here. Every draw call uses a palette index.
     */
    render() {
        // Fill the whole screen with the background color (very dark blue-black).
        BT.clear(C_BG);

        // Top row: three patterns centered at y=50.
        this.drawSpiral(new Vector2i(40, 50));
        this.drawRadialLines(new Vector2i(120, 50));
        this.drawWavePattern(new Vector2i(200, 50));

        // Bottom row: three more patterns centered at y=130.
        this.drawCircleApproximation(new Vector2i(40, 130));
        this.drawLissajous(new Vector2i(120, 130));
        this.drawTunnel(new Vector2i(200, 130));

        // Measured FPS, target FPS, and demo name (from document.title).
    }

    // #endregion

    // #region Pattern Rendering

    /**
     * Draws an Archimedean spiral: a coil of colored dots that expands outward
     * while rotating. The inner dots are near the center, the outer ones are far.
     *
     * Colors are animated - they scroll along the spiral over time. The actual
     * color values are computed in update() and stored in palette slots C_SPIRAL_BASE+i.
     *
     * @param {Vector2i} center - The center point to spiral around.
     */
    drawSpiral(center) {
        const maxRadius = 35;

        for (let i = 0; i < SPIRAL_POINTS; i++) {
            // t goes from animTime (inner) to animTime + 4*PI (outer).
            // 4*PI is two full rotations, so the spiral wraps around twice.
            const t = (i / SPIRAL_POINTS) * Math.PI * 4 + this.animTime;

            // How far from the center this dot is.
            // Point 0 is at the center, point 99 is at maxRadius pixels away.
            const radius = (i / SPIRAL_POINTS) * maxRadius;

            // Convert polar coordinates (angle t, distance radius) to x,y screen positions.
            const x = center.x + Math.cos(t) * radius;
            const y = center.y + Math.sin(t) * radius;

            // Use the animated color for dot i - already updated in update().
            this.tempVec1.set(Math.floor(x), Math.floor(y));
            BT.drawPixel(this.tempVec1, C_SPIRAL_BASE + i);
        }
    }

    /**
     * Draws lines radiating from a center point like sun rays.
     * Each ray has a different color (set once in init) and its length pulses.
     *
     * @param {Vector2i} center - The center point to draw rays from.
     */
    drawRadialLines(center) {
        const radius = 35; // Maximum length of each ray.

        for (let i = 0; i < RADIAL_LINES; i++) {
            // Space the rays evenly around the circle. The full circle is 2*PI radians.
            // Adding animTime rotates the whole pattern over time.
            const angle = (i / RADIAL_LINES) * Math.PI * 2 + this.animTime;

            // Each ray has a different phase offset (i) so they pulse at different times.
            // The length oscillates between radius*0 and radius*1.
            const length = radius * (0.5 + 0.5 * Math.sin(this.animTime * 2 + i));

            // Calculate where the tip of this ray is.
            const x = center.x + Math.cos(angle) * length;
            const y = center.y + Math.sin(angle) * length;

            // Use the static color for ray i (set in init, never changes).
            this.tempVec1.set(Math.floor(x), Math.floor(y));
            BT.drawLine(center, this.tempVec1, C_RADIAL_BASE + i);
        }
    }

    /**
     * Draws three wave curves overlapping each other.
     * Two separate waves plus a combined "interference" pattern that shows
     * what happens when the two waves add together.
     *
     * All three wave colors are static - they never change.
     *
     * @param {Vector2i} center - The center point to draw the waves around.
     */
    drawWavePattern(center) {
        const width = 60; // The wave spans 60 pixels wide.

        for (let x = 0; x < width; x++) {
            // Map x from 0..width to a screen position centered around center.x.
            const baseX = center.x - width / 2 + x;

            // Primary wave: a sine wave. Adding animTime*20 makes it scroll to the left.
            // Multiplying by 0.2 controls the frequency (how many waves fit in the space).
            // Multiplying by 15 controls the amplitude (how tall the wave is in pixels).
            const y1 = Math.sin((x + this.animTime * 20) * 0.2) * 15;
            this.tempVec1.set(baseX, center.y + Math.floor(y1));
            BT.drawPixel(this.tempVec1, C_WAVE_1);

            // Secondary wave: a cosine wave with different speed and size.
            const y2 = Math.cos((x + this.animTime * 15) * 0.15) * 10;
            this.tempVec1.set(baseX, center.y + Math.floor(y2));
            BT.drawPixel(this.tempVec1, C_WAVE_2);

            // Interference: add both waves together. Divide by 2 to keep it in range.
            // When waves meet in-phase they reinforce; out-of-phase they cancel.
            const y3 = Math.sin((x + this.animTime * 20) * 0.2) * 15 + Math.cos((x + this.animTime * 15) * 0.15) * 10;
            this.tempVec1.set(baseX, center.y + Math.floor(y3 / 2));
            BT.drawPixel(this.tempVec1, C_WAVE_3);
        }
    }

    /**
     * Draws a circle by connecting many short line segments around its edge.
     * This shows how circles can be approximated with only line-drawing primitives.
     * The radius pulses and the whole circle slowly rotates.
     *
     * Segment colors are static (set once in init based on hue position).
     *
     * @param {Vector2i} center - The center of the circle.
     */
    drawCircleApproximation(center) {
        // The radius pulses between 25 and 35 pixels using Math.sin.
        const radius = 16 + Math.sin(this.animTime) * 14;

        for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
            // Calculate the start and end angle of this segment.
            // Together, all 32 segments cover the full circle (2*PI radians).
            const angle1 = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
            const angle2 = ((i + 1) / CIRCLE_SEGMENTS) * Math.PI * 2;

            // Adding animTime to the angles rotates the whole circle over time.
            const x1 = center.x + Math.cos(angle1 + this.animTime) * radius;
            const y1 = center.y + Math.sin(angle1 + this.animTime) * radius;
            const x2 = center.x + Math.cos(angle2 + this.animTime) * radius;
            const y2 = center.y + Math.sin(angle2 + this.animTime) * radius;

            // Each segment uses its own static color from the palette.
            this.tempVec1.set(Math.floor(x1), Math.floor(y1));
            this.tempVec2.set(Math.floor(x2), Math.floor(y2));

            BT.drawLine(this.tempVec1, this.tempVec2, C_CIRCLE_BASE + i);
        }
    }

    /**
     * Draws a Lissajous curve - a parametric figure where the x and y axes
     * oscillate at different frequencies. The ratio 3:4 here creates an interlocking
     * looping curve (not a simple figure-eight; a classic figure-eight shape often
     * comes from a 1:2 frequency ratio instead).
     *
     * Lissajous figures are used in physics and electronics to visualize frequency ratios.
     *
     * Colors are animated - 200 curve points are mapped to 32 color bands,
     * and those bands rotate through the rainbow over time.
     *
     * @param {Vector2i} center - The center of the curve.
     */
    drawLissajous(center) {
        const points = 200; // More points = smoother curve.
        const a = 3; // Frequency of the horizontal oscillation.
        const b = 4; // Frequency of the vertical oscillation.
        const radius = 30;

        // Track the previous point so we can draw a line from previous to current.
        let prevX = 0;
        let prevY = 0;

        for (let i = 0; i <= points; i++) {
            // t goes from 0 to 2*PI, tracing out the full curve.
            const t = (i / points) * Math.PI * 2;

            // x oscillates at frequency a, y oscillates at frequency b.
            // Adding animTime to the x calculation makes the figure rotate over time.
            const x = center.x + Math.sin(a * t + this.animTime) * radius;
            const y = center.y + Math.sin(b * t) * radius;

            if (i > 0) {
                // Map this point to one of the 32 color bands.
                // Math.floor((i / points) * LISSAJOUS_BANDS) gives 0..31.
                // We cap at LISSAJOUS_BANDS-1 to avoid going out of range.
                const band = Math.min(Math.floor((i / points) * LISSAJOUS_BANDS), LISSAJOUS_BANDS - 1);

                this.tempVec1.set(Math.floor(prevX), Math.floor(prevY));
                this.tempVec2.set(Math.floor(x), Math.floor(y));

                BT.drawLine(this.tempVec1, this.tempVec2, C_LISSAJOUS_BASE + band);
            }

            // Save this point to use as "previous" in the next iteration.
            prevX = x;
            prevY = y;
        }
    }

    /**
     * Draws a tunnel effect by stacking concentric rectangles of decreasing size.
     * The rectangles slowly rotate and wobble, creating an illusion of depth.
     *
     * Colors are animated - each rectangle's hue and brightness are updated in update().
     *
     * @param {Vector2i} center - The vanishing point (center) of the tunnel.
     */
    drawTunnel(center) {
        for (let i = 0; i < TUNNEL_RECTS; i++) {
            // t goes from 1 (outer/near) down to 0 (inner/far).
            const t = i / TUNNEL_RECTS;

            // Outer rectangles are large, inner ones are small.
            // The sine term adds a gentle pulsing wobble to the size.
            const size = (1 - t) * 60 + Math.sin(this.animTime * 2 + i * 0.3) * 5;

            // Each rectangle orbits slightly around the center at different speeds.
            const angle = this.animTime + i * 0.2;
            const offsetX = Math.cos(angle) * i;
            const offsetY = Math.sin(angle) * i;

            // Position the rectangle centered on the offset point.
            const x = center.x - size / 2 + offsetX;
            const y = center.y - size / 2 + offsetY;

            // Use the animated color for this rectangle (updated in update()).
            this.tempRect.set(Math.floor(x), Math.floor(y), Math.floor(size), Math.floor(size));
            BT.drawRect(this.tempRect, C_TUNNEL_BASE + i);
        }
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
