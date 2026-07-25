// Demo 016 - Palette Animation: change palette entries every tick for instant visual effects.
//
// Demo 016 in the BLIT386 series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics          https://demos.blit386.dev/001-basics
//   002-Primitives      https://demos.blit386.dev/002-primitives
//   003-Colors          https://demos.blit386.dev/003-colors
//   015-Palette Presets https://demos.blit386.dev/015-palette-presets
//     (walkthrough: https://vancura.dev/articles/blit386-palette-presets)
//
// Live version: https://demos.blit386.dev/016-palette-animation
// Live article: https://vancura.dev/articles/blit386-palette-animation
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
// beautiful technique to understand, and BLIT386 lets you do it the same way.
//
// THE KEY RULE:
//   render() writes palette indices (numbers) - never Color32 objects.
//   update() computes new Color32 values and stores them in palette slots.
//
// The section headings and panels are drawn with the shared UI kit (src/shared/ui.js);
// its theme colors live in high palette slots (240 and up), far away from every slot
// this demo animates.
//
// WHAT YOU WILL SEE (four panels):
//   1. Scrolling gradient bar  - 32 color slots hold a rainbow; the base hue rotates.
//   2. Fire column             - colors stack up from black to red to yellow to white.
//   3. Flashing health bar     - one slot alternates red / white every 8 ticks.
//   4. Cycling water strip     - three blue-green slots ripple in sequence.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Gradient bar
// How many color slots the scrolling gradient uses.
// More slots = smoother rainbow; fewer slots = more "chunky".
const GRAD_SLOTS = 32;

// Width of each gradient swatch rectangle in pixels. The swatches sit inside a UI kit
// panel, so they share the panel's 308-pixel content width (320 minus the borders).
const GRAD_SWATCH_W = Math.floor(308 / GRAD_SLOTS); // ~9 px each

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
// Each animated section owns a range of slots that it fills in update() every tick.
// The shared UI kit adds its own 12 theme colors in slots 240..251 (see init()),
// safely above everything listed here.

// Slot 0:   always transparent - reserved by the engine.

// Engine overlay style slots. configure() runs BEFORE init() installs the shared UI
// theme, so the overlay style cannot use theme slots - instead it points at these four
// low slots, which init() fills by hand with fixed colors.
const C_OVERLAY_BAR = 2; // Overlay bar background (very dark navy).
const C_OVERLAY_ERR = 3; // Timing chart error bars (dark blue).
const C_OVERLAY_TEXT = 4; // Overlay text and chart update bars (golden yellow).
const C_OVERLAY_DIM = 5; // Chart render/warning bars (cool gray-blue).

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

/**
 * Demonstrates the "palette animation" technique: change palette entries every tick
 * to create scrolling gradients, fire, flashing effects, and rippling water
 * all without touching the geometry drawn in render().
 *
 * @implements {IBTDemo}
 */
class Demo {
    // The single palette used for all drawing.
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map for the shared UI kit theme, filled in init() by applyTheme().
    // theme.bg, theme.border, theme.header, ... are palette indices ready for BT calls.
    theme = null;

    // Counts up by 1/60 every frame (in seconds).
    // Used to drive continuous animation in update().
    animTime = 0;

    // Simulated health value (0..100), drained over time.
    health = HEALTH_MAX;

    // Which water slot is currently "brightest" (0, 1, or 2).
    waterPhase = 0;

    // How many ticks since the water last advanced one step.
    waterTick = 0;

    /**
     * Wider canvas, overlay palette grid (64 columns), and overlay style colors from
     * the dedicated low slots (plus the animated health slot as a playful gap color).
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(520, 390),
            maxCanvasSize: new Vector2i(520 * 2, 390 * 2),
            isOverlayPaletteEnabled: true,
            overlayPaletteColumns: 64,
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_OVERLAY_TEXT,
                // The gap reuses the animated health slot, so it flashes with the demo.
                gapPaletteIndex: C_HEALTH_BAR,
            },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_OVERLAY_TEXT,
                renderBarPaletteIndex: C_OVERLAY_DIM,
                warningPaletteIndex: C_OVERLAY_DIM,
                errorPaletteIndex: C_OVERLAY_ERR,
                tagPaletteIndex: C_OVERLAY_TEXT,
            },
        };
    }

    /**
     * Builds the palette with overlay slots, zeroed dynamic slots, and the shared UI
     * theme, then primes one update() so every animated slot has real colors before
     * the first render().
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        console.log('[PaletteAnimationDemo] Initializing...');

        // Build the main palette
        // Think of this like setting up your paint box before you start painting.
        // Static entries (overlay colors, UI theme) go in now and never change.
        // Dynamic entries (gradient, fire, health, water) start as black and get
        // overwritten in update() every tick.
        this.palette = BT.paletteCreate(256);

        // Colors for the engine overlay (the stats HUD). These match the shared UI
        // theme's look but live in low slots so configure() could reference them.
        this.palette.set(C_OVERLAY_BAR, new Color32(10, 12, 20)); // Very dark navy.
        this.palette.set(C_OVERLAY_ERR, new Color32(20, 24, 36)); // Dark blue.
        this.palette.set(C_OVERLAY_TEXT, new Color32(255, 210, 80)); // Golden yellow.
        this.palette.set(C_OVERLAY_DIM, new Color32(120, 130, 160)); // Cool gray-blue.

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

        // Install the shared UI kit colors (panel fills, borders, headings, dim text).
        // applyTheme() writes 12 colors into slots 240..251 - far above every range this
        // demo animates (gradient 10..41, fire 50..69, health 80, water 90..92), so the
        // palette animation can never overwrite the UI theme. The returned map remembers
        // where each color landed (this.theme.bg, this.theme.header, ...).
        this.theme = applyTheme(this.palette);

        // Activate palette
        // Tell the engine to use our palette from this point forward.
        BT.paletteSet(this.palette);

        // Run one update cycle so all dynamic slots have real colors before the first render.
        // update() takes no arguments - this priming call still advances animTime by one tick,
        // same as every regular call from the engine's game loop.
        this.update();

        console.log('[PaletteAnimationDemo] Initialized');
        return true;
    }

    /**
     * Called 60 times per second. Computes new Color32 values for every dynamic slot.
     * render() will never see Color32 - it only reads slot indices we set here.
     */
    update() {
        // Advance the clock. animTime grows by 1/60 each frame.
        this.animTime += BT.deltaSeconds;

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
        // Clear the screen with the UI theme's dark background.
        BT.clear(this.theme.bg);

        // Draw each of the four panels.
        this.renderGradientPanel();
        this.renderFirePanel();
        this.renderHealthPanel();
        this.renderWaterPanel();
    }

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

            this.palette.set(C_FIRE_BASE + i, this.fireColor(ft));
        }
    }

    /**
     * Maps one band position ft (0..1) to a fire color.
     * We blend through a four-color gradient:
     *   0.0 = black        (cold, no flame)
     *   0.3 = dark red     (embers just starting)
     *   0.6 = bright orange (active flame)
     *   1.0 = pale yellow  (hottest, near the tip)
     *
     * @param {number} ft - Position along the flame, 0 at the bottom, 1 at the top.
     * @returns {Color32} The blended color for that position.
     */
    fireColor(ft) {
        if (ft < 0.3) {
            // Black to dark red.
            const s = ft / 0.3; // Rescales 0..0.3 to 0..1.
            return new Color32(Math.floor(s * 160), 0, 0);
        }

        if (ft < 0.6) {
            // Dark red to bright orange.
            const s = (ft - 0.3) / 0.3;
            return new Color32(160 + Math.floor(s * 95), Math.floor(s * 100), 0);
        }

        // Orange to pale yellow-white.
        const s = (ft - 0.6) / 0.4;
        return new Color32(255, 100 + Math.floor(s * 155), Math.floor(s * 120));
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

            // dist == 0 -> brightest, dist == 1 -> medium, dist == 2 -> darkest
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

    /**
     * Panel 1: Scrolling gradient bar.
     * A UI kit panel holds the heading; 32 thin rectangles sit inside it, each using a
     * different palette slot. Because update() rotates the hues in those slots, the bar
     * appears to scroll.
     */
    renderGradientPanel() {
        const bandY = 6;

        // The heading and subtitle live in a kit panel pinned to the band position.
        // ui.end() draws the panel right away, so the swatches drawn after it land ON TOP
        // of the panel background. ui.spacer() reserves empty rows for that artwork.
        ui.begin('topLeft', { x: 0, y: bandY, width: 320 });
        ui.panel('Scrolling Gradient');
        ui.label('Hues rotate in update() each tick', { color: 'dim' });
        ui.spacer(18);
        ui.end();

        // Draw one rectangle per gradient slot, side by side inside the panel.
        for (let i = 0; i < GRAD_SLOTS; i++) {
            // Each swatch is GRAD_SWATCH_W pixels wide and 14 pixels tall, starting
            // 6 pixels in so the strip clears the panel border.
            const x = 6 + i * GRAD_SWATCH_W;
            BT.drawRectFill(new Rect2i(x, bandY + 38, GRAD_SWATCH_W, 14), C_GRAD_BASE + i);
        }
    }

    /**
     * Panel 2: Fire column.
     * FIRE_SLOTS horizontal bands stacked vertically; the colors change in update() to flicker.
     */
    renderFirePanel() {
        const bandY = 70;

        // Kit panel with the heading; the spacer reserves room for the 80-pixel column.
        ui.begin('topLeft', { x: 0, y: bandY, width: 320 });
        ui.panel('Fire Column');
        ui.label('Color stack shifts upward in update()', { color: 'dim' });
        ui.spacer(86);
        ui.end();

        // Fire bands, from bottom (slot 0 = darkest) to top (slot FIRE_SLOTS-1 = brightest).
        // We draw them from bottom up so slot 0 is at the base of the column.
        const colX = 6;
        const colBottom = bandY + 118;

        for (let i = 0; i < FIRE_SLOTS; i++) {
            // i=0 -> bottom of column, i=FIRE_SLOTS-1 -> top.
            // Each band is FIRE_BAND_H pixels tall.
            const y = colBottom - (i + 1) * FIRE_BAND_H;
            BT.drawRectFill(new Rect2i(colX, y, FIRE_COL_W, FIRE_BAND_H), C_FIRE_BASE + i);
        }

        // Explanatory notes beside the column, lined up with the parts they describe:
        // the brightest band is at the top of the column, the darkest at the bottom.
        // "Band" here means the position in the fire stack (0..19), not the palette
        // slot number - the actual slots are C_FIRE_BASE + band, i.e. 50..69.
        const noteX = colX + FIRE_COL_W + 6;
        BT.systemPrint(new Vector2i(noteX, bandY + 44), this.theme.dim, 'band 19 = white');
        BT.systemPrint(new Vector2i(noteX, bandY + 74), this.theme.dim, '...     = red');
        BT.systemPrint(new Vector2i(noteX, bandY + 104), this.theme.dim, 'band 0  = black');
    }

    /**
     * Panel 3: Flashing health bar.
     * One palette slot toggles between red and white when health is critically low.
     */
    renderHealthPanel() {
        const bandY = 202;

        // Kit panel: heading, a spacer for the bar artwork, then the live status line.
        // The status text turns warm orange when health is critical, dim gray otherwise.
        const isCritical = this.health <= HEALTH_LOW;

        ui.begin('topLeft', { x: 0, y: bandY, width: 320 });
        ui.panel('Flashing Health Bar');
        ui.spacer(18);
        ui.label(isCritical ? 'CRITICAL! slot 80 flashes red/white' : 'Healthy: slot 80 = steady red', {
            color: isCritical ? 'warm' : 'dim',
        });
        ui.end();

        // Compute the width of the filled portion from the current health value.
        // health / HEALTH_MAX is a fraction from 0 to 1; multiply by max bar width (200 px).
        const barMaxW = 200;
        const barW = Math.max(1, Math.floor((this.health / HEALTH_MAX) * barMaxW));

        // Background trough (dark, always full width) with a theme-colored outline.
        BT.drawRectFill(new Rect2i(6, bandY + 22, barMaxW, 12), this.theme.bg);
        BT.drawRect(new Rect2i(6, bandY + 22, barMaxW, 12), this.theme.border);

        // Filled bar - uses C_HEALTH_BAR, which flashes in update() when health is low.
        BT.drawRectFill(new Rect2i(6, bandY + 22, barW, 12), C_HEALTH_BAR);

        // Health value as text, in the theme's amber heading color.
        BT.systemPrint(new Vector2i(212, bandY + 21), this.theme.header, `HP: ${this.health}`);
    }

    /**
     * Panel 4: Cycling water strip.
     * Three adjacent rectangles each use one of the three water palette slots.
     * The brightness cycles across them to look like a ripple.
     */
    renderWaterPanel() {
        const bandY = 266;

        // Kit panel with the heading; the spacer reserves room for the tile strip.
        ui.begin('topLeft', { x: 0, y: bandY, width: 320 });
        ui.panel('Cycling Water Strip');
        ui.label('3 slots (90..92) ripple in sequence', { color: 'dim' });
        ui.spacer(18);
        ui.end();

        // Draw 15 water tiles (5 repetitions of the 3-slot cycle) to make a wide strip.
        const tileW = 18;
        const tileH = 14;
        const totalTiles = 15;

        for (let i = 0; i < totalTiles; i++) {
            // Map tile index to one of the 3 water slots using remainder (%).
            const slot = C_WATER_BASE + (i % WATER_SLOTS);
            BT.drawRectFill(new Rect2i(6 + i * tileW, bandY + 38, tileW - 1, tileH), slot);
        }
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
