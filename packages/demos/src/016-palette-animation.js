// Demo 016 - Palette Animation: change palette entries every tick for instant visual effects.
//
// Demo 016 in the Blit-Tech series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics     https://blit-tech-demos.vancura.dev/001-basics
//   002-Primitives https://vancura.dev/articles/blit-tech-primitives
//   003-Colors     https://vancura.dev/articles/blit-tech-colors
//   015-Palette Presets https://vancura.dev/articles/blit-tech-palette-presets
//
// Live article: https://vancura.dev/articles/blit-tech-palette-animation
//
// WHAT IS PALETTE ANIMATION?
//
// Old game hardware (Super Nintendo, Sega Genesis, Commodore 64) had strict rules:
// each pixel only stored a small number - a "palette index" pointing to one color slot.
// To animate colors, programmers changed what color was IN the slot, not what was on screen.
//
// Imagine 16 buckets of paint, each numbered. A painting only records the bucket number
// for every spot, not the actual color. To change the sky from blue to red, you just
// repaint bucket 5. Every sky-colored spot changes instantly - without touching the painting!
//
// That trick is called "palette animation". Modern engines don't need it, but it's a
// beautiful technique to understand, and Blit-Tech lets you do it the same way.
//
// THE KEY RULE:
//   render() writes palette indices (numbers) - never Color32 objects.
//   update() computes new Color32 values and stores them in palette slots.
//
// WHAT YOU WILL SEE (four panels):
//   1. Scrolling gradient bar  - 32 color slots hold a rainbow; the base hue rotates.
//   2. Fire column             - colors stack up from black to red to yellow to white.
//   3. Flashing health bar     - one slot alternates red / white every 8 ticks.
//   4. Cycling water strip     - three blue-green slots ripple in sequence.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Gradient bar
// How many color slots the scrolling gradient uses.
// More slots = smoother rainbow; fewer slots = more "chunky".
const GRAD_SLOTS = 32;

// Width of each gradient swatch rectangle in pixels.
const GRAD_SWATCH_W = Math.floor(320 / GRAD_SLOTS); // ~10 px each

// Fire column
// How many color slots make up the fire gradient.
// The bottom of the fire is dark/black; the top is bright yellow-white.
const FIRE_SLOTS = 20;

// Height of each fire "band" rectangle in pixels.
const FIRE_BAND_H = 4;

// Width of the fire column in pixels.
const FIRE_COL_W = 60;

// Water strip
// Three slots cycle in sequence to create a ripple shimmer.
const WATER_SLOTS = 3;

// Health bar
// The health bar flashes every N ticks (8 ticks = about 0.13 seconds at 60 FPS).
const FLASH_PERIOD = 8;

// How low "health" must fall before the bar starts flashing.
// (Simulated health: counts down from HEALTH_MAX to 0, then loops.)
const HEALTH_LOW = 30;
const HEALTH_MAX = 100;

// How many ticks for one full health drain cycle.
const HEALTH_DRAIN_TICKS = 360; // ~6 seconds to drain completely.

// Palette slot constants - we group our palette like compartments in a paint box.
// Each section owns a range of slots that it fills in update() every tick.

// Slot 0:   always transparent - reserved by the engine.
const C_WHITE = 1; // Font base color.
const C_BG = 2; // Screen background.
const C_PANEL = 3; // Panel background (slightly lighter than screen).
const C_LABEL = 4; // Section heading text.
const C_DIM = 5; // Dimmer subtitle / tip text.
const C_FPS = 6; // Tiny FPS counter in the corner.

// Gradient section: 32 slots, one per swatch column.
// We update all 32 every tick to scroll the hue.
const C_GRAD_BASE = 10; // Slots 10..41.

// Fire section: 20 slots, one per horizontal band.
// Slot 10+GRAD_SLOTS = 42 might overlap, so we start fire at 50.
const C_FIRE_BASE = 50; // Slots 50..69.

// Health bar: one slot. We toggle it between red and white.
const C_HEALTH_BAR = 80; // Slot 80.

// Water strip: three slots that cycle.
const C_WATER_BASE = 90; // Slots 90..92.

// #endregion

// #region Main Logic

/**
 * Demonstrates the "palette animation" technique: change palette entries every tick
 * to create scrolling gradients, fire, flashing effects, and rippling water
 * all without touching the geometry drawn in render().
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The single palette used for all drawing.
    palette = null;

    // Counts up by 1/60 every frame (in seconds).
    // Used to drive continuous animation in update().
    animTime = 0;

    // Simulated health value (0..100), drained over time.
    health = HEALTH_MAX;

    // Which water slot is currently "brightest" (0, 1, or 2).
    waterPhase = 0;

    // How many ticks since the water last advanced one step.
    waterTick = 0;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Palette slots for the engine overlay bars.
     *
     * The live palette grid at the bottom highlights slots used by this frame's
     * swatches and live-view preset. Sixteen swatches per row, two visible rows;
     * scroll to browse the full palette while presets auto-cycle.
     *
     * @returns {{ overlayPaletteView: boolean, overlayPaletteColumns: number, overlayPaletteRowsVisible: number, overlayStyle: { barPaletteIndex: number, textPaletteIndex: number } }}
     */
    configure() {
        return {
            displaySize: new Vector2i(520, 390),
            maxCanvasSize: new Vector2i(520 * 2, 390 * 2),
            overlayPaletteView: true,
            overlayPaletteColumns: 64,
            overlayStyle: {
                barPaletteIndex: 2,
                textPaletteIndex: 4,
                gapPaletteIndex: 80,
            },
            overlayTimingChart: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: 4,
                renderBarPaletteIndex: 5,
                warningPaletteIndex: 5,
                errorPaletteIndex: 3,
                eventPaletteIndex: 4,
            },
        };
    }

    /**
     * Builds the palette with all static slots and zeroed dynamic slots, then loads the font.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        console.log('[PaletteAnimationDemo] Initializing...');

        // Build the main palette
        // Think of this like setting up your paint box before you start painting.
        // Static entries (labels, background) go in now and never change.
        // Dynamic entries (gradient, fire, health, water) start as black and get
        // overwritten in update() every tick.
        this.palette = BT.paletteCreate(256);

        // Static UI colors.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // Pure white for font.
        this.palette.set(C_BG, new Color32(10, 12, 20)); // Very dark navy background.
        this.palette.set(C_PANEL, new Color32(20, 24, 36)); // Slightly lighter for panel backgrounds.
        this.palette.set(C_LABEL, new Color32(255, 210, 80)); // Golden yellow for section headings.
        this.palette.set(C_DIM, new Color32(120, 130, 160)); // Cool gray-blue for subtitles.
        this.palette.set(C_FPS, new Color32(70, 70, 90)); // Very dim for the FPS counter.

        // Initialize all dynamic slots to black (invisible for now).
        // They will be filled with real colors on the very first update() call.
        for (let i = 0; i < GRAD_SLOTS; i++) {
            this.palette.set(C_GRAD_BASE + i, new Color32(0, 0, 0));
        }
        for (let i = 0; i < FIRE_SLOTS; i++) {
            this.palette.set(C_FIRE_BASE + i, new Color32(0, 0, 0));
        }
        this.palette.set(C_HEALTH_BAR, new Color32(220, 40, 40));

        for (let i = 0; i < WATER_SLOTS; i++) {
            this.palette.set(C_WATER_BASE + i, new Color32(0, 80, 160));
        }

        // Activate palette
        // Tell the engine to use our palette from this point forward.
        BT.paletteSet(this.palette);

        // Run one update cycle so all dynamic slots have real colors before the first render.
        // Pass false so animTime is not incremented during this priming call.
        this.update(false);

        console.log('[PaletteAnimationDemo] Initialized');
        return true;
    }

    /**
     * Called 60 times per second. Computes new Color32 values for every dynamic slot.
     * render() will never see Color32 - it only reads slot indices we set here.
     */
    update(advanceTime = true) {
        // Advance the clock. animTime grows by 1/60 each frame.
        // Skipped when advanceTime is false (used during init() priming call).
        if (advanceTime) {
            this.animTime += BT.deltaSeconds;
        }

        // Advance health drain.
        // We simulate a health bar that empties over HEALTH_DRAIN_TICKS ticks,
        // then resets to full so the demo loops forever.
        const tick = BT.ticks;
        this.health = HEALTH_MAX - Math.floor((tick % HEALTH_DRAIN_TICKS) * (HEALTH_MAX / HEALTH_DRAIN_TICKS));

        // Panel 1: Scrolling gradient
        // We rotate a base hue forward every frame so the gradient appears to scroll.
        // animTime * 60 gives us degrees per second (one full rotation per ~6 seconds).
        this.updateGradient();

        // Panel 2: Fire column
        // Each slot maps to a position along the fire column.
        // Lower slots = closer to the bottom = darker/cooler colors.
        this.updateFire();

        // Panel 3: Flashing health bar
        // The slot alternates between red and white based on the tick count.
        this.updateHealthBar(tick);

        // Panel 4: Cycling water
        // Three slots take turns being the bright highlight.
        this.updateWater(tick);
    }

    /**
     * Draws all four panels. Only palette indices appear here - no Color32 objects.
     */
    render() {
        // Clear the screen with the dark background.
        BT.clear(C_BG);

        // Draw each of the four panels.
        this.renderGradientPanel();
        this.renderFirePanel();
        this.renderHealthPanel();
        this.renderWaterPanel();
    }

    // #endregion

    // #region Update Helpers

    /**
     * Scrolling gradient: rotates 32 hue slots so the rainbow appears to slide across.
     * The "base hue" advances each frame; each slot gets a hue slightly ahead of the previous.
     */
    updateGradient() {
        // Base hue grows over time. Math.floor() converts to a whole number of degrees.
        // % 360 keeps hue in the 0..359 range (a full color wheel).
        const baseHue = Math.floor(this.animTime * 60) % 360;

        for (let i = 0; i < GRAD_SLOTS; i++) {
            // Each slot is spread evenly around the color wheel.
            // (i / GRAD_SLOTS) * 360 spaces 32 hues evenly over 360 degrees.
            const hue = (baseHue + (i / GRAD_SLOTS) * 360) % 360;

            // Color32.fromHSL(hue, saturation, lightness):
            //   hue        0..360  = position on the color wheel (0=red, 120=green, 240=blue)
            //   saturation 0..100  = how vivid the color is (0=gray, 100=pure rainbow)
            //   lightness  0..100  = how bright (0=black, 50=pure color, 100=white)
            this.palette.set(C_GRAD_BASE + i, Color32.fromHSL(hue, 90, 55));
        }
    }

    /**
     * Fire column: each slot represents a horizontal band of flame.
     * The bottom is black/dark red; moving up transitions through orange to bright yellow-white.
     * We shift the transition point over time so the flame flickers.
     */
    updateFire() {
        for (let i = 0; i < FIRE_SLOTS; i++) {
            // t is 0 at the bottom slot, 1 at the top slot.
            const t = i / (FIRE_SLOTS - 1);

            // Add a gentle flicker by modulating the transition with a sine wave.
            // Math.sin() returns -1..1; we scale and shift it to 0..0.15 for a subtle wobble.
            const flicker = (Math.sin(this.animTime * 7 + i * 0.8) + 1) * 0.075;

            // Apply flicker to t, clamped between 0 and 1.
            const ft = Math.min(1, Math.max(0, t + flicker));

            // Map ft (0..1) to a fire color.
            // We blend through a four-color gradient:
            //   0.0 = black        (cold, no flame)
            //   0.3 = dark red     (embers just starting)
            //   0.6 = bright orange (active flame)
            //   1.0 = pale yellow  (hottest, near the tip)
            let color;

            if (ft < 0.3) {
                // Black to dark red.
                const s = ft / 0.3; // Rescales 0..0.3 to 0..1.
                color = new Color32(Math.floor(s * 160), 0, 0);
            } else if (ft < 0.6) {
                // Dark red to bright orange.
                const s = (ft - 0.3) / 0.3;
                color = new Color32(160 + Math.floor(s * 95), Math.floor(s * 100), 0);
            } else {
                // Orange to pale yellow-white.
                const s = (ft - 0.6) / 0.4;
                color = new Color32(255, 100 + Math.floor(s * 155), Math.floor(s * 120));
            }

            this.palette.set(C_FIRE_BASE + i, color);
        }
    }

    /**
     * Health bar: toggles one slot between red and near-white every FLASH_PERIOD ticks.
     * Only flashes when health is critically low.
     *
     * @param {number} tick - Current tick count from BT.ticks.
     */
    updateHealthBar(tick) {
        if (this.health <= HEALTH_LOW) {
            // Flash! % is the remainder operator: tick % FLASH_PERIOD gives 0..(FLASH_PERIOD-1).
            // Math.floor(tick / FLASH_PERIOD) % 2 alternates between 0 and 1 every FLASH_PERIOD ticks.
            const flashOn = Math.floor(tick / FLASH_PERIOD) % 2 === 0;
            this.palette.set(C_HEALTH_BAR, flashOn ? new Color32(255, 50, 50) : new Color32(255, 255, 255));
        } else {
            // Healthy: steady red.
            this.palette.set(C_HEALTH_BAR, new Color32(200, 40, 40));
        }
    }

    /**
     * Water strip: three slots take turns being the brightest highlight.
     * Each slot cycles: bright -> medium -> dim -> bright -> ...
     * The phases are offset by one slot so the bright spot appears to travel.
     *
     * @param {number} tick - Current tick count from BT.ticks.
     */
    updateWater(tick) {
        // Advance the ripple every 8 ticks (about 7 ripples per second).
        if (tick - this.waterTick >= 8) {
            this.waterPhase = (this.waterPhase + 1) % WATER_SLOTS;
            this.waterTick = tick;
        }

        for (let i = 0; i < WATER_SLOTS; i++) {
            // The ripple highlights one slot at a time.
            // phase distance: how far is slot i from the current bright spot?
            const dist = (i - this.waterPhase + WATER_SLOTS) % WATER_SLOTS;

            // dist == 0 → brightest, dist == 1 → medium, dist == 2 → darkest
            let color;

            if (dist === 0) {
                // Bright highlight - the "wave crest".
                color = new Color32(80, 200, 255);
            } else if (dist === 1) {
                // Medium shade - just before or after the crest.
                color = new Color32(30, 100, 200);
            } else {
                // Dark trough - between ripples.
                color = new Color32(10, 40, 120);
            }

            this.palette.set(C_WATER_BASE + i, color);
        }
    }

    // #endregion

    // #region Render Helpers

    /**
     * Panel 1: Scrolling gradient bar.
     * 32 thin rectangles in a row; each uses a different palette slot.
     * Because update() rotates the hues in those slots, the bar appears to scroll.
     */
    renderGradientPanel() {
        const panelY = 18;

        // Panel background.
        BT.drawRectFill(new Rect2i(0, panelY, 320, 46), C_PANEL);

        // Section heading. systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(new Vector2i(6, panelY + 2), C_LABEL, 'Scrolling Gradient');
        BT.systemPrint(new Vector2i(6, panelY + 14), C_DIM, 'Hues rotate in update() each tick');

        // Draw one rectangle per gradient slot, side by side across the full screen width.
        for (let i = 0; i < GRAD_SLOTS; i++) {
            // Each swatch is GRAD_SWATCH_W pixels wide and 14 pixels tall.
            const x = i * GRAD_SWATCH_W;
            BT.drawRectFill(new Rect2i(x, panelY + 28, GRAD_SWATCH_W, 14), C_GRAD_BASE + i);
        }
    }

    /**
     * Panel 2: Fire column.
     * FIRE_SLOTS horizontal bands stacked vertically; the colors change in update() to flicker.
     */
    renderFirePanel() {
        const panelY = 70;

        // Panel background.
        BT.drawRectFill(new Rect2i(0, panelY, 320, 70), C_PANEL);

        // Section heading.
        BT.systemPrint(new Vector2i(6, panelY + 2), C_LABEL, 'Fire Column');
        BT.systemPrint(new Vector2i(6, panelY + 14), C_DIM, 'Color stack shifts upward in update()');

        // Fire bands, from bottom (slot 0 = darkest) to top (slot FIRE_SLOTS-1 = brightest).
        // We draw them from bottom up so slot 0 is at the base of the column.
        const colX = 6;
        const colBottom = panelY + 66;

        for (let i = 0; i < FIRE_SLOTS; i++) {
            // i=0 → bottom of column, i=FIRE_SLOTS-1 → top.
            // Each band is FIRE_BAND_H pixels tall.
            const y = colBottom - (i + 1) * FIRE_BAND_H;
            BT.drawRectFill(new Rect2i(colX, y, FIRE_COL_W, FIRE_BAND_H), C_FIRE_BASE + i);
        }

        // Explanatory note beside the column.
        BT.systemPrint(new Vector2i(colX + FIRE_COL_W + 6, panelY + 28), C_DIM, 'slot 0 = black');
        BT.systemPrint(new Vector2i(colX + FIRE_COL_W + 6, panelY + 40), C_DIM, '...  = red');
        BT.systemPrint(new Vector2i(colX + FIRE_COL_W + 6, panelY + 52), C_DIM, 'slot 19 = white');
    }

    /**
     * Panel 3: Flashing health bar.
     * One palette slot toggles between red and white when health is critically low.
     */
    renderHealthPanel() {
        const panelY = 146;

        // Panel background.
        BT.drawRectFill(new Rect2i(0, panelY, 320, 44), C_PANEL);

        // Section heading.
        BT.systemPrint(new Vector2i(6, panelY + 2), C_LABEL, 'Flashing Health Bar');

        // Compute the width of the filled portion from the current health value.
        // health / HEALTH_MAX is a fraction from 0 to 1; multiply by max bar width (200 px).
        const barMaxW = 200;
        const barW = Math.max(1, Math.floor((this.health / HEALTH_MAX) * barMaxW));

        // Background trough (dark, always full width).
        BT.drawRectFill(new Rect2i(6, panelY + 14, barMaxW, 12), C_BG);
        BT.drawRect(new Rect2i(6, panelY + 14, barMaxW, 12), C_DIM);

        // Filled bar - uses C_HEALTH_BAR, which flashes in update() when health is low.
        BT.drawRectFill(new Rect2i(6, panelY + 14, barW, 12), C_HEALTH_BAR);

        // Health value as text.
        BT.systemPrint(new Vector2i(212, panelY + 14), C_LABEL, `HP: ${this.health}`);

        // Tip: flashes when low.
        if (this.health <= HEALTH_LOW) {
            BT.systemPrint(new Vector2i(6, panelY + 30), C_DIM, 'CRITICAL! slot 80 flashes red/white');
        } else {
            BT.systemPrint(new Vector2i(6, panelY + 30), C_DIM, 'Healthy: slot 80 = steady red');
        }
    }

    /**
     * Panel 4: Cycling water strip.
     * Three adjacent rectangles each use one of the three water palette slots.
     * The brightness cycles across them to look like a ripple.
     */
    renderWaterPanel() {
        const panelY = 196;

        // Panel background.
        BT.drawRectFill(new Rect2i(0, panelY, 320, 44), C_PANEL);

        // Section heading.
        BT.systemPrint(new Vector2i(6, panelY + 2), C_LABEL, 'Cycling Water Strip');
        BT.systemPrint(new Vector2i(6, panelY + 14), C_DIM, '3 slots ripple in sequence');

        // Draw 15 water tiles (5 repetitions of the 3-slot cycle) to make a wide strip.
        const tileW = 18;
        const tileH = 14;
        const totalTiles = 15;

        for (let i = 0; i < totalTiles; i++) {
            // Map tile index to one of the 3 water slots using remainder (%).
            const slot = C_WATER_BASE + (i % WATER_SLOTS);
            BT.drawRectFill(new Rect2i(6 + i * tileW, panelY + 26, tileW - 1, tileH), slot);
        }

        // Label to the right.
        BT.systemPrint(new Vector2i(6 + totalTiles * tileW + 4, panelY + 28), C_DIM, 'slots 90..92');
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
