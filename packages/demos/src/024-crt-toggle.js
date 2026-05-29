// @pageTitle Blit-Tech Demo 024 - CRT Toggle
//
// Demo 024 - CRT Toggle: turn the post-process effects on and off in flight.
//
// Demo 024 in the Blit-Tech demo series.
// We learned about the demo loop in the Basics demo: https://vancura.dev/articles/blit-tech-basics
// We learned about post-processing in the PipBoy CRT demo: https://vancura.dev/articles/blit-tech-pipboy-crt
//
// Live article: https://vancura.dev/articles/blit-tech-crt-toggle
//
// WHAT YOU WILL SEE
// A colorful, simple scene - bouncing squares and a few horizontal bars. Every two seconds
// the CRT preset flips on and off automatically. Status text lives in the overlay. While it is on
// you see scanlines, the RGB shadow mask, smooth barrel curvature, and a soft phosphor
// glow; while it is off the pixels are exactly what the engine drew (no post-processing).
// The bouncing keeps going either way, so you can compare the two looks side by side.
//
// Notice that the lines stay STRAIGHT through the toggle: barrel distortion is display-tier,
// so it runs on RGBA after palette resolve + upscale to the canvas size - not on the
// 320x240 index buffer - which avoids stair-step artifacts on diagonals.
//
// WHAT YOU WILL LEARN
//   - How to add and remove a STACK of post-process effects at runtime.
//   - That the effect chain is "free" when nothing is registered: the engine renders straight
//     to the screen with zero extra cost. The first call to BT.effectAdd allocates an off-
//     screen texture; the last BT.effectRemove or BT.effectClear frees it again.
//   - That you keep the SAME effect instances across toggles. Demos that destroy and
//     recreate them on every toggle would also work, but they would re-create the GPU
//     pipeline on every toggle - wasteful when the look is the same.
//   - The convenience of `BT.preset.crtPipBoy()`: returns a fresh array of pre-configured
//     display-tier effects so you do not have to wire them up by hand.
//
// HOW THE TOGGLE WORKS
// We measure time in ticks (60 per second). Every TOGGLE_PERIOD_TICKS the demo flips a
// boolean and either adds or removes the entire preset stack. The overlay shows
// "CRT: ON" or "CRT: OFF" so you always know which side you are looking at.
//
// SOFTWARE FALLBACK
// In software renderer mode, post-process effects are unavailable. The bouncing
// squares and color bars still animate; CRT toggle is disabled and a note explains why.
//
// Why auto-toggle and not a button? Demos in this series do not (yet) take user input
// from the engine. Auto-toggling is the simplest way to demonstrate the dynamic API.

// #region Imports

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

import { isPostProcessAvailable, SOFTWARE_FALLBACK_NOTE } from './shared/post-process-backend.js';

// #endregion

// #region Configuration

// Internal pixel resolution.
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Output drawing-buffer resolution. Setting it 4x larger than the logical size unlocks
// the display-tier effects (barrel, scanlines, mask, etc.) and gives them enough output
// pixels to render smoothly. Each logical pixel maps to a 4x4 output block.
const OUTPUT_W = 1280;
const OUTPUT_H = 960;

const TARGET_FPS = 60;

// Palette indices. Index 0 is always transparent.
const C_BG = 1; // Dark navy: the background fill.
const C_LABEL = 2; // White: the corner label.
const C_RED = 3;
const C_GREEN = 4;
const C_BLUE = 5;
const C_YELLOW = 6;
const C_CYAN = 7;
const C_MAGENTA = 8;
const C_OVERLAY_BAR = 9; // Overlay row background

// The five colors used for the bouncing squares. We list them in order so each
// square gets a distinct color from the palette.
const SQUARE_COLORS = [C_RED, C_GREEN, C_BLUE, C_YELLOW, C_MAGENTA];

// How big each bouncing square is (in pixels).
const SQUARE_SIZE = 24;

// How many bouncing squares to show.
const SQUARE_COUNT = 5;

// How fast each square moves (pixels per tick). One value per square so the
// motion looks irregular - if all five moved at the same speed, they would
// line up vertically and the demo would look duller.
const SQUARE_SPEEDS = [
    new Vector2i(2, 1),
    new Vector2i(1, 2),
    new Vector2i(3, 1),
    new Vector2i(1, 3),
    new Vector2i(2, 2),
];

// How many ticks between toggles. 120 ticks at 60 FPS = 2 seconds per state.
// You should be able to read the "CRT: ON / OFF" label and watch the scene
// switch at a leisurely pace.
const TOGGLE_PERIOD_TICKS = 120;

// Static horizontal bars across the middle of the screen. They give the CRT scanlines
// something high-contrast to chew on so the difference between ON and OFF is obvious.
const BAR_HEIGHT = 18;
const BAR_GAP = 6;
const BAR_TOP = 60;
const BAR_COLORS = [C_RED, C_YELLOW, C_GREEN, C_CYAN, C_BLUE, C_MAGENTA];

// #endregion

// #region Type Definitions

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #endregion

// #region Main Logic

/**
 * Toggle demo: a small animated scene with the CRT effect stack flipping on and off
 * every two seconds. Demonstrates the dynamic add/remove path of the post-process chain.
 *
 * The effect stack comes from `BT.preset.crtPipBoy()`, a one-line helper that returns a
 * fresh array of display-tier effects (BarrelDistortion + ChromaticAberration + ... +
 * Bloom). We hold onto the array so we can re-add the SAME instances on each toggle -
 * that way the GPU pipelines stay alive across toggles instead of being torn down and
 * rebuilt every two seconds.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // Reused every frame for the overlay (CRT status + hint).
    overlayRowData = [
        { leftText: 'CRT: OFF', textPaletteIndex: C_LABEL },
        { leftText: 'Auto-toggles every 2s', textPaletteIndex: C_LABEL },
    ];

    configure() {
        return {
            // Internal pixel-art resolution. Game logic and draws operate at this size.
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // drawingBufferSize is required for display-tier effects (barrel, scanlines,
            // mask, bloom). Flow: draw palette indices at 320x240, optional pixel-tier on
            // that r8uint buffer, then the engine resolves indices through the palette LUT
            // and upscales to RGBA at this size, then the display chain runs on RGBA.
            // Without this field, BT.effectAdd would throw for display-tier effects.
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // Match output buffer size so the CRT picture is not capped at 960x720 CSS.
            maxCanvasSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // 'nearest' keeps each source pixel as a crisp 4x4 block. 'linear' would
            // soften them into bilinear-blended squishes - a different look, also valid.
            outputUpscaleFilter: 'nearest',

            targetFPS: TARGET_FPS,

            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_LABEL,
            },
        };
    }

    async init() {
        // Step 1: build the palette
        // A small, colorful palette. Bright primaries make the CRT effect visually
        // obvious - soft pastels would look the same with or without.
        const palette = BT.paletteCreate(16);
        palette.set(C_BG, new Color32(20, 30, 50, 255));
        palette.set(C_LABEL, Color32.white);
        palette.set(C_RED, Color32.red);
        palette.set(C_GREEN, Color32.green);
        palette.set(C_BLUE, Color32.blue);
        palette.set(C_YELLOW, Color32.yellow);
        palette.set(C_CYAN, Color32.cyan);
        palette.set(C_MAGENTA, Color32.magenta);
        palette.set(C_OVERLAY_BAR, new Color32(10, 15, 25, 220));
        BT.paletteSet(palette);

        this.postProcessAvailable = isPostProcessAvailable();

        if (this.postProcessAvailable) {
            // Step 2: build the CRT preset ONCE up front
            // BT.preset.crtPipBoy() returns a fresh array of pre-configured display-tier
            // effects (BarrelDistortion + ChromaticAberration + Interference + RollLine +
            // Scanlines + RGBMask + Vignette + Noise + Flicker + Bloom).
            //
            // We hold onto the array so we can re-add the SAME instances on each toggle.
            // Re-creating them every toggle would also work, but it would re-allocate the
            // GPU pipelines and uniform buffers each time - wasteful when the look is the
            // same.
            this.crtStack = BT.preset.crtPipBoy();

            // Step 3: pick out the time-driven effects so update() can animate them
            // Some effects (RollLine, Noise, Interference) animate using a `time` field;
            // we filter the array once and remember the references so we don't iterate
            // the whole stack on every frame.
            this.timedEffects = this.crtStack.filter((fx) => 'time' in fx);
        } else {
            this.crtStack = [];
            this.timedEffects = [];
        }

        // Step 4: start in the OFF state
        // Demo 023 already shows what the CRT looks like straight away; here it's nicer
        // to begin clean and then have the effect arrive after the first toggle.
        this.crtEnabled = false;
        this.lastToggleTick = BT.ticks;

        // Step 5: place the bouncing squares
        // Place them evenly across the bottom half so they don't all start in the same
        // spot. Each square keeps its own position (pos) and velocity (vel) as Vector2i
        // instances - the engine convention for all pixel-level coordinates.
        this.squares = [];
        for (let i = 0; i < SQUARE_COUNT; i++) {
            this.squares.push({
                pos: new Vector2i(20 + i * 50, 150 + (i % 2) * 30),
                vel: new Vector2i(SQUARE_SPEEDS[i].x, SQUARE_SPEEDS[i].y),
                color: SQUARE_COLORS[i % SQUARE_COLORS.length],
            });
        }

        return true;
    }

    update() {
        // 1. Time-based toggle (WebGPU only - effectAdd throws in software mode)
        // Every TOGGLE_PERIOD_TICKS we flip the boolean and either add or remove the
        // entire preset stack. The engine handles the GPU pipeline lifecycle for us.
        if (this.postProcessAvailable && BT.ticks - this.lastToggleTick >= TOGGLE_PERIOD_TICKS) {
            this.lastToggleTick = BT.ticks;
            this.crtEnabled = !this.crtEnabled;
            if (this.crtEnabled) {
                // Add every effect from the preset to the chain. Each one declares its
                // own tier ('display' for the CRT effects), so the engine routes them
                // automatically.
                for (const fx of this.crtStack) {
                    BT.effectAdd(fx);
                }
            } else {
                // Remove them all. When the last effect is removed, the engine drops
                // the off-screen ping-pong textures and reverts to drawing straight
                // through the upscale pass to the swap chain.
                for (const fx of this.crtStack) {
                    BT.effectRemove(fx);
                }
            }
        }

        if (this.postProcessAvailable) {
            // The CRT shaders use `time` for their rolling line and noise. Feed it seconds.
            // Safe to set even when the effects are not in the chain - the field is just a
            // number on the JS instance until the next encode pass reads it.
            const seconds = BT.ticks / TARGET_FPS;
            for (const fx of this.timedEffects) {
                fx.time = seconds;
            }
        }

        // 2. Move each square and bounce off the screen edges
        // Vector2i is immutable, so we assign new instances rather than mutating components.
        // Reassigning sq.pos and sq.vel is allowed for per-frame demo state (see CLAUDE.md).
        for (const sq of this.squares) {
            sq.pos = new Vector2i(sq.pos.x + sq.vel.x, sq.pos.y + sq.vel.y);

            // Bounce against the left/right walls. We compare against [0, DISPLAY_W - SQUARE_SIZE]
            // because the square's anchor is its top-left corner.
            if (sq.pos.x <= 0 || sq.pos.x >= DISPLAY_W - SQUARE_SIZE) {
                sq.vel = new Vector2i(-sq.vel.x, sq.vel.y);
                // Nudge the position back inside the playfield so we don't bounce twice.
                sq.pos = new Vector2i(Math.max(0, Math.min(sq.pos.x, DISPLAY_W - SQUARE_SIZE)), sq.pos.y);
            }

            // Same for the top/bottom walls. We let the squares roam the full screen.
            if (sq.pos.y <= 0 || sq.pos.y >= DISPLAY_H - SQUARE_SIZE) {
                sq.vel = new Vector2i(sq.vel.x, -sq.vel.y);
                sq.pos = new Vector2i(sq.pos.x, Math.max(0, Math.min(sq.pos.y, DISPLAY_H - SQUARE_SIZE)));
            }
        }
    }

    /**
     * CRT on/off status and backend hint for the engine overlay.
     *
     * @returns {readonly { leftText: string }[]}
     */
    overlayRows() {
        this.overlayRowData[0].leftText = this.postProcessAvailable
            ? this.crtEnabled
                ? 'CRT: ON'
                : 'CRT: OFF'
            : 'CRT: N/A';
        this.overlayRowData[1].leftText = this.postProcessAvailable ? 'Auto-toggles every 2s' : SOFTWARE_FALLBACK_NOTE;

        return this.overlayRowData;
    }

    render() {
        BT.clear(C_BG);

        // Draw the high-contrast horizontal bars across the middle. They're static -
        // the CRT scanlines and shadow mask interact strongly with bright horizontals.
        for (let i = 0; i < BAR_COLORS.length; i++) {
            const y = BAR_TOP + i * (BAR_HEIGHT + BAR_GAP);
            BT.drawRectFill(new Rect2i(20, y, DISPLAY_W - 40, BAR_HEIGHT), BAR_COLORS[i]);
        }

        // Draw the bouncing squares on top of the bars.
        for (const sq of this.squares) {
            BT.drawRectFill(new Rect2i(sq.pos.x, sq.pos.y, SQUARE_SIZE, SQUARE_SIZE), sq.color);
        }

        // CRT status and hints are drawn in overlayRows() above the FPS bar.
    }
}

bootstrap(Demo);

// #endregion

// #region Exports

// #endregion
