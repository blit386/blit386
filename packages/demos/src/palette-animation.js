/*

Palette Animation: change palette entries every tick for instant visual effects.
@description Change palette entries every tick to animate a whole scene at once, without redrawing any pixels.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Colors: https://demos.blit386.dev/colors

Live version: https://demos.blit386.dev/palette-animation

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#draw-using-absolute-palette-indices
  - Palette patterns: https://blit386.dev/docs/guides/palette#practical-palette-first-patterns
  - Overlay: https://blit386.dev/docs/guides/overlay#optional-bands

Reference:
  - Active palette: https://blit386.dev/docs/api/palette#active-palette
  - Overlay: https://blit386.dev/docs/api/overlay#palette-grid-sizing

---

WHAT YOU WILL SEE
-----------------

A 520 by 390 pixel screen with four kit panels: the gradient across the full width on
top, and below it the tall fire panel on the left beside the health bar and water strip
stacked on the right. Each one is animated by changing palette slot colors in update()
while render() draws the same rectangles every frame:

  1. Scrolling Gradient - 32 swatches, one per slot (10-41), holding a rainbow whose base
     hue turns 60 degrees per second, so the colors slide along the bar.
  2. Fire - an 80 by 100 pixel column of 20 bands (slots 50-69), black at the bottom
     through red and orange to pale yellow at the top, with a gentle sine-wave flicker.
     Notes beside it name the top and bottom slots.
  3. Flashing Health Bar - a 240 pixel bar filled with one slot (80). Simulated health
     drains from 100 toward 0 over 6 seconds and then starts over; at 30 or below the slot
     alternates between red and white every 8 ticks.
  4. Cycling Water Strip - 18 tiles using three slots (90-92). Every 8 ticks the bright
     highlight moves to the next slot, so a ripple seems to travel along the strip.

WHAT YOU WILL LEARN
-------------------

- The palette-animation rule: render() writes palette indices only, update() computes
  Color32 values and stores them with palette.set(slot, color).
- The engine notices a changed palette on its own - no second BT.paletteSet() is needed.
- Color32.fromHSL(hue, saturation, lightness) for walking around the color wheel.
- Math.sin() for a flicker, `%` (remainder) for wrapping counters, BT.deltaSeconds and
  BT.ticks for timing.
- Keeping animated slots clear of the slots other code owns (the UI kit theme in 240-251,
  the overlay colors in 2-5).

WHAT IS PALETTE ANIMATION?
--------------------------

Old game hardware (Super Nintendo, Sega Genesis, Commodore 64) had strict rules: each
pixel only stored a small number - a "palette index" pointing to one color slot. To
animate colors, programmers changed what color was IN the slot, not what was on screen.

Imagine 16 numbered buckets of paint. A painting only records the bucket number for every
spot, not the actual color. To change the sky from blue to red, you repaint bucket 5, and
every sky spot changes at once - without touching the painting.

That trick is called "palette animation". Modern engines do not need it, but it is a
beautiful technique to understand, and BLIT386 lets you do it the same way.

UPDATE VS RENDER
----------------

  - init() builds one palette: fixed colors for the engine overlay and the shared UI kit
    theme, placeholders for every animated slot, then BT.paletteSet(). It calls update()
    once so the first frame already has real colors.
  - update() computes new Color32 values and writes them into slots 10-41, 50-69, 80, and
    90-92 every tick.
  - render() draws the four panels with palette indices only. The picture moves because
    the colors behind the indices changed, not because render() passes new colors.

The panels are drawn with the shared UI kit (src/shared/ui.js); its theme colors live in
slots 240-251, far away from every slot this demo animates.

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. Its palette grid is turned on
  with 64 columns: watch slots 10-41 rotate, 50-69 flicker, 80 flash, and 90-92 ripple
  while slots 240-251 stay put.
- The overlay's gap color is slot 80, the health-bar slot, so the thin dividers in the
  overlay flash along with the bar when health runs low.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// Gradient bar: how many color slots the scrolling gradient uses. More slots make a
// smoother rainbow; fewer make it chunkier.
const GRAD_SLOTS = 32;

// Size of each gradient swatch in pixels: 32 swatches x 15 pixels = 480, which fits the
// 484-pixel content width of the full-width gradient panel.
const GRAD_SWATCH_W = 15;
const GRAD_SWATCH_H = 22;

// Fire column: how many color slots make up the fire gradient. The bottom of the fire is
// black; the top is pale yellow.
const FIRE_SLOTS = 20;

// Height of each fire band in pixels: 20 bands x 5 pixels make a 100-pixel column.
const FIRE_BAND_H = 5;

// Width of the fire column in pixels.
const FIRE_COL_W = 80;

// Water strip: three slots take turns being the bright highlight, which reads as a
// ripple.
const WATER_SLOTS = 3;

// Health bar: the slot flips between red and white every FLASH_PERIOD ticks. A tick is
// one fixed update; 8 ticks is about 0.13 seconds at 60 ticks per second.
const FLASH_PERIOD = 8;

// How low the simulated health must fall before the bar starts flashing. Health counts
// down from HEALTH_MAX toward 0, then starts over.
const HEALTH_LOW = 30;
const HEALTH_MAX = 100;

// How many ticks one full health drain takes.
const HEALTH_DRAIN_TICKS = 360; // 6 seconds at 60 ticks per second

// Layout of the four kit panels on the 520x390 screen, with an 8-pixel margin all round:
// the gradient across the full width on top, and below it the tall fire panel on the
// left, beside the health and water panels stacked on the right. The right stack is
// exactly as tall as the fire panel, so the bottom edges line up.
const PANEL_X = 8;
const PANEL_W = 504;
const PANEL_GAP = 8;

// A kit panel with a title starts its content 22 pixels below its top edge and ends 11
// pixels below the last row (the rim and the title strip). Text inside starts 10 pixels
// in from the panel edge, and a label row is 10 pixels tall.
const PANEL_CONTENT_TOP = 22;
const PANEL_BOTTOM = 11;
const PANEL_TEXT_INSET = 10;
const LABEL_ROW_H = 10;

// Empty bands that ui.spacer() reserves for the artwork drawn inside each panel. Artwork
// under a dim label row starts ART_GAP pixels below it, so letters that hang below the
// line (g, p, y) never touch it; the fire column gets the same gap under the title.
const ART_GAP = 5;

// Height of one water tile, needed here to size the water panel's spacer.
const WATER_TILE_H = 17;
const GRAD_SPACER = ART_GAP + GRAD_SWATCH_H + 3;
const FIRE_SPACER = 3 + FIRE_SLOTS * FIRE_BAND_H + 3;
const HEALTH_SPACER = 21;
const WATER_SPACER = ART_GAP + WATER_TILE_H + 2;

// Panel heights, from the rows each one stacks: title, an optional dim label row, the
// artwork band, and the bottom rim.
const GRAD_PANEL_H = PANEL_CONTENT_TOP + LABEL_ROW_H + GRAD_SPACER + PANEL_BOTTOM;
const FIRE_PANEL_H = PANEL_CONTENT_TOP + FIRE_SPACER + PANEL_BOTTOM;
const HEALTH_PANEL_H = PANEL_CONTENT_TOP + HEALTH_SPACER + LABEL_ROW_H + PANEL_BOTTOM;

// Vertical positions: the whole block (gradient + gap + fire panel) is centered on the
// 390-pixel screen.
const BLOCK_H = GRAD_PANEL_H + PANEL_GAP + FIRE_PANEL_H;
const GRAD_PANEL_Y = Math.floor((390 - BLOCK_H) / 2);
const LOWER_PANELS_Y = GRAD_PANEL_Y + GRAD_PANEL_H + PANEL_GAP;
const WATER_PANEL_Y = LOWER_PANELS_Y + HEALTH_PANEL_H + PANEL_GAP;

// The fire panel is 168 pixels wide; the health and water panels fill the rest of the
// row.
const FIRE_PANEL_W = 168;
const RIGHT_PANEL_X = PANEL_X + FIRE_PANEL_W + PANEL_GAP;
const RIGHT_PANEL_W = PANEL_X + PANEL_W - RIGHT_PANEL_X;

// Health bar size, and the water strip: 18 tiles (six repeats of the 3-slot cycle), each
// 16 pixels wide with a 1-pixel gap and WATER_TILE_H tall.
const HEALTH_BAR_W = 240;
const HEALTH_BAR_H = 12;
const WATER_TILES = 18;
const WATER_TILE_STEP = 17;

// Palette slot constants. We group the palette like compartments in a paint box: each
// animated panel owns a range of slots that it refills in update() every tick. The shared
// UI kit adds its own 12 theme colors in slots 240-251 (see init()), safely above
// everything listed here. Slot 0 is always transparent - reserved by the engine.

// Engine overlay style slots. configure() runs BEFORE init() installs the shared UI
// theme, so the overlay style cannot use theme slots - instead it points at these four
// low slots, which init() fills by hand with fixed colors.
const C_OVERLAY_BAR = 2; // overlay bar background (very dark navy)
const C_OVERLAY_ERR = 3; // timing chart error bars (dark blue)
const C_OVERLAY_TEXT = 4; // overlay text and chart update bars (golden yellow)
const C_OVERLAY_DIM = 5; // chart render and warning bars (cool gray-blue)

// Gradient section: 32 slots, one per swatch column. update() rewrites all 32 every tick
// to scroll the hue.
const C_GRAD_BASE = 10; // slots 10-41

// Fire section: 20 slots, one per horizontal band. The gradient ends at slot 41, so the
// fire starts at a round 50 to leave a gap.
const C_FIRE_BASE = 50; // slots 50-69

// Health bar: one slot that flips between red and white.
const C_HEALTH_BAR = 80; // slot 80

// Water strip: three slots that take turns being bright.
const C_WATER_BASE = 90; // slots 90-92

// Demonstrates palette animation: changing palette entries every tick to make a scrolling
// gradient, a fire column, a flashing health bar, and rippling water, all without
// touching the rectangles drawn in render().
class Demo {
    // The single palette used for all drawing.
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map for the shared UI kit theme, filled in init() by applyTheme().
    // theme.bg, theme.border, theme.header, and friends are palette indices ready for BT
    // draw calls.
    theme = null;

    // Seconds since the demo started, advanced by BT.deltaSeconds every tick. Drives the
    // continuous animation in update().
    animTime = 0;

    // Simulated health value (0-100), drained over time.
    health = HEALTH_MAX;

    // Which water slot is currently the bright one (0, 1, or 2).
    waterPhase = 0;

    // Tick when the water ripple last advanced one step.
    waterTick = 0;

    // Reused for every rectangle drawn in render(), so drawing allocates no new Rect2i.
    tempRect = new Rect2i(0, 0, 0, 0);

    // A wider canvas, the overlay's palette grid (64 columns), and overlay colors from
    // the dedicated low slots - plus the animated health slot as a playful gap color.
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

    // Builds the palette (overlay slots, placeholders for the animated slots, the shared
    // UI theme), activates it, then runs update() once so every animated slot has real
    // colors before the first render().
    async init() {
        console.log('[PaletteAnimationDemo] Initializing...');

        // Build the main palette. Think of this as setting up the paint box before you
        // start painting. Static entries (overlay colors, UI theme) go in now and never
        // change. Dynamic entries (gradient, fire, health, water) start as placeholders
        // and get overwritten in update() every tick.
        this.palette = BT.paletteCreate(256);

        // Colors for the engine overlay (the stats HUD). They match the shared UI theme's
        // look but live in low slots so configure() could name them before the theme
        // existed.
        this.palette.set(C_OVERLAY_BAR, new Color32(10, 12, 20)); // very dark navy
        this.palette.set(C_OVERLAY_ERR, new Color32(20, 24, 36)); // dark blue
        this.palette.set(C_OVERLAY_TEXT, new Color32(255, 210, 80)); // golden yellow
        this.palette.set(C_OVERLAY_DIM, new Color32(120, 130, 160)); // cool gray-blue

        // Placeholders for the animated slots: black for the gradient and fire, red for
        // the health bar, dark blue for the water. The first update() call below replaces
        // them all.
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
        // applyTheme() writes 12 colors into slots 240-251 - far above every range this
        // demo animates (gradient 10-41, fire 50-69, health 80, water 90-92), so the
        // animation can never overwrite the UI theme. The returned map remembers where
        // each color landed (this.theme.bg, this.theme.header, ...).
        this.theme = applyTheme(this.palette);

        // Tell the engine to draw with this palette from now on.
        BT.paletteSet(this.palette);

        // Run one update so every animated slot has real colors before the first render.
        // update() takes no arguments; this priming call also advances animTime by one
        // tick, the same as every regular call from the engine's game loop.
        this.update();

        console.log('[PaletteAnimationDemo] Initialized');

        return true;
    }

    // Runs once per tick, 60 times per second. Computes new Color32 values for every
    // animated slot. render() never sees a Color32 - it only uses the slot numbers.
    update() {
        // Advance the clock. BT.deltaSeconds is the length of one tick in seconds (1/60).
        this.animTime += BT.deltaSeconds;

        // Simulated health: drains from HEALTH_MAX toward 0 over HEALTH_DRAIN_TICKS
        // ticks, then jumps back to full so the demo loops forever. `%` is the remainder
        // after division, so tick % HEALTH_DRAIN_TICKS counts 0-359 and wraps.
        const tick = BT.ticks;
        this.health = HEALTH_MAX - Math.floor((tick % HEALTH_DRAIN_TICKS) * (HEALTH_MAX / HEALTH_DRAIN_TICKS));

        // Panel 1: the scrolling gradient. The base hue turns a little every tick so the
        // rainbow appears to slide along the bar.
        this.updateGradient();

        // Panel 2: the fire column. Each slot is one band of the flame; lower slots are
        // closer to the bottom and darker.
        this.updateFire();

        // Panel 3: the flashing health bar. One slot flips between red and white based on
        // the tick count.
        this.updateHealthBar(tick);

        // Panel 4: the water strip. Three slots take turns being the bright highlight.
        this.updateWater(tick);
    }

    // Draws all four panels. Only palette indices appear here - no Color32 objects.
    render() {
        // Clear the screen with the UI theme's dark background.
        BT.clear(this.theme.bg);

        // Draw each of the four panels.
        this.renderGradientPanel();
        this.renderFirePanel();
        this.renderHealthPanel();
        this.renderWaterPanel();
    }

    // Scrolling gradient: rewrites the 32 hue slots so the rainbow appears to slide. The
    // base hue advances every tick, and each slot gets a hue a little ahead of the one
    // before it.
    updateGradient() {
        // The base hue grows over time: 60 degrees per second, so one full turn of the
        // color wheel takes 6 seconds. Math.floor() rounds down to whole degrees, and
        // % 360 keeps the hue in the 0-359 range.
        const baseHue = Math.floor(this.animTime * 60) % 360;

        for (let i = 0; i < GRAD_SLOTS; i++) {
            // Spread the slots evenly around the color wheel: (i / GRAD_SLOTS) * 360
            // spaces 32 hues over 360 degrees.
            const hue = (baseHue + (i / GRAD_SLOTS) * 360) % 360;

            // Color32.fromHSL(hue, saturation, lightness): hue 0-360 is the position on
            // the color wheel (0 red, 120 green, 240 blue), saturation 0-100 is how vivid
            // the color is (0 gray, 100 pure), lightness 0-100 is how bright (0 black,
            // 50 pure color, 100 white).
            this.palette.set(C_GRAD_BASE + i, Color32.fromHSL(hue, 90, 55));
        }
    }

    // Fire column: each slot is one horizontal band of flame. The bottom is black and
    // dark red; moving up it turns orange and then pale yellow. A sine wave nudges each
    // band's position a little over time so the flame flickers.
    updateFire() {
        for (let i = 0; i < FIRE_SLOTS; i++) {
            // t is 0 at the bottom slot and 1 at the top slot.
            const t = i / (FIRE_SLOTS - 1);

            // Math.sin() returns a value between -1 and 1 that swings back and forth over
            // time. Adding 1 and scaling by 0.075 turns that into a 0-0.15 wobble.
            const flicker = (Math.sin(this.animTime * 7 + i * 0.8) + 1) * 0.075;

            // Add the wobble to t and clamp the result between 0 and 1.
            const ft = Math.min(1, Math.max(0, t + flicker));

            this.palette.set(C_FIRE_BASE + i, this.fireColor(ft));
        }
    }

    // Maps a position along the flame (`ft`, 0 at the bottom, 1 at the top) to a fire
    // color by blending through four stops: black at 0, dark red at 0.3, bright orange at
    // 0.6, pale yellow at 1.
    fireColor(ft) {
        if (ft < 0.3) {
            // Black to dark red.
            const s = ft / 0.3; // rescales 0-0.3 to 0-1
            return new Color32(Math.floor(s * 160), 0, 0);
        }

        if (ft < 0.6) {
            // Dark red to bright orange.
            const s = (ft - 0.3) / 0.3;
            return new Color32(160 + Math.floor(s * 95), Math.floor(s * 100), 0);
        }

        // Orange to pale yellow.
        const s = (ft - 0.6) / 0.4;
        return new Color32(255, 100 + Math.floor(s * 155), Math.floor(s * 120));
    }

    // Health bar: flips one slot between red and white every FLASH_PERIOD ticks, but only
    // while health is critically low. Otherwise the slot holds a steady red.
    updateHealthBar(tick) {
        if (this.health <= HEALTH_LOW) {
            // Math.floor(tick / FLASH_PERIOD) counts up by one every FLASH_PERIOD ticks,
            // and % 2 turns that count into 0, 1, 0, 1, ... - so the color flips every 8
            // ticks.
            const flashOn = Math.floor(tick / FLASH_PERIOD) % 2 === 0;
            this.palette.set(C_HEALTH_BAR, flashOn ? new Color32(255, 50, 50) : new Color32(255, 255, 255));
        } else {
            // Healthy: steady red.
            this.palette.set(C_HEALTH_BAR, new Color32(200, 40, 40));
        }
    }

    // Water strip: three slots take turns being the brightest. Each slot cycles bright,
    // medium, dark, bright, ... and the three are offset by one step, so the bright spot
    // appears to travel along the strip.
    updateWater(tick) {
        // Advance the ripple every 8 ticks - 7.5 steps per second.
        if (tick - this.waterTick >= 8) {
            this.waterPhase = (this.waterPhase + 1) % WATER_SLOTS;
            this.waterTick = tick;
        }

        for (let i = 0; i < WATER_SLOTS; i++) {
            // How far slot i is from the current bright spot: 0, 1, or 2 steps. Adding
            // WATER_SLOTS before the % keeps the result from going negative.
            const dist = (i - this.waterPhase + WATER_SLOTS) % WATER_SLOTS;

            // dist 0 is the brightest, 1 medium, 2 the darkest.
            let color;

            if (dist === 0) {
                // Bright highlight - the wave crest.
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

    // Opens a titled kit panel at a fixed spot and width. The caller then adds its rows
    // (labels, spacers) and closes the group with ui.end().
    beginPanel(x, y, width, title) {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x, y, width });
        ui.panel(title);
    }

    // Fills a rectangle on top of a kit panel. Kit panels are sprites, and the engine
    // draws every BT.drawRectFill() before any sprite - so a plain one would hide under
    // the panel. ui.drawRectFill() takes the same rectangle and palette slot but draws a
    // sprite, which lands on top in the order we call it.
    fillOnPanel(x, y, width, height, slot) {
        this.tempRect.set(x, y, width, height);
        ui.drawRectFill(this.tempRect, slot);
    }

    // Panel 1: the scrolling gradient bar, across the full width. 32 rectangles sit
    // inside it, each using a different palette slot. Because update() rotates the hues
    // in those slots, the bar appears to scroll.
    renderGradientPanel() {
        // ui.spacer() reserves an empty band under the dim label for the swatches, which
        // are drawn after ui.end() so they land on top of the panel.
        this.beginPanel(PANEL_X, GRAD_PANEL_Y, PANEL_W, 'Scrolling Gradient - slots 10-41');
        ui.label('update() turns every hue a little each tick', { color: 'dim' });
        ui.spacer(GRAD_SPACER);
        ui.end();

        // The swatches are centered in the panel, ART_GAP pixels below the label row.
        const stripW = GRAD_SLOTS * GRAD_SWATCH_W;
        const x0 = PANEL_X + (PANEL_W - stripW) / 2;
        const y = GRAD_PANEL_Y + PANEL_CONTENT_TOP + LABEL_ROW_H + ART_GAP;

        for (let i = 0; i < GRAD_SLOTS; i++) {
            this.fillOnPanel(x0 + i * GRAD_SWATCH_W, y, GRAD_SWATCH_W, GRAD_SWATCH_H, C_GRAD_BASE + i);
        }
    }

    // Panel 2: the fire column, on the left. FIRE_SLOTS horizontal bands stacked
    // vertically; their colors change in update() to flicker.
    renderFirePanel() {
        this.beginPanel(PANEL_X, LOWER_PANELS_Y, FIRE_PANEL_W, 'Fire - slots 50-69');
        ui.spacer(FIRE_SPACER);
        ui.end();

        // Fire bands from the bottom (band 0, darkest) to the top (band FIRE_SLOTS - 1,
        // brightest). We draw them bottom-up so band 0 sits at the base of the column.
        const colX = PANEL_X + PANEL_TEXT_INSET;
        const colTop = LOWER_PANELS_Y + PANEL_CONTENT_TOP + 3;
        const colBottom = colTop + FIRE_SLOTS * FIRE_BAND_H;

        for (let i = 0; i < FIRE_SLOTS; i++) {
            const y = colBottom - (i + 1) * FIRE_BAND_H;
            this.fillOnPanel(colX, y, FIRE_COL_W, FIRE_BAND_H, C_FIRE_BASE + i);
        }

        // Notes beside the column: the slot at the very top, the sin() flicker in the
        // middle, and the slot at the very bottom. A caption's capital letters cover 7
        // rows starting 1 row above the y it is given, so labelY = top + 1 lines their
        // top up with the column top, and labelY = bottom - 6 lines their bottom up with
        // it.
        const noteX = colX + FIRE_COL_W + 8;

        ui.caption(noteX, colTop + 1, 'slot 69', { color: 'dim' });
        ui.caption(noteX, (colTop + colBottom) / 2 - 2, 'flicker', { color: 'dim' });
        ui.caption(noteX, colBottom - 6, 'slot 50', { color: 'dim' });
    }

    // Panel 3: the flashing health bar, top right. One palette slot flips between red and
    // white when health is critically low.
    renderHealthPanel() {
        // Heading, a spacer for the bar artwork, then the live status line. The status
        // text turns warm orange when health is critical, dim gray otherwise.
        const isCritical = this.health <= HEALTH_LOW;

        this.beginPanel(RIGHT_PANEL_X, LOWER_PANELS_Y, RIGHT_PANEL_W, 'Flashing Health Bar - slot 80');
        ui.spacer(HEALTH_SPACER);
        ui.label(isCritical ? 'CRITICAL! slot 80 flashes red/white' : 'Healthy: slot 80 = steady red', {
            color: isCritical ? 'warm' : 'dim',
        });
        ui.end();

        // The bar sits in the middle of the band the spacer reserved.
        const barX = RIGHT_PANEL_X + PANEL_TEXT_INSET;
        const barY = LOWER_PANELS_Y + PANEL_CONTENT_TOP + (HEALTH_SPACER - HEALTH_BAR_H) / 2;

        // Width of the filled part from the current health: health / HEALTH_MAX is a
        // fraction from 0 to 1, multiplied by the full bar width. Math.max keeps at least
        // 1 pixel visible.
        const barW = Math.max(1, Math.floor((this.health / HEALTH_MAX) * HEALTH_BAR_W));

        // Background trough (dark, always full width) with a theme-colored outline.
        // ui.drawRect() is the sprite version of BT.drawRect(), for the same reason as
        // fillOnPanel(): it has to show on top of the kit panel.
        this.fillOnPanel(barX, barY, HEALTH_BAR_W, HEALTH_BAR_H, this.theme.bg);
        this.tempRect.set(barX, barY, HEALTH_BAR_W, HEALTH_BAR_H);
        ui.drawRect(this.tempRect, this.theme.border);

        // The filled part uses C_HEALTH_BAR, which update() flashes when health is low.
        this.fillOnPanel(barX, barY, barW, HEALTH_BAR_H, C_HEALTH_BAR);

        // The health value as text right of the bar, in the theme's amber heading color.
        // labelY = barY + 3 puts the 7-pixel-tall digits on rows barY + 2 to barY + 8,
        // the middle of the 12-pixel bar.
        ui.caption(barX + HEALTH_BAR_W + 8, barY + 3, `HP ${this.health}`, { color: 'header' });
    }

    // Panel 4: the water strip, bottom right. The tiles each use one of the three water
    // slots, so the brightness cycles across them like a ripple.
    renderWaterPanel() {
        this.beginPanel(RIGHT_PANEL_X, WATER_PANEL_Y, RIGHT_PANEL_W, 'Cycling Water Strip - slots 90-92');
        ui.label('Three slots take turns being the bright crest', { color: 'dim' });
        ui.spacer(WATER_SPACER);
        ui.end();

        const x0 = RIGHT_PANEL_X + PANEL_TEXT_INSET;
        const y = WATER_PANEL_Y + PANEL_CONTENT_TOP + LABEL_ROW_H + ART_GAP;

        for (let i = 0; i < WATER_TILES; i++) {
            // i % WATER_SLOTS maps the tile index to one of the three water slots.
            const slot = C_WATER_BASE + (i % WATER_SLOTS);

            this.fillOnPanel(x0 + i * WATER_TILE_STEP, y, WATER_TILE_STEP - 1, WATER_TILE_H, slot);
        }
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
