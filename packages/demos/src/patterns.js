/*

Patterns: animated mathematical art using only primitive drawing.
@description Animated mathematical art from primitives alone: spirals, Lissajous curves, waves, and a tunnel.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Colors: https://demos.blit386.dev/colors

Live version: https://demos.blit386.dev/patterns

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#draw-using-absolute-palette-indices
  - Overlay: https://blit386.dev/docs/guides/overlay#optional-bands

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#primitives
  - Core Types: https://blit386.dev/docs/api/core-types#color32
  - Overlay: https://blit386.dev/docs/api/overlay#timing-chart-optional

---

WHAT YOU WILL SEE
-----------------

Six small animated patterns on a near-black screen, arranged in two rows of three, each
with an amber caption under it:

- Spiral: 100 dots coiling out from the center, spinning, with colors that slide along
  the coil.
- Radial: 12 rays shooting out from a center point like sun rays, each pulsing in length
  while the whole set slowly turns.
- Wave: a blue sine wave, an orange cosine wave, and a green "interference" wave that is
  the two added together, all scrolling sideways.
- Circle: a ring of 32 short line segments in rainbow colors that slowly spins while its
  radius breathes in and out.
- Lissajous: a smooth looping curve (the kind physics and electronics people draw on
  oscilloscopes) that slowly changes shape, with 32 color bands rotating around it.
- Tunnel: 20 nested squares that shrink toward the center, wobble, and orbit, like
  looking down a pipe.

The engine overlay is open from the start with the full 256-slot palette grid and a
timing chart in "rich" diagnostics mode, so you can watch the animated palette ranges
change color every tick.

WHAT YOU WILL LEARN
-------------------

- Drawing with just three primitives: BT.drawPixel(), BT.drawLine(), and BT.drawRect().
  No images, no sprites.
- Turning an angle and a distance into x and y with Math.cos() and Math.sin().
- Palette-first animation: update() recomputes colors with Color32.fromHSL() and writes
  them into reserved palette ranges; render() only passes slot numbers.
- Reusing a few Vector2i and Rect2i objects (tempVec1, tempVec2, tempRect) with .set()
  instead of creating new ones every frame.
- Styling the overlay from configure() with overlayStyle and overlayTimingChartStyle,
  and turning on the renderer diagnostics bar.

HOW COLORS WORK IN THIS DEMO
----------------------------

Every color must be registered in a palette before drawing. Think of it like choosing
all your paint colors before starting a painting: you pick them out first, then use them
by number ("color 5", "color 12", and so on).

Some colors never change (white, the background, the three wave colors, the 32 circle
hues, the 12 ray hues). Those are set once in init(). Other colors animate (the 100
spiral dots, the 32 Lissajous bands, the 20 tunnel squares). Those are recalculated every
tick in update() and stored back in the palette. render() only ever uses palette index
numbers, never Color32 objects.

TRY THIS
--------

- Watch the overlay's palette grid: slots 60-159 (spiral), 160-191 (Lissajous), and
  192-211 (tunnel) keep changing, while 8-39 (circle) and 40-51 (rays) stay still.
- Press the backquote key (`) to hide the overlay and see the patterns alone.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// These numbers are the "addresses" in the palette table. Slot 0 is always reserved for
// transparent, so we never use it. Each color gets a readable name so the code is easier
// to follow.

// Static colors: set once in init(), never changed.
const C_WHITE = 1; // pure white: the overlay bar color (see configure())
const C_BG = 2; // very dark blue-black background
const C_TAG = 3; // dim white: only feeds the overlay timing-chart tag color
const C_WAVE_1 = 5; // blue: the sine wave
const C_WAVE_2 = 6; // orange: the cosine wave
const C_WAVE_3 = 7; // green: the interference wave (both added together)

// Circle segments: 32 slots at 8-39. Each segment gets its own hue. The hues never
// change, so these are static too.
const C_CIRCLE_BASE = 8;
const CIRCLE_SEGMENTS = 32;

// Radial rays: 12 slots at 40-51, one fixed hue per ray. Static.
const C_RADIAL_BASE = 40;
const RADIAL_LINES = 12;

// The dynamic colors start here: everything below is repainted every tick in update().
// Spiral dots: 100 slots at 60-159. Each dot's hue moves forward as animTime grows, so
// the colors slide along the coil.
const C_SPIRAL_BASE = 60;
const SPIRAL_POINTS = 100;

// Lissajous curve: 32 color bands at 160-191. The 200-point curve is split into 32 color
// groups whose hues rotate over time.
const C_LISSAJOUS_BASE = 160;
const LISSAJOUS_BANDS = 32;

// Tunnel squares: 20 slots at 192-211. The large outer square is darkest; the squares get
// brighter as they shrink toward the center.
const C_TUNNEL_BASE = 192;
const TUNNEL_RECTS = 20;

// Animated mathematical patterns drawn with primitives only, six of them in a 2x3 grid.
class Demo {
    // A clock that counts up in seconds. It makes the patterns move.
    animTime = 0;

    // The palette holds every color we are allowed to use: a box of 256 numbered paints.
    /** @type {Palette | null} */
    palette = null;

    // Where the shared UI theme colors landed in the palette, filled by applyTheme() in
    // init(). The UI kit draws the six captions with these slots.
    theme = null;

    // These Vector2i and Rect2i objects are created once and reused every frame. Making
    // new objects inside a loop every frame can slow things down, because the browser has
    // to clean up the old ones. Reusing them avoids that.
    tempVec1 = new Vector2i(0, 0);
    tempVec2 = new Vector2i(0, 0);
    tempRect = new Rect2i(0, 0, 0, 0);

    // Optional engine settings. We keep the default 320x240 screen, open the overlay from
    // the start with the full 256-slot palette grid (default column count), and turn on
    // the timing chart in "rich" mode plus the renderer diagnostics bar, so GPU pipeline
    // pressure is visible while the patterns run.
    configure() {
        return {
            isOverlayPaletteEnabled: true,
            isOverlayVisibleAtStart: true,

            // Overlay bar: white with dark text.
            overlayStyle: {
                barPaletteIndex: C_WHITE,
                textPaletteIndex: C_BG,
                gapPaletteIndex: C_BG,
            },

            isOverlayTimingChartEnabled: true,
            overlayTimingChartDiagnostics: 'rich',
            isOverlayRendererDiagnosticsBarEnabled: true,

            // The timing chart bars borrow the wave colors: green for update(), blue for
            // render(), orange for warnings and errors.
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_WAVE_3,
                renderBarPaletteIndex: C_WAVE_1,
                warningPaletteIndex: C_WAVE_2,
                errorPaletteIndex: C_WAVE_2,
                tagPaletteIndex: C_TAG,
            },
        };
    }

    // Runs once when the demo starts and sets up the palette. The order matters:
    //
    //   1. Create the palette: the 256-slot color table.
    //   2. Fill in the static colors: the ones that never change.
    //   3. BT.paletteSet(): tell the engine to use this palette.
    //
    // Returns true when ready to run.
    async init() {
        // Step 1: create the palette. BT.paletteCreate(256) makes a color table with 256
        // numbered slots. Slot 0 is always transparent and cannot be changed.
        this.palette = BT.paletteCreate(256);

        // Step 2: register the static colors. First the basic ones.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // overlay bar white
        this.palette.set(C_BG, new Color32(15, 15, 25)); // very dark blue-black
        this.palette.set(C_TAG, new Color32(200, 200, 200)); // dim white for chart tags

        // Wave pattern: three fixed colors.
        this.palette.set(C_WAVE_1, new Color32(100, 200, 255)); // blue wave
        this.palette.set(C_WAVE_2, new Color32(255, 150, 100)); // orange wave
        this.palette.set(C_WAVE_3, new Color32(150, 255, 150)); // green interference

        // Circle segments: 32 colors spread across the rainbow. These hues do not depend
        // on animTime, so we set them here once.
        for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
            // Spread 32 evenly spaced hues across the 0-360 degree color wheel.
            const hue = (i / CIRCLE_SEGMENTS) * 360;

            this.palette.set(C_CIRCLE_BASE + i, Color32.fromHSL(hue, 100, 50));
        }

        // Radial rays: 12 colors, one per ray.
        for (let i = 0; i < RADIAL_LINES; i++) {
            // A little less saturated and a little brighter than the circle colors.
            const hue = (i / RADIAL_LINES) * 360;

            this.palette.set(C_RADIAL_BASE + i, Color32.fromHSL(hue, 80, 60));
        }

        // The spiral, Lissajous, and tunnel slots are left empty here. update() fills
        // them in before the first frame renders.

        // Install the shared UI theme the captions draw with. It writes 12 colors into
        // slots 240-251, above every range this demo touches (the highest animated range
        // is the tunnel at 192-211), so the per-tick palette animation never collides
        // with the UI colors. Must run before BT.paletteSet().
        this.theme = applyTheme(this.palette);

        // Step 3: activate the palette. This tells the engine "use this palette for all
        // drawing from now on".
        BT.paletteSet(this.palette);

        return true;
    }

    // Runs at a fixed rate (60 times per second by default). Advances the animation clock
    // and recomputes the dynamic palette entries for the spiral, Lissajous, and tunnel.
    // All color math happens here; render() only uses palette index numbers.
    update() {
        // deltaSeconds is the length of one fixed update step in seconds (usually 1/60).
        this.animTime += BT.deltaSeconds;

        // Spiral colors: 100 animated dots. Each dot's hue depends on its place along the
        // coil and on the current time, so the colors slide along the coil as animTime
        // grows.
        for (let i = 0; i < SPIRAL_POINTS; i++) {
            // Spread the base hue from 0 to 360 across the 100 dots. animTime * 50
            // scrolls the colors by 50 degrees per second.
            const hue = (i / SPIRAL_POINTS) * 360 + this.animTime * 50;

            // fromHSL takes hue (0-360), saturation (0-100), and lightness (0-100).
            // Full saturation and mid lightness give vivid rainbow colors. `% 360`
            // wraps the hue back onto the color wheel once it passes 360.
            this.palette.set(C_SPIRAL_BASE + i, Color32.fromHSL(hue % 360, 100, 50));
        }

        // Lissajous color bands: 32 bands for the 200-point curve. Splitting the points
        // into 32 groups saves palette slots.
        for (let i = 0; i < LISSAJOUS_BANDS; i++) {
            // animTime * 30 rotates the color cycle by 30 degrees per second.
            const hue = (i / LISSAJOUS_BANDS) * 360 + this.animTime * 30;

            this.palette.set(C_LISSAJOUS_BASE + i, Color32.fromHSL(hue % 360, 100, 50));
        }

        // Tunnel colors: 20 squares. Low i is the big outer square, high i the small
        // inner one (drawTunnel() sizes them with 1 - t), so the lightness ramp below
        // makes the tunnel brighter toward the center.
        for (let i = 0; i < TUNNEL_RECTS; i++) {
            // t goes from 0 (outer, largest) to just under 1 (inner, smallest).
            const t = i / TUNNEL_RECTS;

            // The hue rotates at 50 degrees per second, and each square is offset by
            // t * 360 so the colors spread across the rainbow from outer to inner.
            const hue = (t * 360 + this.animTime * 50) % 360;

            // Lightness goes from 30 (dark, outer) to nearly 70 (bright, inner).
            const lightness = 30 + t * 40;

            this.palette.set(C_TUNNEL_BASE + i, Color32.fromHSL(hue, 100, lightness));
        }
    }

    // Runs once per screen refresh and draws all six patterns in a 2x3 grid. Notice there
    // are no Color32 objects here: every draw call uses a palette index.
    render() {
        // Fill the whole screen with the very dark blue-black background.
        BT.clear(C_BG);

        // Top row: three patterns centered at y = 80.
        this.drawSpiral(new Vector2i(60, 80));
        this.drawRadialLines(new Vector2i(160, 80));
        this.drawWavePattern(new Vector2i(260, 80));

        // Bottom row: three more centered at y = 150.
        this.drawCircleApproximation(new Vector2i(60, 150));
        this.drawLissajous(new Vector2i(160, 150));
        this.drawTunnel(new Vector2i(260, 150));

        // Caption each grid cell so viewers know which pattern they are looking at.
        // ui.caption() is the shared UI kit's pinned one-line caption, the same widget
        // every demo in the series uses. Text draws left-aligned, so each x is nudged
        // until the name sits under its pattern's center.
        ui.caption(42, 100, 'Spiral');
        ui.caption(120, 100, 'Radial');
        ui.caption(250, 100, 'Wave');
        ui.caption(42, 180, 'Circle');
        ui.caption(133, 180, 'Lissajous');
        ui.caption(243, 180, 'Tunnel');
    }

    // Draws an Archimedean spiral: a coil of colored dots that expands outward from
    // `center` while rotating. Inner dots sit near the center, outer ones far away. The
    // colors are animated: update() computes them and stores them in the slots
    // C_SPIRAL_BASE + i.
    drawSpiral(center) {
        const maxRadius = 35;

        for (let i = 0; i < SPIRAL_POINTS; i++) {
            // The angle runs from animTime (inner) to animTime + 2 * PI (outer). 2 * PI
            // is one full turn, so the coil wraps around once, and adding animTime spins
            // it.
            const t = (i / SPIRAL_POINTS) * Math.PI * 2 + this.animTime;

            // How far from the center this dot is: dot 0 sits at the center, dot 99 is
            // almost maxRadius pixels away.
            const radius = (i / SPIRAL_POINTS) * maxRadius;

            // Convert polar coordinates (angle t, distance radius) to x and y on screen.
            // Math.cos and Math.sin turn an angle into how far to move along each axis.
            // Think of a clock hand: cos is how far right or left the tip is, sin how far
            // up or down. Math.PI is half a turn (180 degrees); 2 * PI is a full turn
            // (360 degrees). Multiplying by radius stretches that direction to the dot's
            // distance from the center.
            const x = center.x + Math.cos(t) * radius;
            const y = center.y + Math.sin(t) * radius;

            // Draw the dot with its animated color, already updated in update().
            this.tempVec1.set(Math.floor(x), Math.floor(y));
            BT.drawPixel(this.tempVec1, C_SPIRAL_BASE + i);
        }
    }

    // Draws lines radiating from `center` like sun rays. Each ray has its own fixed color
    // (set once in init()) and its length pulses.
    drawRadialLines(center) {
        const radius = 35; // maximum length of each ray

        for (let i = 0; i < RADIAL_LINES; i++) {
            // Space the rays evenly around the circle: the full circle is 2 * PI radians.
            // Adding animTime rotates the whole pattern over time.
            const angle = (i / RADIAL_LINES) * Math.PI * 2 + this.animTime;

            // Each ray gets a different phase offset (i) so they pulse at different
            // times. The length swings between 0 and the full radius.
            const length = radius * (0.5 + 0.5 * Math.sin(this.animTime * 2 + i));

            // Where the tip of this ray is.
            const x = center.x + Math.cos(angle) * length;
            const y = center.y + Math.sin(angle) * length;

            // Draw the ray from the center to the tip in its fixed color.
            this.tempVec1.set(Math.floor(x), Math.floor(y));
            BT.drawLine(center, this.tempVec1, C_RADIAL_BASE + i);
        }
    }

    // Draws three wave curves on top of each other around `center`: a sine wave, a cosine
    // wave, and an "interference" wave that shows what happens when the two are added.
    // All three wave colors are static.
    drawWavePattern(center) {
        const width = 60; // the waves span 60 pixels

        for (let x = 0; x < width; x++) {
            // Map x from 0..width to a screen column centered on center.x.
            const baseX = center.x - width / 2 + x;

            // Primary wave: a sine wave. Adding animTime * 20 makes it scroll to the
            // left. Multiplying by 0.2 sets the frequency (how many waves fit in the
            // space) and multiplying by 15 sets the amplitude (how tall the wave is in
            // pixels).
            const y1 = Math.sin((x + this.animTime * 20) * 0.2) * 15;
            this.tempVec1.set(baseX, center.y + Math.floor(y1));
            BT.drawPixel(this.tempVec1, C_WAVE_1);

            // Secondary wave: a cosine wave with a different speed and size.
            const y2 = Math.cos((x + this.animTime * 15) * 0.15) * 10;
            this.tempVec1.set(baseX, center.y + Math.floor(y2));
            BT.drawPixel(this.tempVec1, C_WAVE_2);

            // Interference: both waves added together, divided by 2 to keep it in range.
            // Where the waves line up they reinforce each other; where they are opposite
            // they cancel out.
            const y3 = Math.sin((x + this.animTime * 20) * 0.2) * 15 + Math.cos((x + this.animTime * 15) * 0.15) * 10;
            this.tempVec1.set(baseX, center.y + Math.floor(y3 / 2));
            BT.drawPixel(this.tempVec1, C_WAVE_3);
        }
    }

    // Draws a circle by joining many short line segments around its edge, showing how a
    // circle can be approximated with nothing but lines. The radius pulses and the whole
    // ring slowly rotates. Segment colors are static (set once in init() by hue).
    drawCircleApproximation(center) {
        // The radius pulses between 2 and 30 pixels (16 plus or minus 14) using Math.sin.
        const radius = 16 + Math.sin(this.animTime) * 14;

        for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
            // The start and end angle of this segment. Together all 32 segments cover the
            // full circle (2 * PI radians).
            const angle1 = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
            const angle2 = ((i + 1) / CIRCLE_SEGMENTS) * Math.PI * 2;

            // Adding animTime to both angles rotates the whole circle over time.
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

    // Draws a Lissajous curve: a figure where x and y swing back and forth at different
    // frequencies. The 3:4 ratio here gives an interlocking looping curve (a classic
    // figure-eight usually comes from a 1:2 ratio). Lissajous figures are used in physics
    // and electronics to visualize frequency ratios. The colors are animated: 200 curve
    // points map to 32 color bands, and those bands rotate through the rainbow over time.
    drawLissajous(center) {
        const points = 200; // more points, smoother curve
        const a = 3; // frequency of the horizontal swing
        const b = 4; // frequency of the vertical swing
        const radius = 30;

        // Remember the previous point so each step draws a line from it to the new one.
        let prevX = 0;
        let prevY = 0;

        for (let i = 0; i <= points; i++) {
            // t runs from 0 to 2 * PI, tracing the full curve.
            const t = (i / points) * Math.PI * 2;

            // x swings at frequency a, y at frequency b. Adding animTime to the x phase
            // makes the figure slowly change shape over time.
            const x = center.x + Math.sin(a * t + this.animTime) * radius;
            const y = center.y + Math.sin(b * t) * radius;

            if (i > 0) {
                // Map this point to one of the 32 color bands: Math.floor((i / points) *
                // LISSAJOUS_BANDS) gives 0..32, so Math.min caps it at 31 to stay in
                // range.
                const band = Math.min(Math.floor((i / points) * LISSAJOUS_BANDS), LISSAJOUS_BANDS - 1);

                this.tempVec1.set(Math.floor(prevX), Math.floor(prevY));
                this.tempVec2.set(Math.floor(x), Math.floor(y));

                BT.drawLine(this.tempVec1, this.tempVec2, C_LISSAJOUS_BASE + band);
            }

            // Save this point as "previous" for the next step.
            prevX = x;
            prevY = y;
        }
    }

    // Draws a tunnel by stacking 20 nested squares of shrinking size. They slowly orbit
    // and wobble, which gives the illusion of depth. Colors are animated: each square's
    // hue and brightness come from update().
    drawTunnel(center) {
        for (let i = 0; i < TUNNEL_RECTS; i++) {
            // t = i / TUNNEL_RECTS: i = 0 is the big outer square, the last i the small
            // inner one (the size uses 1 - t below).
            const t = i / TUNNEL_RECTS;

            // Outer squares are large, inner ones small. The sine term adds a gentle
            // pulsing wobble to the size.
            const size = (1 - t) * 60 + Math.sin(this.animTime * 2 + i * 0.3) * 5;

            // Each square orbits a little around the center. The orbit radius is i, so
            // the inner squares swing farther, and i * 0.2 gives each one a different
            // phase.
            const angle = this.animTime + i * 0.2;
            const offsetX = Math.cos(angle) * i;
            const offsetY = Math.sin(angle) * i;

            // Position the square so it is centered on the offset point.
            const x = center.x - size / 2 + offsetX;
            const y = center.y - size / 2 + offsetY;

            // Draw the outline in its animated color (updated in update()).
            this.tempRect.set(Math.floor(x), Math.floor(y), Math.floor(size), Math.floor(size));
            BT.drawRect(this.tempRect, C_TUNNEL_BASE + i);
        }
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
