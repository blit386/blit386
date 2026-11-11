/*

Basics Enhanced: the Basics bouncing sprite behind the PipBoy CRT post-process chain.
@description The bouncing sprite from Basics again, with optional visual effects over the same PipBoy palette.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - PipBoy CRT: https://demos.blit386.dev/crt-pipboy
  - CRT Toggle: https://demos.blit386.dev/crt-toggle

Live version: https://demos.blit386.dev/basics-enhanced

Guides:
  - Post-Process Effects: https://blit386.dev/docs/guides/post-process-effects#pixel-tier-effects
  - Game Loop: https://blit386.dev/docs/guides/game-loop#smoothing-motion-between-updates
  - Overlay: https://blit386.dev/docs/guides/overlay#custom-rows

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#post-process-effects
  - Game Loop: https://blit386.dev/docs/api/game-loop#interpolating-render-state-with-renderalpha
  - Overlay: https://blit386.dev/docs/api/overlay#custom-rows-optional

---

WHAT YOU WILL SEE
-----------------

The same scene as Basics: the 32x28 BLIT386 logo bouncing around a 320x240 PipBoy-green
screen at 30 ticks per second, with a dim UI kit hint in the top-left corner. Under WebGPU
the whole frame is additionally routed through eleven post-process effects: a curved tube,
scanlines, an RGB mask, vignette, grain, flicker, bloom, a slow roll line, and - every few
seconds - a short glitch burst that tears, splits, snows, dims, or ghosts the picture for
a fraction of a second before the screen settles again.

The engine overlay (Backquote) carries four custom rows: Position, Bounces, CRT stack
ON/OFF, and the current glitch type with its strength in percent. Each wall hit drops an
"H" or "V" tag on the timing chart.

WHAT YOU WILL LEARN
-------------------

- The two post-process tiers and why they differ:
  1. Pixel tier - runs on the logical index buffer (320x240 palette indices, before the
     palette is resolved into RGB). Effects here distort the indexed image itself. Only
     PixelGlitch sits here.
  2. Display tier - runs after the palette is resolved and the image is upscaled to
     drawingBufferSize (960x720 here, 3x logical). Effects here work in full-color RGB
     and can blur, warp, tint, and bloom the final image. The other ten effects in this
     demo live here.
- Why compose ten display-tier effects instead of calling BT.preset.crtPipBoy() as CRT
  Toggle does: keeping each effect object lets update() drive individual uniforms from a
  state machine. The stack comes from createPipboyChain() and the machine from
  stepGlitchMachine(), both shared with the PipBoy CRT and Snake demos in
  src/shared/crt-glitch.js; PipBoy CRT wires the same stack by hand, one parameter at a
  time. The machine picks one of five glitch types, ramps it up over a sine envelope,
  and ramps it down again.
- BT.effectAdd(effect) registers effects in draw order: the first added runs first.
- Animated effects (RollLine, Noise, Interference) need BT.timeSeconds fed into their
  time uniform every tick.
- BT.isReducedMotionPreferred: applyCrtChain() leaves the moving effects (grain,
  flicker, roll line, interference) out and the glitch bursts stay off, and
  onReducedMotionChange() rebuilds the chain when the preference changes.
- Smoothing a 30-tick-per-second simulation with BT.renderAlpha and Vector2i.lerp, the
  same fix Basics explains in detail.
- Overlay customization: overlayStyle, overlayTimingChartStyle, overlayRows(), and
  BT.assignTag().

SOFTWARE FALLBACK
-----------------

Post-process needs WebGPU. Under the software renderer the bouncing sprite still runs, but
no effect is registered, the glitch state machine never starts, and a warm two-line note
drawn with the shared UI kit (src/shared/ui.js) plus the "CRT stack OFF (software)"
overlay row explain the reduced mode.

TRY THIS
--------

- Press Backquote (`) or click/tap the symbol in the bottom-left corner of the canvas to
  open the engine overlay. Watch the Glitch row during a burst: the label names the fault
  (H-HOLD, CHROMA, SNOW, DIM, GHOST) and the percentage is its rolled peak strength.
- Bursts arrive every 4-12 seconds and last 0.17-1 second (120-360 and 5-30 ticks at 30
  ticks per second).
- Add ?backend=software to the URL to see the fallback path.

*/

import { bootstrap, BT, Color32, SpriteSheet, Vector2i } from 'blit386';

import {
    applyCrtChain,
    createPipboyChain,
    GLITCH_COOLDOWN_MAX,
    GLITCH_COOLDOWN_MIN,
    GLITCH_LABELS,
    GLITCH_TYPE,
    resetGlitchUniforms,
    stepGlitchMachine,
} from './shared/crt-glitch.js';
import { isAvailable, SOFTWARE_FALLBACK_LINES } from './shared/post-process-backend.js';
import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').Rect2i} Rect2i */

// Palette slots match the Basics demo so the two demos read as the same scene.
const C_BG = 1; // almost-black with a faint green tint
const C_OVERLAY_BAR = 2; // bar behind overlay custom rows
const C_OVERLAY_GREEN = 3; // PipBoy green (position, CRT status)
const C_OVERLAY_AMBER = 4; // amber accent (bounces, glitch readout)
const C_OVERLAY_ERROR = 5; // red tint for timing-chart error markers

const SPRITE_BASE = 10;
const SPRITE_URL = '/sprites/logo-1.png';
const TARGET_FPS = 30;

// Logical screen size. The scanlines get one dark band per logical row (DISPLAY_H).
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Barrel distortion strength: how strongly the picture bulges like curved glass.
const CRT_CURVATURE = 0.05;

// The display-tier chain runs on an output buffer larger than the logical screen: 3x.
const OUTPUT_W = 960;
const OUTPUT_H = 720;

// The Basics demo plus a hand-built CRT post-process chain and periodic glitch bursts.
class Demo {
    // --- Bouncing sprite (same roles as the Basics demo) ---

    // Top-left corner of the logo on screen, in whole pixels.
    pos = new Vector2i(160, 120);

    // Pixels the logo moves per update() tick, x and y separately.
    speed = new Vector2i(1, 1);

    // Logo position at the start of the most recent update() tick, before that tick moved
    // it. render() blends between this and pos using BT.renderAlpha so the logo glides
    // between ticks instead of jumping - the same fix as Basics, whose render() comment
    // explains why targetFPS 30 makes the stutter especially visible.
    prevPos = new Vector2i(160, 120);

    // Logo width and height in pixels; filled from the loaded PNG in init().
    size = new Vector2i(16, 16);

    // Counts wall hits so overlayRows() can show a running total.
    bounces = 0;

    // Every color this demo draws with; built in init().
    /** @type {Palette | null} */
    palette = null;

    // Loaded indexed sprite sheet (GPU texture plus palette mapping).
    /** @type {SpriteSheet | null} */
    spriteSheet = null;

    // Which rectangle inside the PNG to draw: the full image for this logo.
    /** @type {Rect2i | null} */
    spriteRect = null;

    // --- Post-process effects (WebGPU only) ---

    // createPipboyChain() in init() stores each effect on the demo by name: pixelGlitch
    // (pixel tier, shifts bands of the index buffer before palette resolve) and barrel,
    // aberration, interference, rollLine, scanlines, mask, vignette, noise, flicker, and
    // bloom (display tier, on the upscaled RGBA buffer). crtEffects keeps the
    // display-tier ones in chain order so applyCrtChain() can rebuild the chain.
    crtEffects = [];

    // --- Glitch state machine (same idea as the PipBoy CRT demo) ---

    // Ticks until the next random glitch burst starts; counts down while idle.
    glitchCooldown = 0;

    // Ticks remaining in the current burst; 0 means a calm screen.
    glitchTicksLeft = 0;

    // How long this burst was scheduled to last, used for the fade envelope.
    glitchDuration = 0;

    // Which glitch type is active: GLITCH_TYPE.NONE or one of GLITCH_TYPES_CHROMA.
    glitchType = GLITCH_TYPE.NONE;

    // Peak strength rolled for this burst, 0..1 before the envelope is applied.
    glitchPeak = 0;

    // True when WebGPU post-process is available; false in the software fallback.
    effectsAvailable = false;

    // Reused every frame for overlayRows(): position, bounces, CRT status, glitch
    // readout.
    overlayRowData = [
        { leftText: 'Position (0, 0)', textPaletteIndex: C_OVERLAY_GREEN },
        { leftText: 'Bounces 0', textPaletteIndex: C_OVERLAY_AMBER },
        { leftText: 'CRT stack OFF', textPaletteIndex: C_OVERLAY_GREEN },
        { leftText: 'Glitch NONE', textPaletteIndex: C_OVERLAY_AMBER },
    ];

    // Sets the logical screen, the 3x output buffer the CRT chain runs on, 30 ticks per
    // second, and the overlay's colors and timing chart.
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            // The display-tier CRT runs on the upscaled RGBA buffer, 3x logical here.
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),
            // The demos layout may scale the canvas up to 4x logical on screen; the
            // engine default cap is 960x720.
            maxCanvasSize: new Vector2i(DISPLAY_W * 4, DISPLAY_H * 4),
            outputUpscaleFilter: 'nearest',
            targetFPS: TARGET_FPS,
            isDetectingDroppedFrames: true,
            // Opt in to the overlay timing chart (update vs render CPU bars above the
            // FPS row). Bar colors default to overlayStyle; explicit indices keep them
            // on this palette.
            isOverlayTimingChartEnabled: true,
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_OVERLAY_GREEN,
                gapPaletteIndex: C_OVERLAY_BAR,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_OVERLAY_GREEN,
                renderBarPaletteIndex: C_OVERLAY_AMBER,
                warningPaletteIndex: C_OVERLAY_AMBER,
                errorPaletteIndex: C_OVERLAY_ERROR,
                tagPaletteIndex: C_OVERLAY_GREEN,
            },
        };
    }

    // Builds the palette, loads the logo, and (under WebGPU) sets up the CRT chain and
    // the first glitch countdown.
    async init() {
        // --- Palette (matches the Basics demo PipBoy green scene) ---
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(16, 28, 16));
        this.palette.set(C_OVERLAY_BAR, new Color32(24, 44, 28));
        this.palette.set(C_OVERLAY_GREEN, new Color32(80, 200, 110));
        this.palette.set(C_OVERLAY_AMBER, new Color32(220, 180, 60));
        this.palette.set(C_OVERLAY_ERROR, new Color32(200, 70, 70));

        // --- Sprite load (the same single call as the Basics demo) ---
        // loadIndexed copies every unique color of the PNG into palette slots from
        // SPRITE_BASE up (sort: 'none' keeps them in the order they appear), then builds
        // the GPU sheet plus a full-image source rectangle.
        const indexed = await SpriteSheet.loadIndexed(SPRITE_URL, this.palette, SPRITE_BASE, { sort: 'none' });
        this.spriteSheet = indexed.sheet;
        this.spriteRect = indexed.srcRect;

        // Install the shared UI kit colors. The scene owns slots 1-5 and the logo owns
        // slots from SPRITE_BASE up, so the kit's default range (240-251, at the top of
        // the palette) is free. The kit colors are only for the on-canvas hint and
        // fallback note drawn in render().
        applyTheme(this.palette);

        BT.paletteSet(this.palette);

        this.size = new Vector2i(this.spriteSheet.size.x, this.spriteSheet.size.y);
        this.pos = new Vector2i(
            Math.floor(BT.displaySize.x / 2 - this.size.x / 2),
            Math.floor(BT.displaySize.y / 2 - this.size.y / 2),
        );

        // Keep prevPos in sync with the real starting position so the very first render()
        // does not slide in from the (160, 120) placeholder.
        this.prevPos = this.pos;

        // Post-process requires WebGPU; the software renderer skips the whole CRT stack.
        this.effectsAvailable = isAvailable();

        if (!this.effectsAvailable) {
            // Software renderer: update() never runs the glitch machine, so there is
            // nothing to seed.
            return true;
        }

        // --- The PipBoy CRT stack ---
        // The pixel-tier glitch runs on the index buffer, so it is added on its own. The
        // display-tier list goes through applyCrtChain(), which registers it in draw
        // order (the first added runs first) and leaves out the moving effects while the
        // player prefers reduced motion. The glitch machine changes aberration,
        // interference, noise, and flicker during a burst and restores them afterwards.
        this.crtEffects = createPipboyChain(this, CRT_CURVATURE, DISPLAY_H);
        BT.effectAdd(this.pixelGlitch);
        applyCrtChain(this.crtEffects);

        // BT.random is the engine's shared random number generator. int(min, max) returns
        // a whole number from min up to but not including max, so this waits a random
        // number of ticks before the first burst.
        this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchTicksLeft = 0;
        this.glitchDuration = 0;
        this.glitchType = GLITCH_TYPE.NONE;
        this.glitchPeak = 0;

        return true;
    }

    // Moves the logo, then (under WebGPU) feeds the CRT clock and runs the glitch
    // machine.
    update() {
        // --- Bounce logic (same rules as Basics; game logic lives only in update()) ---
        // Remember where the logo was before this tick moves it, so render() can draw a
        // smooth in-between position instead of a pop.
        this.prevPos = this.pos;

        // Move the logo by adding speed to position: one step per tick.
        this.pos = this.pos.add(this.speed);

        // Left/right wall test. pos is the sprite's top-left corner, so the right edge is
        // at pos.x + size.x, compared against displaySize.x - size.x.
        if (this.pos.x <= 0 || this.pos.x >= BT.displaySize.x - this.size.x) {
            // Flip the horizontal direction.
            this.speed.x = -this.speed.x;
            this.bounces++;
            BT.assignTag('H');
        }

        // Top/bottom wall test uses the same idea on the y axis.
        if (this.pos.y <= 0 || this.pos.y >= BT.displaySize.y - this.size.y) {
            this.speed.y = -this.speed.y;
            this.bounces++;
            BT.assignTag('V');
        }

        // The software renderer has no CRT chain, so there is nothing more to drive.
        if (!this.effectsAvailable) {
            return;
        }

        // Animated CRT uniforms need elapsed time, fed every tick.
        const seconds = BT.timeSeconds;
        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;

        // One tick of the glitch state machine (the PipBoy CRT demo's pattern): ramp a
        // running burst over its envelope, or count down and roll the next one. The
        // bursts stay off while the player prefers reduced motion.
        if (!BT.isReducedMotionPreferred) {
            stepGlitchMachine(this);
        }
    }

    // Clears the screen, draws the logo at its smoothed position, and prints the hint.
    render() {
        // Clear the logical framebuffer to the PipBoy background color (slot C_BG, set in
        // init()).
        BT.clear(C_BG);

        // Blend prevPos toward pos by BT.renderAlpha to get the logo's position at this
        // exact render moment instead of only its last-tick position. Same fix, same
        // reason as the Basics demo.
        const drawPos = Vector2i.lerp(this.prevPos, this.pos, BT.renderAlpha);

        // Draw the logo at its smoothed position. paletteOffset 0 keeps the sprite's
        // original indexed colors from SPRITE_BASE.
        BT.drawSprite(this.spriteSheet, this.spriteRect, drawPos, 0);

        // On-canvas text drawn with the shared UI kit: a borderless label group (no
        // ui.panel() call, so no box) pinned to the top-left corner. A small margin and
        // padding keep it tucked near the edge.
        ui.begin(UI_ANCHORS.TOP_LEFT, { margin: 2, pad: 2 });

        // Hint: the engine overlay (FPS, position, CRT status) toggles with Backquote or
        // the small symbol in the bottom-left corner of the canvas.
        ui.label('Press ~ or click/tap the symbol below', { color: 'dim' });

        // Software renderer: warn that the CRT look is missing. The shared note comes as
        // two lines (SOFTWARE_FALLBACK_LINES) so it fits the screen width.
        if (!this.effectsAvailable) {
            for (const line of SOFTWARE_FALLBACK_LINES) {
                ui.label(line, { color: 'warm' });
            }
        }

        ui.end();

        // Position, bounces, CRT stack, and glitch readout live in overlayRows(), not
        // here. After this pass finishes, WebGPU runs the CRT post-process chain on the
        // result.
    }

    // The engine calls this when the reduced-motion preference changes while the demo
    // runs. A burst in flight is cut short so the screen settles at once, and the chain
    // is rebuilt with or without the moving effects.
    onReducedMotionChange() {
        if (!this.effectsAvailable) {
            return;
        }

        if (this.glitchTicksLeft > 0) {
            this.glitchTicksLeft = 0;
            this.glitchType = GLITCH_TYPE.NONE;
            resetGlitchUniforms(this);
        }

        applyCrtChain(this.crtEffects);
    }

    // Position, bounces, CRT status, and glitch readout: the Basics rows plus two more.
    overlayRows() {
        this.overlayRowData[0].leftText = `Position (${this.pos.x}, ${this.pos.y})`;
        this.overlayRowData[1].leftText = `Bounces ${this.bounces}`;

        if (this.effectsAvailable) {
            this.overlayRowData[2].leftText = 'CRT stack ON';
            const glitchLabel = GLITCH_LABELS[this.glitchType] ?? 'NONE';
            const glitchValue = this.glitchTicksLeft > 0 ? Math.round(this.glitchPeak * 100) : 0;
            this.overlayRowData[3].leftText = `Glitch ${glitchLabel} ${String(glitchValue).padStart(2, '0')}%`;
        } else {
            // Software renderer: no CRT stack, so the glitch machine never fires. The
            // full explanation lives on the canvas itself (see render()), not in the
            // overlay.
            this.overlayRowData[2].leftText = 'CRT stack OFF (software)';
            this.overlayRowData[3].leftText = 'Glitch NONE';
        }

        return this.overlayRowData;
    }
}

bootstrap(Demo);
