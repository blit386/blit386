/*

Named Colors: the Color32 named color registry and custom registration.
@description The Color32 named color registry: resolve a name to a color, register your own, and update it.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Colors: https://demos.blit386.dev/colors

Live version: https://demos.blit386.dev/named-colors

Guides:
  - Overlay: https://blit386.dev/docs/guides/overlay#optional-bands

Reference:
  - Core Types: https://blit386.dev/docs/api/core-types#color32
  - Overlay: https://blit386.dev/docs/api/overlay#event-tags

---

WHAT YOU WILL SEE
-----------------

A deep navy screen with a full-width title strip across the top that reads "Built-in
lookups + register / update / unregister". Below it, two UI kit panels share one width.
The "Named colors" panel holds four color swatches in a row, each with its name and a dim
"built-in" or "custom" tag centered under it:

- tomato: the built-in named color "tomato", a warm red.
- cornflower: the built-in named color "cornflowerblue", a soft blue.
- dynamic: a custom name, "demo-dynamic", whose color slides back and forth between the
  two built-ins.
- optional: a custom name, "demo-optional", a pink that disappears every 3 seconds. While
  the name is unregistered the swatch turns gray.

Under the swatches, three lines name the two custom colors and report whether
"demo-optional" is currently registered (green) or missing (orange). A "Tips" panel below
lists three rules of the registry.

WHAT YOU WILL LEARN
-------------------

- Color32.resolveNamedColor(name) looks a name up in the global registry and returns the
  Color32, or undefined when the name is unknown.
- Color32.registerColor(name, color) adds a new name. It throws if the name is taken.
- Color32.updateColor(name, color) changes an existing name's color. It throws if the name
  is missing.
- Color32.unregisterColor(name) removes a name. It throws if the name is missing.
- Names are trimmed and lowercased before matching, so 'Tomato' and ' tomato ' both find
  "tomato".
- Named colors are plain Color32 values: to draw with one, copy it into a palette slot in
  update() and draw with the slot number in render().
- Color32.lerp() blends two colors, and BT.assignTag() drops a label on the overlay's
  timing chart when something changes.

THINK OF THE REGISTRY AS A DICTIONARY
-------------------------------------

- The "word" is a name like "cornflowerblue".
- The "definition" is a Color32 value (r, g, b, a).
- resolveNamedColor(name) asks the dictionary: "Do you know this word?"
- registerColor() adds a new word, updateColor() rewrites a definition, and
  unregisterColor() tears the page out.

TRY THIS
--------

- Watch the "optional" swatch and the status line below it: every 3 seconds the name is
  unregistered (gray swatch, orange "missing" text) and 3 seconds later registered again
  (pink swatch, green "registered" text).
- Press the backquote key (`) to open the engine overlay. The timing chart is enabled
  here, and each toggle drops an "Optional registered" or "Optional removed" tag on it.

*/

import { bootstrap, BT, Color32, Rect2i } from 'blit386';

// The shared demo UI kit. applyTheme() installs the kit's twelve UI colors high in the
// palette (slots 240-251, far above this demo's slots 1-9), and ui.* draws the title
// strip, the captions, and the Tips panel.
import { applyTheme, FONT_W, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// Palette slots for this demo's own colors. Slot 0 stays transparent. Panels, captions,
// and status text draw with the shared UI theme instead (installed by applyTheme() in
// init()), so only two kinds of slots live down here: the overlay timing chart's bar
// colors, and the lesson's swatch slots.
//
// The chart slots exist because configure() runs BEFORE init() installs the theme, so the
// chart style cannot point at theme slots. init() copies the matching theme colors here.
const C_CHART_UPDATE = 1; // timing chart: update() bar (the theme's blue-gray border)
const C_CHART_RENDER = 2; // timing chart: render() bar (the theme's off-white text)
const C_CHART_TAG = 3; // timing chart: tag labels (the theme's green accent)
const C_TOMATO = 5; // swatch slot for the built-in name "tomato"
const C_CORNFLOWER = 6; // swatch slot for the built-in name "cornflowerblue"
const C_CUSTOM_DYNAMIC = 7; // swatch slot for the animated custom name "demo-dynamic"
const C_OPTIONAL = 8; // swatch slot for the toggled custom name "demo-optional"
const C_OPTIONAL_FALLBACK = 9; // gray shown while demo-optional is unregistered

// The two custom names this demo registers.
const CUSTOM_DYNAMIC_NAME = 'demo-dynamic';
const CUSTOM_OPTIONAL_NAME = 'demo-optional';

// The four swatches: which palette slot each one shows, its label, and whether the name
// behind it is built into the engine or one this demo registers.
const SWATCHES = [
    { slot: C_TOMATO, label: 'tomato', kind: 'built-in' },
    { slot: C_CORNFLOWER, label: 'cornflower', kind: 'built-in' },
    { slot: C_CUSTOM_DYNAMIC, label: 'dynamic', kind: 'custom' },
    { slot: C_OPTIONAL, label: 'optional', kind: 'custom' },
];

// Swatch size in pixels.
const SWATCH_W = 56;
const SWATCH_H = 24;

// Layout: two panels 4 pixels from the screen sides (312 pixels wide) and 4 pixels apart,
// centered in the space between the 22-pixel title strip and the bottom 13 pixels the
// engine overlay keeps for its toggle hint.
//
//   - Named colors panel: 22 title + the swatch band (2 + 24 swatch + 3 + two 10-pixel
//     caption lines + 6) + three 10-pixel status lines + 11 bottom.
//   - Tips panel: 22 title + three 10-pixel lines + 11 bottom.
const EDGE = 4;
const GAP = 4;
const PANEL_W = 320 - 2 * EDGE;
const PANEL_PAD = 9;
const PANEL_CONTENT_TOP = 22;
const SWATCH_BAND_H = 2 + SWATCH_H + 3 + 2 * 10 + 6;
const COLORS_PANEL_H = PANEL_CONTENT_TOP + SWATCH_BAND_H + 3 * 10 + 11;
const TIPS_PANEL_H = PANEL_CONTENT_TOP + 3 * 10 + 11;
const FREE_TOP = 22;
const FREE_BOTTOM = 240 - 13;
const COLORS_PANEL_Y = FREE_TOP + Math.floor((FREE_BOTTOM - FREE_TOP - COLORS_PANEL_H - GAP - TIPS_PANEL_H) / 2);
const TIPS_PANEL_Y = COLORS_PANEL_Y + COLORS_PANEL_H + GAP;

// The swatches sit in four equal cells across the panel's content width.
const CELL_W = (PANEL_W - 2 * PANEL_PAD) / SWATCHES.length;

// Shows built-in and custom named colors: four swatches, a live status line, and tips.
class Demo {
    // The palette holds every color this demo draws with.
    /** @type {Palette | null} */
    palette = null;

    // The palette slot numbers of the shared UI kit colors, filled in by applyTheme() in
    // init(). We use them for the background, the swatch panel frame, and the swatch
    // outlines and labels.
    theme = null;

    // Whether "demo-optional" is currently in the registry. update() flips it every 3
    // seconds.
    optionalRegistered = true;

    // A clock that counts up in seconds, driving the blend and the 3-second toggle.
    elapsed = 0;

    // Reused for every swatch rectangle drawn in render(), so drawing allocates no new
    // Rect2i.
    swatchRect = new Rect2i(0, 0, 0, 0);

    // Opt in to the overlay timing chart, with bar colors that match the UI theme.
    configure() {
        return {
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_CHART_UPDATE,
                renderBarPaletteIndex: C_CHART_RENDER,
                tagPaletteIndex: C_CHART_TAG,
            },
        };
    }

    // Builds the palette and registers the custom named colors. Returns true when ready.
    async init() {
        this.palette = BT.paletteCreate(256);

        // Overlay timing chart colors. These copy the shared theme's hex values into the
        // low slots configure() pointed the chart style at (see the note on the C_CHART_*
        // constants above for why the chart cannot use theme slots directly).
        this.palette.set(C_CHART_UPDATE, Color32.fromHex('#5a6480')); // theme border
        this.palette.set(C_CHART_RENDER, Color32.fromHex('#e6ecf5')); // theme text
        this.palette.set(C_CHART_TAG, Color32.fromHex('#7dffa5')); // theme accent green

        // Fallback gray for the moments when demo-optional is unregistered.
        this.palette.set(C_OPTIONAL_FALLBACK, new Color32(80, 80, 80));

        // Install the shared UI kit colors. They land in slots 240-251, far above the
        // swatch slots this demo animates (5-9), so the two can never collide. The
        // returned map remembers which slot each UI color went to (theme.bg, theme.text,
        // ...).
        this.theme = applyTheme(this.palette);

        // Remove old custom names before registering fresh ones. Hot reload can leave
        // names in memory from a previous run, and registerColor() throws when a name
        // already exists.
        this.removeIfExists(CUSTOM_DYNAMIC_NAME);
        this.removeIfExists(CUSTOM_OPTIONAL_NAME);

        // registerColor() adds a NEW entry to the global name table. It throws if the
        // name is already taken, which is why we cleared it above. 'demo-dynamic' gets
        // rewritten every tick with updateColor() in update().
        Color32.registerColor(CUSTOM_DYNAMIC_NAME, new Color32(90, 170, 255));

        // 'demo-optional' starts registered. update() unregisters and re-registers it on
        // a timer so you can watch resolveNamedColor() fall back to gray.
        Color32.registerColor(CUSTOM_OPTIONAL_NAME, new Color32(255, 90, 150));
        this.optionalRegistered = true;
        this.elapsed = 0;

        // Tell the engine to use this palette for all drawing.
        BT.paletteSet(this.palette);

        // Run one update so the swatch slots hold real colors before the first render.
        // Without it, a frame drawn before the first update() shows four black swatches.
        // This priming call also advances the clock by one tick, the same as every
        // regular call from the engine's game loop.
        this.update();

        return true;
    }

    // Animates the custom named colors every tick.
    update() {
        this.elapsed += BT.deltaSeconds;

        // Read two built-in names from the registry. resolveOr() carries the same values
        // as a fallback, so the swatches would still work if a name were ever missing.
        const tomato = this.resolveOr('tomato', new Color32(255, 99, 71));
        const cornflower = this.resolveOr('cornflowerblue', new Color32(100, 149, 237));

        // Blend between the two built-ins to make a moving custom color. Math.sin()
        // returns -1..1, so (sin + 1) / 2 moves it to 0..1, and lerp() picks the color
        // that far between tomato and cornflower.
        const t = (Math.sin(this.elapsed * 2) + 1) / 2;
        const dynamicColor = tomato.lerp(cornflower, t);
        Color32.updateColor(CUSTOM_DYNAMIC_NAME, dynamicColor);

        // Every 3 seconds toggle demo-optional: registered, unregistered, registered, ...
        // Math.floor(elapsed / 3) counts whole 3-second blocks, and % 2 (the remainder
        // after dividing by 2) turns that count into 0, 1, 0, 1.
        const cycle = Math.floor(this.elapsed / 3) % 2;
        const shouldBeRegistered = cycle === 0;

        if (shouldBeRegistered && !this.optionalRegistered) {
            // Put the name back and mark the moment on the overlay's timing chart.
            Color32.registerColor(CUSTOM_OPTIONAL_NAME, new Color32(255, 90, 150));
            this.optionalRegistered = true;
            BT.assignTag('Optional registered');
        } else if (!shouldBeRegistered && this.optionalRegistered) {
            // Take the name out and mark that too.
            Color32.unregisterColor(CUSTOM_OPTIONAL_NAME);
            this.optionalRegistered = false;
            BT.assignTag('Optional removed');
        }

        // Copy the current named colors into the palette slots the draw calls use.
        this.palette.set(C_TOMATO, tomato);
        this.palette.set(C_CORNFLOWER, cornflower);
        this.palette.set(C_CUSTOM_DYNAMIC, this.resolveOr(CUSTOM_DYNAMIC_NAME, new Color32(255, 255, 255)));

        // While demo-optional is unregistered, show the reserved C_OPTIONAL_FALLBACK gray
        // (set in init()) instead of looking up the built-in name "gray".
        this.palette.set(C_OPTIONAL, this.resolveOr(CUSTOM_OPTIONAL_NAME, this.palette.get(C_OPTIONAL_FALLBACK)));
    }

    // Draws the two kit panels: the swatches with the live registry status, and the
    // tips.
    render() {
        // Fill the screen with the shared UI theme's deep navy background.
        BT.clear(this.theme.bg);

        // Full-width title strip across the top, drawn by the shared UI kit. 'topBar' is
        // the classic 22-pixel strip; panel() gives it a background and a title.
        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel('Built-in lookups + register / update / unregister');
        ui.end();

        // The Named colors panel. ui.spacer() reserves the band the swatches are drawn
        // into after ui.end(); the three status lines follow under it.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: EDGE, y: COLORS_PANEL_Y, width: PANEL_W });
        ui.panel('Named colors');
        ui.spacer(SWATCH_BAND_H);
        ui.label("Custom dynamic name: 'demo-dynamic'");
        ui.label("Custom optional name: 'demo-optional'");

        // The status line flips between the theme's green 'accent' and orange 'warm'
        // roles, so you can watch registerColor / unregisterColor take effect every 3
        // seconds (update() drives the toggle).
        if (this.optionalRegistered) {
            ui.label('demo-optional is registered (registerColor)', { color: 'accent' });
        } else {
            ui.label('demo-optional is missing (unregisterColor)', { color: 'warm' });
        }

        ui.end();

        // The four swatches, one per cell, on top of the panel.
        for (let i = 0; i < SWATCHES.length; i++) {
            this.drawSwatch(EDGE + PANEL_PAD + i * CELL_W, SWATCHES[i]);
        }

        // The Tips panel below it, the same width.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: EDGE, y: TIPS_PANEL_Y, width: PANEL_W });
        ui.panel('Tips');
        ui.label('Names are trim + lowercase normalized.', { color: 'dim' });
        ui.label('registerColor throws if the name exists.', { color: 'dim' });
        ui.label('updateColor / unregisterColor throw if missing.', { color: 'dim' });
        ui.end();
    }

    // Looks up a named color and returns `fallback` when the name is missing.
    resolveOr(name, fallback) {
        const resolved = Color32.resolveNamedColor(name);

        if (resolved === undefined) {
            return fallback;
        }

        return resolved;
    }

    // Removes a custom name if it exists, so init() can register it cleanly. This makes
    // hot reload safer during development.
    removeIfExists(name) {
        if (Color32.resolveNamedColor(name) !== undefined) {
            Color32.unregisterColor(name);
        }
    }

    // Draws one swatch centered in the cell that starts at `cellX`, with its label and
    // its built-in / custom tag centered under it. `swatch` is one SWATCHES entry.
    drawSwatch(cellX, swatch) {
        const centerX = cellX + CELL_W / 2;
        const x = Math.round(centerX - SWATCH_W / 2);
        const y = COLORS_PANEL_Y + PANEL_CONTENT_TOP + 2;

        // Fill the swatch with the palette slot we are demonstrating: the lesson itself.
        // The outline is chrome, so it uses the shared UI theme's border color. Both use
        // the kit's sprite drawing (ui.drawRectFill / ui.drawRect): the engine draws
        // every BT.drawRectFill() before any sprite, and the kit panel is a sprite, so a
        // plain rectangle would hide under it.
        this.swatchRect.set(x, y, SWATCH_W, SWATCH_H);
        ui.drawRectFill(this.swatchRect, swatch.slot);
        ui.drawRect(this.swatchRect, this.theme.border);

        // Two caption lines centered under the swatch. Every character of the system
        // font is FONT_W (6) pixels wide, so a line starts half its width left of the
        // middle; a caption's text starts 4 pixels above the y it is given.
        const textY = y + SWATCH_H + 3;

        ui.caption(Math.round(centerX - (swatch.label.length * FONT_W) / 2), textY + 4, swatch.label, {
            color: 'text',
        });
        ui.caption(Math.round(centerX - (swatch.kind.length * FONT_W) / 2), textY + 14, swatch.kind, { color: 'dim' });
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
