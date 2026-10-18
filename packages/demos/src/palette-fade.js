/*

Palette Fade: smooth color transitions and flash effects.
@description Smooth color transitions and flash effects: fade a palette toward a target color and snap it back.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Palette Animation: https://demos.blit386.dev/palette-animation

Live version: https://demos.blit386.dev/palette-fade

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#runtime-palette-effects
  - Overlay: https://blit386.dev/docs/guides/overlay#custom-rows

Reference:
  - Palette: https://blit386.dev/docs/api/palette#palette-effects
  - Easing: https://blit386.dev/docs/api/easing#curves
  - Overlay: https://blit386.dev/docs/api/overlay#event-tags

---

WHAT YOU WILL SEE
-----------------

A pixel-art landscape: two bands of sky, three clouds, three mountains with lighter tops,
a square sun, two bands of ground, four trees, and a scatter of two-color flowers. Nothing
in the picture moves. Instead the whole scene changes color as the demo loops through six
phases:

  1. Day - hold for 3 seconds.
  2. Fade to night - 2 seconds, ease-in-out.
  3. Night - hold for 3 seconds.
  4. Lightning flash - every color turns white for 200 ms, then snaps back.
  5. Night again - hold for 2 seconds.
  6. Dawn - 2 seconds fading back to day, ease-out.

Then it starts over. A small UI kit panel in the top-left corner names the current phase.
The same label also appears as a custom row in the engine overlay, and each fade or flash
drops a tag on the overlay's timing chart.

WHAT YOU WILL LEARN
-------------------

- BT.paletteFade(target, durationMs, easing) blends the active palette toward a target
  palette over time.
- BT.paletteFlash(color, durationMs) flashes one color and then restores the palette.
- Easing names: 'ease-in-out' for the dusk fade, 'ease-out' for the dawn fade.
- Palette effects run inside the engine once per tick, right after update(). render()
  keeps drawing with the same palette indices and never passes new colors.
- Building a scene from a fixed set of palette slots, with separate day and night Palette
  objects as fade targets.
- A tick-driven state machine: BT.ticks, a phase table, and a once-per-phase trigger flag.
- A custom overlay row via overlayRows() and timing-chart tags via BT.assignTag().

WHAT IS A PALETTE FADE?
-----------------------

Imagine two sets of paint buckets: one for a sunny day, one for a dark night. A palette
fade gradually mixes the day paints with the night paints over a few seconds, so the whole
picture slides from bright to dark - like watching a sunset.

BT.paletteFade(target, durationMs, easing) does this. You give it the destination palette,
how long the change should take, and optionally a curve that shapes the speed: 'ease-in'
starts slow, 'ease-out' starts fast, 'ease-in-out' is gentle at both ends, and the default
'linear' moves at one steady pace. Slot 0 stays transparent; every other slot blends.

WHAT IS A PALETTE FLASH?
------------------------

A flash paints every slot except slot 0 one single color (white here, for lightning) for a
short moment, then puts the original colors back. BT.paletteFlash(color, durationMs) does
this in one call - it snapshots the palette first, so the restore is exact.

UPDATE VS RENDER
----------------

  - init() builds separate day and night Palette objects, fills a third one with the day
    colors, and activates that third one with BT.paletteSet().
  - update() runs the day/night state machine and calls BT.paletteFade() or
    BT.paletteFlash() once at the start of a phase. The engine then blends the active
    palette over the following ticks.
  - render() draws the same landscape every frame using palette indices only. Sky, trees,
    and ground change color because the engine updated the palette, not because render()
    passes new Color32 values to draw calls.

The phase panel is drawn with the shared UI kit (src/shared/ui.js). Its theme colors live
in slots 240-251, and because BT.paletteFade() blends every slot except 0 toward the
target, init() writes the same theme colors into the day and night target palettes too.
The UI slots then "fade" from a color to the identical color, so the panel stays readable
while the scene changes around it.

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. The custom row near the bottom
  repeats the phase label, and the timing chart gets a tag each time a fade or flash
  starts.
- Watch the lightning flash closely: the whole screen, panel included, goes white for
  200 ms, because the flash covers every slot except 0.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// Phase durations in ticks. A tick is one fixed update; at 60 ticks per second, 60 ticks
// is one second.
const PHASE_DAY_HOLD = 180; // 3 seconds
const PHASE_FADE_TO_NIGHT = 120; // 2 seconds
const PHASE_NIGHT_HOLD = 180; // 3 seconds
const PHASE_FLASH = 12; // 200 ms
const PHASE_NIGHT_HOLD_2 = 120; // 2 seconds
const PHASE_FADE_TO_DAY = 120; // 2 seconds

// The day/night cycle as a lookup table: each phase holds for `duration` ticks, then
// advances to `next`. The last entry points back at the first, so the cycle never ends.
const PHASE_TRANSITIONS = {
    day: { duration: PHASE_DAY_HOLD, next: 'fade-to-night' },
    'fade-to-night': { duration: PHASE_FADE_TO_NIGHT, next: 'night' },
    night: { duration: PHASE_NIGHT_HOLD, next: 'flash' },
    flash: { duration: PHASE_FLASH, next: 'night-2' },
    'night-2': { duration: PHASE_NIGHT_HOLD_2, next: 'fade-to-day' },
    'fade-to-day': { duration: PHASE_FADE_TO_DAY, next: 'day' },
};

// Text and overlay slots. Slot 0 is the engine's transparent slot and is never written.
const C_LABEL = 3;
const C_DIM = 4;
const C_OVERLAY_BAR = 6; // overlay row background (same in day and night palettes)

// Scene slots: sky, sun, ground, tree trunk, tree leaves, flowers, clouds, mountains.
const C_SKY = 10;
const C_SKY_LIGHT = 11;
const C_SUN = 12;
const C_SUN_GLOW = 13;
const C_GROUND = 14;
const C_GROUND_DARK = 15;
const C_TRUNK = 16;
const C_LEAVES = 17;
const C_LEAVES_LIGHT = 18;
const C_FLOWER_1 = 19;
const C_FLOWER_2 = 20;
const C_CLOUD = 21;
const C_MOUNTAIN = 22;
const C_MOUNTAIN_LIGHT = 23;

// Fills a palette with the "day" colors: bright, saturated outdoor tones.
function fillDay(p) {
    p.set(C_LABEL, new Color32(255, 210, 80));
    p.set(C_DIM, new Color32(120, 130, 160));
    p.set(C_OVERLAY_BAR, new Color32(0, 0, 0, 200));

    p.set(C_SKY, new Color32(100, 170, 255));
    p.set(C_SKY_LIGHT, new Color32(150, 200, 255));
    p.set(C_SUN, new Color32(255, 240, 100));
    p.set(C_SUN_GLOW, new Color32(255, 255, 180));
    p.set(C_GROUND, new Color32(80, 160, 60));
    p.set(C_GROUND_DARK, new Color32(50, 120, 40));
    p.set(C_TRUNK, new Color32(100, 60, 30));
    p.set(C_LEAVES, new Color32(40, 140, 50));
    p.set(C_LEAVES_LIGHT, new Color32(80, 180, 70));
    p.set(C_FLOWER_1, new Color32(255, 80, 120));
    p.set(C_FLOWER_2, new Color32(255, 200, 60));
    p.set(C_CLOUD, new Color32(240, 245, 255));
    p.set(C_MOUNTAIN, new Color32(100, 110, 140));
    p.set(C_MOUNTAIN_LIGHT, new Color32(140, 150, 175));
}

// Fills a palette with the "night" colors: dark, washed-out blues and purples. The sun
// slot becomes a pale moon.
function fillNight(p) {
    p.set(C_LABEL, new Color32(180, 160, 100));
    p.set(C_DIM, new Color32(80, 80, 110));
    p.set(C_OVERLAY_BAR, new Color32(0, 0, 0, 200));

    p.set(C_SKY, new Color32(15, 20, 50));
    p.set(C_SKY_LIGHT, new Color32(25, 35, 70));
    p.set(C_SUN, new Color32(200, 200, 160));
    p.set(C_SUN_GLOW, new Color32(60, 60, 80));
    p.set(C_GROUND, new Color32(20, 50, 30));
    p.set(C_GROUND_DARK, new Color32(15, 35, 20));
    p.set(C_TRUNK, new Color32(40, 25, 15));
    p.set(C_LEAVES, new Color32(15, 50, 25));
    p.set(C_LEAVES_LIGHT, new Color32(25, 65, 35));
    p.set(C_FLOWER_1, new Color32(100, 30, 50));
    p.set(C_FLOWER_2, new Color32(100, 80, 30));
    p.set(C_CLOUD, new Color32(40, 45, 60));
    p.set(C_MOUNTAIN, new Color32(30, 35, 55));
    p.set(C_MOUNTAIN_LIGHT, new Color32(45, 50, 70));
}

// A pixel-art landscape that cycles between day and night with BT.paletteFade(), plus a
// lightning strike with BT.paletteFlash(). The picture itself is drawn the same way every
// frame; only the palette changes.
class Demo {
    // The active palette: the one the engine draws with and the one the effects modify.
    /** @type {Palette | null} */
    palette = null;

    // Fade target for dawn.
    /** @type {Palette | null} */
    day = null;

    // Fade target for dusk.
    /** @type {Palette | null} */
    night = null;

    // Palette slot map for the shared UI kit theme, filled in init() by applyTheme().
    // theme.text, theme.header, and friends are palette indices ready for BT draw calls.
    theme = null;

    // Which phase of the day/night cycle we are in - a key of PHASE_TRANSITIONS.
    phase = 'day';

    // Tick when the current phase started.
    phaseStartTick = 0;

    // Whether the fade or flash for this phase has already been fired. Each effect must
    // start exactly once per phase, and update() runs many times per phase.
    effectTriggered = false;

    // Reused every frame for the overlay row, so no new array or object is allocated.
    overlayRowData = [{ leftText: 'Day', textPaletteIndex: C_LABEL }];

    // Palette slots for the engine overlay bars and the timing chart. The chart is turned
    // on so BT.assignTag() has somewhere to put its marks.
    configure() {
        return {
            isOverlayVisibleAtStart: true,
            isOverlayPaletteEnabled: true,
            overlayPaletteRowsVisible: 1,
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_LABEL,
                gapPaletteIndex: C_OVERLAY_BAR,
            },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_LABEL,
                renderBarPaletteIndex: C_SUN,
                warningPaletteIndex: C_SUN_GLOW,
                errorPaletteIndex: C_FLOWER_2,
                tagPaletteIndex: C_DIM,
            },
        };
    }

    // Creates the day and night target palettes and activates a third palette that starts
    // out with the day colors.
    async init() {
        console.log('[PaletteFadeDemo] Initializing...');

        // Build both fade targets.
        this.day = BT.paletteCreate(256);
        fillDay(this.day);

        this.night = BT.paletteCreate(256);
        fillNight(this.night);

        // The active palette starts as a copy of the day colors.
        this.palette = BT.paletteCreate(256);
        fillDay(this.palette);

        // Install the shared UI kit colors (slots 240-251) into all three palettes. This
        // matters because BT.paletteFade() blends every slot except 0 toward the target
        // palette - if the day and night targets left those slots at their default black,
        // the first fade would fade the UI colors away for good. Writing the identical
        // theme colors into the targets turns the UI slots into fixed points: they "fade"
        // from a color to the very same color, so nothing moves. (BT.paletteFlash() still
        // whites them out for 200 ms, but it snapshots and restores every slot
        // afterwards, so the flash heals itself - just like it always did for the scene
        // colors.)
        applyTheme(this.day);
        applyTheme(this.night);
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        console.log('[PaletteFadeDemo] Initialized');

        return true;
    }

    // Runs the day/night state machine. Each phase fires its palette effect once at its
    // start, then waits for its duration to pass.
    update() {
        const tick = BT.ticks;
        const elapsed = tick - this.phaseStartTick;

        // Fire the effect for this phase (only once).
        this.triggerPhaseEffect();

        // Move on to the next phase once this one has run its course.
        this.advancePhaseIfExpired(elapsed, tick);
    }

    // Draws the pixel-art landscape. The geometry never changes; only the palette colors
    // shift, driven by the fade and flash effects started in update().
    render() {
        // Sky color as the background.
        BT.clear(C_SKY);

        this.renderScene();

        // A small UI kit panel names the current phase, so viewers can follow the cycle
        // without opening the engine overlay. Its colors come from the theme slots, which
        // the fade leaves alone (see init()).
        ui.begin(UI_ANCHORS.TOP_LEFT);
        ui.panel('Palette Fade & Flash');
        ui.label(this.getPhaseLabel());
        ui.end();
    }

    // Supplies one custom overlay row with the current phase label (Day, Night, Dawn...).
    // The engine calls this once per frame while the overlay is open.
    overlayRows() {
        this.overlayRowData[0].leftText = this.getPhaseLabel();

        return this.overlayRowData;
    }

    // Short label for the current phase. Falls back to the raw phase name if the table
    // has no entry for it.
    getPhaseLabel() {
        const phaseLabels = {
            day: 'Day',
            'fade-to-night': 'Fading to night... (ease-in-out)',
            night: 'Night',
            flash: 'Lightning flash!',
            'night-2': 'Night',
            'fade-to-day': 'Dawn... (ease-out)',
        };

        return phaseLabels[this.phase] ?? this.phase;
    }

    // Enters a new phase at the given tick and re-arms the effect trigger.
    startPhase(newPhase, tick) {
        this.phase = newPhase;
        this.phaseStartTick = tick;
        this.effectTriggered = false;
    }

    // Fires the palette effect for the current phase, unless it already fired. The hold
    // phases have no effect of their own; the palette simply stays where the last fade
    // left it.
    triggerPhaseEffect() {
        if (this.effectTriggered) {
            return;
        }

        if (this.phase === 'fade-to-night') {
            // Dusk: a 2-second fade from the current colors to the night palette.
            BT.paletteFade(this.night, 2000, 'ease-in-out');
            BT.assignTag('Fade to night');
            this.effectTriggered = true;
        } else if (this.phase === 'flash') {
            // Lightning: every slot except 0 goes white for 200 ms.
            BT.paletteFlash(new Color32(255, 255, 255), 200);
            BT.assignTag('Lightning flash');
            this.effectTriggered = true;
        } else if (this.phase === 'fade-to-day') {
            // Dawn: a 2-second fade back to day, with ease-out for a quick start.
            BT.paletteFade(this.day, 2000, 'ease-out');
            BT.assignTag('Fade to day');
            this.effectTriggered = true;
        }
    }

    // Checks whether the current phase has run for its full duration and, if so, moves to
    // the next one. `elapsed` is ticks since the phase started, `tick` the current tick.
    advancePhaseIfExpired(elapsed, tick) {
        const current = PHASE_TRANSITIONS[this.phase];

        if (current && elapsed >= current.duration) {
            this.startPhase(current.next, tick);
        }
    }

    // Draws the landscape back to front: sky, clouds, mountains, sun, ground, trees,
    // flowers. Every draw call uses a palette index, never a Color32.
    renderScene() {
        // Sky in two bands: a darker top and a lighter strip near the horizon.
        BT.drawRectFill(new Rect2i(0, 0, 320, 80), C_SKY);
        BT.drawRectFill(new Rect2i(0, 80, 320, 40), C_SKY_LIGHT);

        // Clouds.
        this.drawCloud(30, 20);
        this.drawCloud(180, 35);
        this.drawCloud(260, 15);

        // Mountains.
        this.drawMountain(60, 105, 80, 35);
        this.drawMountain(160, 100, 100, 40);
        this.drawMountain(250, 108, 70, 32);

        // Sun: a square with a wider, shorter glow across its middle.
        BT.drawRectFill(new Rect2i(250, 25, 20, 20), C_SUN);
        BT.drawRectFill(new Rect2i(248, 27, 24, 16), C_SUN_GLOW);

        // Ground in two bands, darker toward the bottom of the screen.
        BT.drawRectFill(new Rect2i(0, 120, 320, 120), C_GROUND);
        BT.drawRectFill(new Rect2i(0, 180, 320, 60), C_GROUND_DARK);

        // Trees.
        this.drawTree(40, 110);
        this.drawTree(100, 115);
        this.drawTree(200, 108);
        this.drawTree(270, 118);

        // Flowers.
        this.drawFlowers();
    }

    // Draws a simple cloud: a wide bar with a narrower bump on top. `x`, `y` is the
    // top-left of the wide bar.
    drawCloud(x, y) {
        BT.drawRectFill(new Rect2i(x, y, 30, 8), C_CLOUD);
        BT.drawRectFill(new Rect2i(x + 5, y - 4, 20, 6), C_CLOUD);
    }

    // Draws a triangular mountain out of stacked one-pixel-high rectangles. `x` is the
    // center, `baseY` the bottom row, `width` the base width, and `height` the number of
    // rows.
    drawMountain(x, baseY, width, height) {
        // Each row is a horizontal slice; the slices get narrower toward the top.
        for (let row = 0; row < height; row++) {
            const t = row / height; // 0 at bottom, 1 at top
            const sliceW = Math.floor(width * (1 - t * 0.8));
            const sliceX = x - Math.floor(sliceW / 2);
            const sliceY = baseY - row;

            // The top 40 percent uses the lighter slot, like a snow cap.
            const slot = t > 0.6 ? C_MOUNTAIN_LIGHT : C_MOUNTAIN;

            BT.drawRectFill(new Rect2i(sliceX, sliceY, sliceW, 1), slot);
        }
    }

    // Draws a simple tree: a trunk plus a leaf canopy. `x` is the trunk center, `groundY`
    // the row the trunk stands on.
    drawTree(x, groundY) {
        // Trunk.
        BT.drawRectFill(new Rect2i(x - 2, groundY - 20, 4, 20), C_TRUNK);

        // Leaf canopy: three stacked rectangles, the top one in the lighter slot.
        BT.drawRectFill(new Rect2i(x - 10, groundY - 35, 20, 8), C_LEAVES);
        BT.drawRectFill(new Rect2i(x - 14, groundY - 27, 28, 10), C_LEAVES);
        BT.drawRectFill(new Rect2i(x - 8, groundY - 40, 16, 8), C_LEAVES_LIGHT);
    }

    // Scatters small 2x2 flowers across the ground.
    drawFlowers() {
        // A fixed list of positions, so the flowers do not jump around between frames.
        const flowers = [
            [20, 140],
            [55, 155],
            [80, 145],
            [120, 160],
            [155, 142],
            [190, 158],
            [220, 148],
            [255, 165],
            [290, 138],
            [35, 170],
            [70, 175],
            [140, 172],
            [210, 170],
            [260, 178],
        ];

        for (let i = 0; i < flowers.length; i++) {
            const [fx, fy] = flowers[i];

            // Alternate between the two flower slots: `i % 2` is the remainder after
            // dividing by 2, so it is 0 for even positions and 1 for odd ones.
            const slot = i % 2 === 0 ? C_FLOWER_1 : C_FLOWER_2;

            // Four pixels make one 2x2 flower.
            BT.drawPixel(new Vector2i(fx, fy), slot);
            BT.drawPixel(new Vector2i(fx + 1, fy), slot);
            BT.drawPixel(new Vector2i(fx, fy + 1), slot);
            BT.drawPixel(new Vector2i(fx + 1, fy + 1), slot);
        }
    }
}

bootstrap(Demo);
