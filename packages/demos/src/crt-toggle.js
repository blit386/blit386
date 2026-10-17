/*

CRT Toggle: turn the post-process effects on and off in flight.
@description Turn a whole CRT post-process stack on and off at runtime, switching every two seconds as it runs.
@pageTitle BLIT386 Demo – CRT Toggle

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - PipBoy CRT: https://demos.blit386.dev/crt-pipboy

Live version: https://demos.blit386.dev/crt-toggle

Guides:
  - Post-Process Effects: https://blit386.dev/docs/guides/post-process-effects#presets
  - Game Loop: https://blit386.dev/docs/guides/game-loop#smoothing-motion-between-updates
  - Overlay: https://blit386.dev/docs/guides/overlay#optional-bands

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#post-process-effects
  - Game Loop: https://blit386.dev/docs/api/game-loop#interpolating-render-state-with-renderalpha
  - Core: https://blit386.dev/docs/api/core#requested-vs-active-backend
  - Overlay: https://blit386.dev/docs/api/overlay#event-tags

---

WHAT YOU WILL SEE
-----------------

A simple, colorful scene: six wide horizontal bars across the middle of a 320x240 screen
and five squares bouncing around the whole screen on top of them. Every two seconds the
CRT preset flips on or off by itself. While it is on you see scanlines, an RGB shadow
mask, a gentle barrel curve, a slight red/blue color fringe, a bright band slowly rolling
down, faint grain, and a soft phosphor glow; while it is off the picture is just the crisp
4x upscale of what the engine drew. The squares keep bouncing either way, so you can
compare the two looks back to back.

A small panel in the top-left corner says "CRT: ON" or "CRT: OFF" so you always know which
side you are looking at. Notice that the bars stay straight through the toggle: barrel
distortion is a display-tier effect, so it bends the 1280x960 RGBA picture after the
palette resolve and upscale - not the 320x240 index buffer - which keeps diagonals free of
stair-steps.

WHAT YOU WILL LEARN
-------------------

- How to add and remove a whole stack of post-process effects at runtime with
  BT.effectAdd(effect) and BT.effectRemove(effect).
- That an empty chain costs nothing extra: the first BT.effectAdd allocates the display
  chain's off-screen render targets, and removing the last effect (or BT.effectClear())
  frees them again, so the engine goes back to drawing straight through the upscale pass.
- That the same effect instances are kept across toggles. Creating new ones on every
  toggle would also work, but it would rebuild the GPU pipelines every two seconds for an
  identical look.
- BT.preset.crtPipBoy(): one call that returns a fresh array of nine pre-configured
  display-tier effects, so you do not have to wire them up by hand.
- BT.renderAlpha and Vector2i.lerp() for drawing the squares between two physics ticks.
- Checking BT.activeBackend (through the shared isAvailable() helper) before touching the
  effect API, because the software renderer has no post-processing.

HOW THE TOGGLE WORKS
--------------------

Time is measured in ticks (60 per second). Every TOGGLE_PERIOD_TICKS (120, so two seconds)
update() flips a boolean and either adds or removes every effect in the preset array. The
effects that animate over time (RollLine, Noise, Interference) get their `time` field fed
every tick whether or not they are in the chain, so they are never stale when they come
back.

SOFTWARE FALLBACK
-----------------

In software renderer mode (no WebGPU, or ?backend=software in the URL) post-process
effects are unavailable. The squares and bars still animate; the toggle is disabled and
the panel says "CRT: N/A" with a one-line explanation.

Why auto-toggle instead of a button? This demo is about the effect API, not controls.
Auto-toggling keeps the ON/OFF comparison hands-free. Pointer and keyboard input have
their own demos later in the series.

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. Its timing chart gets a "CRT:
  ON" or "CRT: OFF" tag at every toggle, so you can see whether the render bar changes
  while the effects are live. The overlay draws its bar and text with this demo's own
  palette slots.
- Add ?backend=software to the URL to see the fallback panel.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { isAvailable, SOFTWARE_FALLBACK_NOTE } from './shared/post-process-backend.js';
import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

// Internal pixel resolution.
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Output drawing-buffer resolution. Setting it 4x larger than the logical size unlocks
// the display-tier effects (barrel, scanlines, mask, ...) and gives them enough output
// pixels to render smoothly. Each logical pixel maps to a 4x4 output block.
const OUTPUT_W = 1280;
const OUTPUT_H = 960;

const TARGET_FPS = 60;

// Palette indices. Index 0 is always transparent.
const C_BG = 1; // dark navy: the background fill
const C_LABEL = 2; // white: the engine overlay's text
const C_RED = 3;
const C_GREEN = 4;
const C_BLUE = 5;
const C_YELLOW = 6;
const C_CYAN = 7;
const C_MAGENTA = 8;
const C_OVERLAY_BAR = 9; // the engine overlay's bar and gap background

// The five colors of the bouncing squares, in order, so each square gets its own.
const SQUARE_COLORS = [C_RED, C_GREEN, C_BLUE, C_YELLOW, C_MAGENTA];

// How big each bouncing square is, in pixels.
const SQUARE_SIZE = 24;

// How many bouncing squares to show.
const SQUARE_COUNT = 5;

// How fast each square moves, in pixels per tick. One value per square so the motion
// looks irregular - if all five moved at the same speed they would line up and the demo
// would look duller.
const SQUARE_SPEEDS = [
    new Vector2i(2, 1),
    new Vector2i(1, 2),
    new Vector2i(3, 1),
    new Vector2i(1, 3),
    new Vector2i(2, 2),
];

// How many ticks between toggles. 120 ticks at 60 ticks per second is 2 seconds per state
// - long enough to read the "CRT: ON / OFF" label and watch the scene switch.
const TOGGLE_PERIOD_TICKS = 120;

// Static horizontal bars across the middle of the screen. They give the CRT scanlines
// something high-contrast to work on, so the difference between ON and OFF is obvious.
const BAR_HEIGHT = 18;
const BAR_GAP = 6;
const BAR_TOP = 60;
const BAR_COLORS = [C_RED, C_YELLOW, C_GREEN, C_CYAN, C_BLUE, C_MAGENTA];

// A small animated scene with the CRT effect stack flipping on and off every two seconds,
// showing the dynamic add/remove path of the post-process chain. The stack comes from
// BT.preset.crtPipBoy(), which returns a fresh array of display-tier effects
// (BarrelDistortion, ChromaticAberration, Interference, RollLine, Scanlines, RGBMask,
// Noise, Flicker, Bloom). The array is kept so the same instances are re-added on each
// toggle; that way the GPU pipelines stay alive instead of being torn down and rebuilt
// every two seconds.
class Demo {
    // Same 320x240 logical / 1280x960 output setup as the PipBoy CRT demo, which the
    // display-tier CRT preset needs.
    configure() {
        return {
            // Internal pixel-art resolution. Game logic and draws operate at this size.
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // drawingBufferSize is required for display-tier effects (barrel, scanlines,
            // mask, bloom). Flow: draw palette indices at 320x240, run any pixel-tier
            // effects on that r8uint buffer, then the engine resolves indices through the
            // palette and upscales to RGBA at this size, then the display chain runs on
            // the RGBA image. Without this field BT.effectAdd throws for display-tier
            // effects.
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // Match the output buffer size so the CRT picture is not capped at the
            // default 960x720 CSS size.
            maxCanvasSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // 'nearest' keeps each source pixel a crisp 4x4 block. 'linear' would soften
            // them into bilinear-blended squares - a different look, also valid.
            outputUpscaleFilter: 'nearest',

            targetFPS: TARGET_FPS,

            // The engine overlay draws with this demo's own palette slots, and its timing
            // chart is on so the "CRT: ON / OFF" tags have somewhere to land.
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_LABEL,
                gapPaletteIndex: C_OVERLAY_BAR,
            },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_CYAN,
                renderBarPaletteIndex: C_YELLOW,
                warningPaletteIndex: C_MAGENTA,
                errorPaletteIndex: C_RED,
                tagPaletteIndex: C_GREEN,
            },
        };
    }

    async init() {
        // Step 1: build the palette. A small, colorful set of scene colors in the low
        // slots. Bright primaries make the CRT effect obvious - soft pastels would look
        // the same with or without it. The palette is 256 entries long so the shared UI
        // theme can live in the high slots (240-251), far away from the scene colors.
        const palette = BT.paletteCreate(256);
        palette.set(C_BG, new Color32(20, 30, 50, 255));
        palette.set(C_LABEL, Color32.white);
        palette.set(C_RED, Color32.red);
        palette.set(C_GREEN, Color32.green);
        palette.set(C_BLUE, Color32.blue);
        palette.set(C_YELLOW, Color32.yellow);
        palette.set(C_CYAN, Color32.cyan);
        palette.set(C_MAGENTA, Color32.magenta);
        palette.set(C_OVERLAY_BAR, new Color32(10, 15, 25, 220));

        // Install the shared UI kit colors into slots 240-251. The kit draws the small
        // CRT status panel; the scene keeps its own bright primaries above.
        applyTheme(palette);
        BT.paletteSet(palette);

        this.effectsAvailable = isAvailable();

        if (this.effectsAvailable) {
            // Step 2: build the CRT preset once, up front. BT.preset.crtPipBoy() returns
            // a fresh array of nine pre-configured display-tier effects
            // (BarrelDistortion, ChromaticAberration, Interference, RollLine, Scanlines,
            // RGBMask, Noise, Flicker, Bloom). Keeping the array means the same instances
            // are re-added on each toggle. Re-creating them every toggle would also work,
            // but it would re-allocate the GPU pipelines and uniform buffers each time -
            // wasteful when the look is the same.
            this.stack = BT.preset.crtPipBoy();

            // Step 3: pick out the time-driven effects so update() can animate them. Some
            // effects (RollLine, Noise, Interference) animate from a `time` field; filter
            // the array once and keep the references instead of walking the whole stack
            // every tick.
            this.timedEffects = this.stack.filter((fx) => 'time' in fx);
        } else {
            this.stack = [];
            this.timedEffects = [];
        }

        // Step 4: start in the OFF state. The PipBoy CRT demo shows the CRT look straight
        // away; here it is nicer to begin clean and let the effect arrive on the first
        // toggle.
        this.enabled = false;
        this.lastToggleTick = BT.ticks;

        // Step 5: place the bouncing squares evenly across the bottom half so they do not
        // all start in the same spot. Each square keeps its position (pos) and velocity
        // (vel) as Vector2i instances - the engine convention for pixel coordinates.
        this.squares = [];

        for (let i = 0; i < SQUARE_COUNT; i++) {
            const startPos = new Vector2i(20 + i * 50, 150 + (i % 2) * 30);

            this.squares.push({
                pos: startPos,
                // prevPos remembers where the square was at the start of the most recent
                // update() tick. render() blends between prevPos and pos with
                // BT.renderAlpha so each square glides between physics ticks instead of
                // jumping - see the Game Loop guide linked in the header.
                prevPos: startPos,
                vel: new Vector2i(SQUARE_SPEEDS[i].x, SQUARE_SPEEDS[i].y),
                color: SQUARE_COLORS[i % SQUARE_COLORS.length],
            });
        }

        return true;
    }

    update() {
        // 1. Time-based toggle (WebGPU only - effectAdd throws in software mode). Every
        // TOGGLE_PERIOD_TICKS flip the boolean and either add or remove the entire preset
        // stack. The engine handles the GPU pipeline lifecycle.
        if (this.effectsAvailable && BT.ticks - this.lastToggleTick >= TOGGLE_PERIOD_TICKS) {
            this.lastToggleTick = BT.ticks;
            this.enabled = !this.enabled;

            if (this.enabled) {
                // Add every effect from the preset to the chain. Each one declares its
                // own tier ('display' for the CRT effects), so the engine routes it
                // automatically.
                for (const fx of this.stack) {
                    BT.effectAdd(fx);
                }

                BT.assignTag('CRT: ON');
            } else {
                // Remove them all. When the last effect goes, the engine drops the
                // off-screen ping-pong textures and reverts to drawing straight through
                // the upscale pass to the swap chain.
                for (const fx of this.stack) {
                    BT.effectRemove(fx);
                }

                BT.assignTag('CRT: OFF');
            }
        }

        if (this.effectsAvailable) {
            // The CRT shaders use `time` for the rolling line, noise, and interference.
            // Feed it seconds. Safe to set even when the effects are not in the chain -
            // the field is just a number on the JS instance until the next encode pass
            // reads it.
            const seconds = BT.ticks / TARGET_FPS;

            for (const fx of this.timedEffects) {
                fx.time = seconds;
            }
        }

        // 2. Move each square and bounce it off the screen edges. New Vector2i instances
        // are assigned rather than components mutated; reassigning sq.pos and sq.vel is
        // fine for per-frame demo state.
        for (const sq of this.squares) {
            // Snapshot where the square was before moving it, so render() can draw a
            // smooth in-between position instead of a pop.
            sq.prevPos = sq.pos;

            sq.pos = new Vector2i(sq.pos.x + sq.vel.x, sq.pos.y + sq.vel.y);

            // Bounce against the left and right walls. The valid range is [0, DISPLAY_W -
            // SQUARE_SIZE] because the square's anchor is its top-left corner.
            if (sq.pos.x <= 0 || sq.pos.x >= DISPLAY_W - SQUARE_SIZE) {
                sq.vel = new Vector2i(-sq.vel.x, sq.vel.y);

                // Nudge the position back inside the playfield so it does not bounce
                // twice.
                sq.pos = new Vector2i(Math.max(0, Math.min(sq.pos.x, DISPLAY_W - SQUARE_SIZE)), sq.pos.y);
            }

            // Same for the top and bottom walls. The squares roam the full screen.
            if (sq.pos.y <= 0 || sq.pos.y >= DISPLAY_H - SQUARE_SIZE) {
                sq.vel = new Vector2i(sq.vel.x, -sq.vel.y);
                sq.pos = new Vector2i(sq.pos.x, Math.max(0, Math.min(sq.pos.y, DISPLAY_H - SQUARE_SIZE)));
            }
        }
    }

    render() {
        BT.clear(C_BG);

        // The high-contrast horizontal bars across the middle. They are static - the CRT
        // scanlines and shadow mask interact strongly with bright horizontals.
        for (let i = 0; i < BAR_COLORS.length; i++) {
            const y = BAR_TOP + i * (BAR_HEIGHT + BAR_GAP);
            BT.drawRectFill(new Rect2i(20, y, DISPLAY_W - 40, BAR_HEIGHT), BAR_COLORS[i]);
        }

        // The bouncing squares on top of the bars. Vector2i.lerp() blends prevPos toward
        // pos by BT.renderAlpha, so a square's drawn position matches this exact render
        // moment instead of only its last-tick position - smoother motion when render()
        // runs at a different rate than update().
        for (const sq of this.squares) {
            const drawPos = Vector2i.lerp(sq.prevPos, sq.pos, BT.renderAlpha);
            BT.drawRectFill(new Rect2i(drawPos.x, drawPos.y, SQUARE_SIZE, SQUARE_SIZE), sq.color);
        }

        // Status readout: a small panel from the shared UI kit, drawn last so it sits on
        // top of the moving squares. Like everything the demo draws, it lives on the
        // logical buffer, so the CRT effects warp and glow the panel too - a handy way to
        // read the toggle even when you cannot see the scanlines up close.
        ui.begin(UI_ANCHORS.TOP_LEFT);
        ui.panel();

        if (this.effectsAvailable) {
            // 'accent' (phosphor green) while the stack is live, 'dim' gray while it
            // rests.
            ui.label(this.enabled ? 'CRT: ON' : 'CRT: OFF', { color: this.enabled ? 'accent' : 'dim' });
            ui.label('Auto-toggles every 2s', { color: 'dim' });
        } else {
            // Software renderer: no post-processing at all, so explain the reduced mode.
            ui.label('CRT: N/A', { color: 'dim' });
            ui.label(SOFTWARE_FALLBACK_NOTE, { color: 'warm' });
        }

        ui.end();
    }
}

bootstrap(Demo);
