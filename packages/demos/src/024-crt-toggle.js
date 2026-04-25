// @pageTitle Blit-Tech Demo 024 - CRT Toggle
//
// Demo 024 -- CRT Toggle: turn the post-process effect on and off in flight.
//
// Demo 024 in the Blit-Tech demo series.
// We learned about the demo loop in the Basics demo: https://vancura.dev/articles/blit-tech-basics
// We learned about post-processing in the PipBoy CRT demo: https://vancura.dev/articles/blit-tech-pipboy-crt
//
// Live article: https://vancura.dev/articles/blit-tech-crt-toggle
//
// WHAT YOU WILL SEE
// A colorful, simple scene -- bouncing squares, a few horizontal bars, and a label in the
// corner. Every two seconds the CRT effect flips on and off automatically. While it is on
// you see scanlines, the RGB shadow mask, and gentle screen curvature; while it is off the
// pixels are exactly what the engine drew (no post-processing). The bouncing keeps going
// either way, so you can compare the two looks side by side over time.
//
// WHAT YOU WILL LEARN
//   - How to add and remove a post-process effect at runtime with BT.effectAdd / BT.effectRemove.
//   - That the effect chain is "free" when nothing is registered: the engine renders straight
//     to the screen with zero extra cost. The first call to BT.effectAdd allocates an off-
//     screen texture; the last BT.effectRemove or BT.effectClear frees it again.
//   - That you keep the SAME PipBoyEffect instance across toggles. Demos that destroy and
//     recreate it on every toggle would also work, but they would re-create the GPU pipeline
//     on every toggle -- wasteful when the effect is the same.
//
// HOW THE TOGGLE WORKS
// We measure time in ticks (60 per second). Every TOGGLE_PERIOD_TICKS the demo flips a
// boolean and either calls BT.effectAdd(this.crt) or BT.effectRemove(this.crt). The label
// in the top-left corner reads "CRT: ON" or "CRT: OFF" so you always know which side you
// are looking at.
//
// Why auto-toggle and not a button? Demos in this series do not (yet) take user input
// from the engine. Auto-toggling is the simplest way to demonstrate the dynamic API.

// #region Imports

import { bootstrap, BT, Color32, PipBoyEffect, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #endregion

// #region Configuration

// Internal pixel resolution.
const DISPLAY_W = 320;
const DISPLAY_H = 240;
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

// The five colors used for the bouncing squares. We list them in order so each
// square gets a distinct color from the palette.
const SQUARE_COLORS = [C_RED, C_GREEN, C_BLUE, C_YELLOW, C_MAGENTA];

// How big each bouncing square is (in pixels).
const SQUARE_SIZE = 24;

// How many bouncing squares to show.
const SQUARE_COUNT = 5;

// How fast each square moves (pixels per tick). One value per square so the
// motion looks irregular -- if all five moved at the same speed, they would
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

// #region Main Logic

/**
 * Toggle demo: a small animated scene with the CRT effect flipping on and off
 * every two seconds. Demonstrates the dynamic add/remove path of the post-
 * process chain.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    queryHardware() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            targetFPS: TARGET_FPS,
        };
    }

    async initialize() {
        // Build a small, colorful palette. Bright primaries make the CRT effect
        // visually obvious -- soft pastels would look the same with or without.
        const palette = BT.paletteCreate(16);
        palette.set(C_BG, new Color32(20, 30, 50, 255));
        palette.set(C_LABEL, Color32.white());
        palette.set(C_RED, Color32.red());
        palette.set(C_GREEN, Color32.green());
        palette.set(C_BLUE, Color32.blue());
        palette.set(C_YELLOW, Color32.yellow());
        palette.set(C_CYAN, Color32.cyan());
        palette.set(C_MAGENTA, Color32.magenta());
        BT.paletteSet(palette);

        // Create the CRT effect instance ONCE, up front. We will call BT.effectAdd /
        // BT.effectRemove on this same instance every two seconds. The instance keeps
        // its pipeline + uniform buffer alive across toggles -- only the chain's
        // off-screen render target is allocated/freed by the add/remove calls.
        this.crt = new PipBoyEffect();

        // Tune the look: a little less curvature than default so the demo still feels
        // "honest" about which pixels you're seeing, plus a bit more mask intensity so
        // the CRT half is unmistakable.
        this.crt.screenCurvature = 0.015;
        this.crt.maskIntensity = 0.2;

        // Start in the OFF state. Demo 023 already shows what the CRT looks like
        // straight away; here it's nicer to begin clean and then have the effect arrive.
        this.crtEnabled = false;
        this.lastToggleTick = BT.ticks();

        // Place the squares evenly across the top half so they don't all start in the
        // same spot. Each square keeps its own position (x, y) and a copy of its speed
        // (we'll flip the speed components when it bounces off an edge).
        this.squares = [];
        for (let i = 0; i < SQUARE_COUNT; i++) {
            this.squares.push({
                x: 20 + i * 50,
                y: 150 + (i % 2) * 30,
                vx: SQUARE_SPEEDS[i].x,
                vy: SQUARE_SPEEDS[i].y,
                color: SQUARE_COLORS[i % SQUARE_COLORS.length],
            });
        }

        return true;
    }

    update() {
        // ---- 1. Time-based toggle ----
        // Every TOGGLE_PERIOD_TICKS we flip the boolean and either add or remove
        // the CRT instance from the chain. The engine handles the rest.
        if (BT.ticks() - this.lastToggleTick >= TOGGLE_PERIOD_TICKS) {
            this.lastToggleTick = BT.ticks();
            this.crtEnabled = !this.crtEnabled;
            if (this.crtEnabled) {
                BT.effectAdd(this.crt);
            } else {
                BT.effectRemove(this.crt);
            }
        }

        // The CRT shader uses `time` for its rolling line and noise; feed it seconds.
        // Safe to set even when the effect is not in the chain -- the field is just
        // a number on the JS instance until the next encode pass reads it.
        this.crt.time = BT.ticks() / TARGET_FPS;

        // ---- 2. Move each square and bounce off the screen edges ----
        // Mutating per-frame state directly is allowed in demos (see CLAUDE.md) -- it
        // avoids per-frame allocations.
        for (const sq of this.squares) {
            sq.x += sq.vx;
            sq.y += sq.vy;

            // Bounce against the left/right walls. We compare against [0, DISPLAY_W - SQUARE_SIZE]
            // because the square's anchor is its top-left corner.
            if (sq.x <= 0 || sq.x >= DISPLAY_W - SQUARE_SIZE) {
                sq.vx = -sq.vx;
                // Nudge the position back inside the playfield so we don't bounce twice.
                sq.x = Math.max(0, Math.min(sq.x, DISPLAY_W - SQUARE_SIZE));
            }

            // Same for the top/bottom walls. We let the squares roam the full screen.
            if (sq.y <= 0 || sq.y >= DISPLAY_H - SQUARE_SIZE) {
                sq.vy = -sq.vy;
                sq.y = Math.max(0, Math.min(sq.y, DISPLAY_H - SQUARE_SIZE));
            }
        }
    }

    render() {
        BT.clear(C_BG);

        // Draw the high-contrast horizontal bars across the middle. They're static --
        // the CRT scanlines and shadow mask interact strongly with bright horizontals.
        for (let i = 0; i < BAR_COLORS.length; i++) {
            const y = BAR_TOP + i * (BAR_HEIGHT + BAR_GAP);
            BT.drawRectFill(new Rect2i(20, y, DISPLAY_W - 40, BAR_HEIGHT), BAR_COLORS[i]);
        }

        // Draw the bouncing squares on top of the bars.
        for (const sq of this.squares) {
            BT.drawRectFill(new Rect2i(sq.x, sq.y, SQUARE_SIZE, SQUARE_SIZE), sq.color);
        }

        // Status label in the top-left corner. BT.systemPrint uses the built-in
        // 6x14 font so we don't need to load anything.
        const label = this.crtEnabled ? 'CRT: ON' : 'CRT: OFF';
        BT.systemPrint(new Vector2i(8, 8), C_LABEL, label);

        // Hint about how to read the demo. Helps a first-time viewer understand
        // why the picture changes every two seconds.
        BT.systemPrint(new Vector2i(8, DISPLAY_H - 22), C_LABEL, 'Auto-toggles every 2s');
    }
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
