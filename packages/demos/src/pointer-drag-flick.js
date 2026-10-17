/*

Pointer Drag Flick: grab bouncing balls, drag them around, and release to throw.
@description Grab one of three bouncing balls, drag it, and release to throw it, with synthesized sound effects.
@ogScale integer

Part of the BLIT386 demo series.

Prerequisites:
  - Pointer Basics: https://demos.blit386.dev/pointer-basics
  - Pointer Paint: https://demos.blit386.dev/pointer-paint

Live version: https://demos.blit386.dev/pointer-drag-flick

Guides:
  - Input: https://blit386.dev/docs/guides/input#buttons
  - Game Loop: https://blit386.dev/docs/guides/game-loop#smoothing-motion-between-updates
  - Audio: https://blit386.dev/docs/guides/audio#design-a-sound

Reference:
  - Game Loop: https://blit386.dev/docs/api/game-loop#interpolating-render-state-with-renderalpha
  - Audio: https://blit386.dev/docs/api/audio#synth
  - Overlay: https://blit386.dev/docs/api/overlay#event-tags

---

WHAT YOU WILL SEE
-----------------

Three colored balls (red, green, blue) bouncing around inside a closed box under gravity.
The full-width title strip along the top is the ceiling of that box; the floor and side
walls are the screen edges. A small "Grabs" panel sits in the top-right corner with one
pip per pointer slot (M for the mouse, T1 to T3 for fingers), lit while that slot holds a
ball. Each active pointer shows a tiny crosshair. Hovering the mouse over a free ball
draws a thin amber ring around it; a grabbed ball gets a white ring.

While sound is still locked, the title strip also shows the shared "enable sound" hint;
it disappears on the first grab.

WHAT YOU WILL LEARN
-------------------

- BT.isPressed(BT.BTN_POINTER_A, slot) as a "grab" edge: true only on the tick the
  button (or finger) goes down, so the drag starts exactly once.
- BT.isReleased(BT.BTN_POINTER_A, slot) as a "throw" edge: true only on the tick the
  button comes up. The engine keeps a touch slot's position and delta on release, so the
  release tick can still read them.
- BT.pointerDelta(slot) driving the simulation: the release-tick delta becomes the ball's
  launch velocity, scaled by THROW_SCALE and capped at MAX_THROW_SPEED.
- Smooth motion between fixed updates: each ball remembers where it was before the last
  physics tick, and render() blends that toward the new position by BT.renderAlpha.
- Two sounds built with AudioClip.synth() (the technique Synth Toy explores in depth): a
  whoosh whose pitch and volume scale with throw speed, and a thud on hard wall hits.
  Both play through BT.soundPlay(clip, { pitch, volume }).
- A tiny physics step per tick: gravity, air drag, floor friction, damped wall bounces.
- BT.assignTag() marks every throw on the overlay's timing chart.

TRY THIS
--------

- Press and hold the left mouse button on a ball to grab it, move it around, then let go
  while moving to throw it. A faster flick makes a higher, louder whoosh.
- On a touchscreen, each finger can grab its own ball - up to three at once (slots 1-3).
- Drop a ball from high up and listen: hard landings thud, gentle settling is silent.
- Press the backquote key (`) to open the engine overlay. Each throw drops a "Throw slot
  N" tag on the timing chart.

*/

import { AudioClip, bootstrap, BT, Color32, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {{ x: number, y: number, prevX: number, prevY: number, vx: number, vy: number, color: number, grabbedBy: number }} Ball */

const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Vertical strip at the top reserved for the shared UI kit's full-width title bar (a
// title-only 'topBar' is 22 pixels tall). Balls cannot enter it, and grabs are only
// registered below it, so the strip acts as the ceiling of the physics box.
const HUD_HEIGHT = 22;

// Scene palette slots. Index 0 is always transparent. UI colors (panel, text, borders)
// are not listed here - the shared UI kit installs them into high slots (240 and up) via
// applyTheme() in init(), so only the demo's own scene colors remain.
const C_BALL_OUTLINE = 1; // outline drawn around any grabbed ball

// Tint for the ball under the mouse cursor when no slot is grabbing it.
const C_BALL_HIGHLIGHT = 2;
const C_CHART_UPDATE = 3; // dim gray for the overlay timing chart's update bars
const C_CHART_RENDER = 4; // white for the chart's render bars and throw tags

// Three balls, each its own color so it is easy to track which is which.
const BALL_COLORS = [5, 6, 7];

// Physics parameters, all expressed in "display pixels per fixed update tick" since the
// engine runs update() at a fixed rate (here 60 ticks per second).
const BALL_RADIUS = 10;
const GRAVITY = 0.35; // px per tick squared, downward
const WALL_DAMPING = 0.78; // velocity multiplier on wall bounce (energy loss)
const FLOOR_FRICTION = 0.985; // horizontal velocity multiplier per tick on the floor
const AIR_DRAG = 0.999; // gentle air drag so flicks decay over time
const MIN_SPEED = 0.05; // velocities below this are clamped to zero (avoid tiny jitter)

// Multiplier applied to BT.pointerDelta when a ball is released. The delta is already in
// "display pixels moved since the previous fixed update tick", which is roughly velocity
// in px/tick. Scale up slightly so easy flicks feel energetic.
const THROW_SCALE = 1.4;

// Maximum allowed launch speed (px/tick). Caps the velocity from a very fast flick so
// balls do not escape the box in a single tick.
const MAX_THROW_SPEED = 16;

// Throw whoosh: pitch and volume scale between these min/max values based on how fast the
// ball was thrown, so a gentle nudge sounds different from a hard flick.
const WHOOSH_PITCH_MIN = 0.85;
const WHOOSH_PITCH_MAX = 1.6;
const WHOOSH_VOLUME_MIN = 0.35;
const WHOOSH_VOLUME_MAX = 1.0;

// Wall/floor thud: bounces gentler than this speed are skipped entirely, so a ball
// settling to rest does not spam quiet thuds. THUD_VOLUME_MAX_SPEED is the impact speed
// at or above which the thud plays at full volume.
const THUD_MIN_SPEED = 0.5;
const THUD_VOLUME_MAX_SPEED = 10;

// Keeps a number from going below `min` or above `max`.
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Drag-and-flick physics demo. Each ball is a small object: { x, y, prevX, prevY, vx, vy,
// color, grabbedBy }. `grabbedBy` is -1 when free or a pointer slot index 0..3 when held.
// While held, physics integration is skipped and the ball is moved to the pointer
// position each tick. On release we read BT.pointerDelta(slot) and convert it to the
// ball's launch velocity.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map returned by applyTheme() - where the shared UI colors landed. Used
    // for BT.clear(this.theme.bg) and the crosshair cursor color.
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // Whoosh sound played when a ball is thrown.
    /** @type {AudioClip | null} */
    whooshClip = null;

    // Thud sound played when a ball bounces off a wall or the floor.
    /** @type {AudioClip | null} */
    thudClip = null;

    // Active balls. Created in init(). prevX/prevY remember where each ball was at the
    // START of the most recent update() tick, before physics moved it. render() blends
    // between prevX/prevY and x/y using BT.renderAlpha so the ball glides smoothly across
    // render frames instead of only moving once per physics tick - see the Game Loop
    // guide linked in the header.
    /** @type {Ball[]} */
    balls = [];

    // Tells the engine the screen size and which palette slots to use for the timing
    // chart overlay. The chart shows update() and render() time side by side so you can
    // see when a ball throw causes a spike.
    configure() {
        return {
            // Set the logical display size (how many pixels the demo draws at).
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // Phones and tablets dim, then lock, the screen after 30-60 seconds without a
            // touch - easy to hit while you are just watching a ball settle before
            // flicking it again. This asks the browser to keep the screen on while you
            // play; unsupported browsers ignore it.
            isWakeLockEnabled: true,

            // Show the scrolling timing chart in the overlay so each frame's cost is
            // visible. configure() runs before init(), so the shared theme slots do not
            // exist yet - the chart uses two dedicated scene slots filled in init()
            // instead.
            isOverlayTimingChartEnabled: true,

            overlayTimingChartStyle: {
                // Dim gray makes update bars subtle so render bars stand out by contrast.
                updateBarPaletteIndex: C_CHART_UPDATE,

                // White gives render bars and throw tags high contrast against the dark
                // background.
                renderBarPaletteIndex: C_CHART_RENDER,
                tagPaletteIndex: C_CHART_RENDER,
            },
        };
    }

    // Synthesizes the two sounds, sets up the palette, and seeds three balls at varied
    // starting positions.
    async init() {
        // The whoosh: a sine wave sliding from 600 Hz down to 150 Hz over 0.35 seconds,
        // with a pinch of noise mixed in. Rendering it once here means later throws play
        // back with zero delay.
        this.whooshClip = await AudioClip.synth({
            waveform: 'sine',
            frequency: 600,
            duration: 0.35,
            envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.2 },
            pitchSweep: { toFrequency: 150 },
            noiseMix: 0.15,
            seed: 2,
        });

        // The thud: a very short, low 90 Hz sine with a fast decay and no sustain.
        this.thudClip = await AudioClip.synth({
            waveform: 'sine',
            frequency: 90,
            duration: 0.12,
            envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.05 },
            seed: 3,
        });

        this.palette = BT.paletteCreate(256);

        // Scene colors: the ball rings, the timing chart bars, and the balls themselves.
        this.palette.set(C_BALL_OUTLINE, new Color32(255, 255, 255));
        this.palette.set(C_BALL_HIGHLIGHT, new Color32(255, 220, 120));
        this.palette.set(C_CHART_UPDATE, new Color32(150, 160, 180));
        this.palette.set(C_CHART_RENDER, new Color32(255, 255, 255));

        this.palette.set(BALL_COLORS[0], new Color32(255, 100, 110));
        this.palette.set(BALL_COLORS[1], new Color32(120, 220, 130));
        this.palette.set(BALL_COLORS[2], new Color32(120, 170, 255));

        // Install the shared UI theme (panel, text, border colors and so on) into high
        // palette slots (240 and up), far away from the scene colors above. The returned
        // map tells us which slot each theme color landed in, so the demo can reuse them
        // (for example this.theme.bg as the screen clear color).
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Hide the native OS cursor so the drawn crosshair markers are the only cursors
        // visible while the pointer is over the canvas.
        BT.hideCursor();

        // Stagger the balls horizontally and give each a small initial velocity so the
        // simulation looks alive on the first frame.
        this.balls = [
            { x: 80, y: 60, prevX: 80, prevY: 60, vx: 1.2, vy: 0, color: BALL_COLORS[0], grabbedBy: -1 },
            { x: 160, y: 50, prevX: 160, prevY: 50, vx: -0.6, vy: 0.4, color: BALL_COLORS[1], grabbedBy: -1 },
            { x: 240, y: 70, prevX: 240, prevY: 70, vx: 0.8, vy: -0.2, color: BALL_COLORS[2], grabbedBy: -1 },
        ];

        return true;
    }

    // Per-tick: route press and release edges to grab and throw, follow held balls to
    // their owning pointer, integrate physics for free balls.
    update() {
        // Walk every pointer slot. The mouse (slot 0) and touches (1-3) all use
        // BTN_POINTER_A as the "primary" button; for touches that is automatic ("contact
        // made = A held"), for the mouse it is the left button.
        for (let slot = 0; slot < 4; slot++) {
            // Edge: pointer just went down on this slot. Try to grab a ball.
            if (BT.isPressed(BT.BTN_POINTER_A, slot)) {
                this.tryGrab(slot);
            }

            // Edge: pointer just released on this slot. Throw whatever it held.
            if (BT.isReleased(BT.BTN_POINTER_A, slot)) {
                this.tryThrow(slot);
            }
        }

        // Move every ball: held ones follow their pointer, free ones obey gravity, drag,
        // and wall bounces.
        for (const ball of this.balls) {
            // Snapshot "where was this ball a moment ago" BEFORE moving it, so render()
            // can draw a smooth in-between position instead of a pop.
            ball.prevX = ball.x;
            ball.prevY = ball.y;

            if (ball.grabbedBy >= 0) {
                this.updateHeldBall(ball);
            } else {
                this.updateFreeBall(ball);
            }
        }
    }

    // Per-frame render: clear, draw the HUD, draw the balls, draw the cursor markers.
    render() {
        // Clear the whole screen with the shared theme's background color.
        BT.clear(this.theme.bg);

        this.renderHUD();
        this.renderBalls();
        this.renderCursors();
    }

    // Attempts to grab a ball whose disc is under this slot's pointer. Skips if there is
    // no live pointer, the pointer is inside the HUD strip, or this slot already holds a
    // ball.
    tryGrab(slot) {
        if (!BT.isPointerActive(slot)) {
            return;
        }

        const pos = BT.pointerPos(slot);

        // Do not try to grab through the HUD - a press at HUD level is a miss-click
        // rather than a deliberate grab.
        if (pos.y < HUD_HEIGHT) {
            return;
        }

        // If this slot is already holding something, leave it alone.
        for (const ball of this.balls) {
            if (ball.grabbedBy === slot) {
                return;
            }
        }

        // Find the topmost ball whose disc covers the pointer. Iterating in reverse so
        // the visually topmost ball wins when balls overlap.
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];

            if (ball.grabbedBy !== -1) {
                continue;
            }

            // Inside the disc when the squared distance to the center is at most the
            // squared radius - comparing squares avoids a square root.
            const dx = ball.x - pos.x;
            const dy = ball.y - pos.y;

            if (dx * dx + dy * dy <= BALL_RADIUS * BALL_RADIUS) {
                ball.grabbedBy = slot;
                ball.vx = 0;
                ball.vy = 0;
                return;
            }
        }
    }

    // Releases whatever ball this slot is holding, launching it with the pointer's
    // release-tick velocity (scaled and clamped to MAX_THROW_SPEED).
    tryThrow(slot) {
        // Mark this throw on the overlay timing chart so you can see exactly when a throw
        // happened and which pointer slot caused it. The template string inserts the slot
        // number so repeated throws from different fingers are distinct.
        BT.assignTag(`Throw slot ${slot}`);

        for (const ball of this.balls) {
            if (ball.grabbedBy !== slot) {
                continue;
            }

            // BT.pointerDelta is the movement since the previous tick, which is
            // approximately velocity in px/tick. We can use it directly as launch
            // velocity (with a small scale factor).
            const delta = BT.pointerDelta(slot);
            let vx = delta.x * THROW_SCALE;
            let vy = delta.y * THROW_SCALE;

            // Clamp the launch speed so a frantic flick cannot escape the box.
            const speed = Math.hypot(vx, vy);

            if (speed > MAX_THROW_SPEED) {
                const k = MAX_THROW_SPEED / speed;
                vx *= k;
                vy *= k;
            }

            this.playWhoosh(speed);

            ball.vx = vx;
            ball.vy = vy;
            ball.grabbedBy = -1;
            return;
        }
    }

    // Plays the flick whoosh, using throw speed to control pitch (faster flick = higher,
    // more urgent pitch) and volume (faster flick = louder). BT.soundPlay's `pitch`
    // option is a playback-rate multiplier, the same trick Audio Basics uses for its blip
    // sound. `speed` is the pre-clamp launch speed in px/tick.
    playWhoosh(speed) {
        const speedFraction = clamp(speed / MAX_THROW_SPEED, 0, 1);
        const pitch = WHOOSH_PITCH_MIN + speedFraction * (WHOOSH_PITCH_MAX - WHOOSH_PITCH_MIN);
        const volume = WHOOSH_VOLUME_MIN + speedFraction * (WHOOSH_VOLUME_MAX - WHOOSH_VOLUME_MIN);

        BT.soundPlay(this.whooshClip, { pitch, volume });
    }

    // Snaps a held ball to its owning pointer's position. If the pointer went invalid
    // mid-grab (the mouse left the canvas, a touch was canceled) we release the ball
    // gently with zero velocity.
    updateHeldBall(ball) {
        const slot = ball.grabbedBy;

        if (!BT.isPointerActive(slot)) {
            // Pointer disappeared - drop the ball where it is.
            ball.grabbedBy = -1;
            ball.vx = 0;
            ball.vy = 0;
            return;
        }

        const pos = BT.pointerPos(slot);
        ball.x = pos.x;
        ball.y = pos.y;
    }

    // Integrates one tick of physics for a free ball: gravity, air drag, floor friction,
    // and wall bounces with damping.
    updateFreeBall(ball) {
        // Gravity pulls the ball down each tick.
        ball.vy += GRAVITY;

        // Gentle air drag on both axes.
        ball.vx *= AIR_DRAG;
        ball.vy *= AIR_DRAG;

        // Integrate position: add this tick's velocity to where the ball is.
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Bounce off the side walls: push the ball back inside, play a thud, and flip the
        // horizontal velocity (scaled down so some energy is lost).
        if (ball.x - BALL_RADIUS < 0) {
            ball.x = BALL_RADIUS;
            this.playThud(Math.abs(ball.vx));
            ball.vx = -ball.vx * WALL_DAMPING;
        } else if (ball.x + BALL_RADIUS > DISPLAY_W) {
            ball.x = DISPLAY_W - BALL_RADIUS;
            this.playThud(Math.abs(ball.vx));
            ball.vx = -ball.vx * WALL_DAMPING;
        }

        // Same for the ceiling (the HUD strip) and the floor (the bottom edge).
        if (ball.y - BALL_RADIUS < HUD_HEIGHT) {
            ball.y = HUD_HEIGHT + BALL_RADIUS;
            this.playThud(Math.abs(ball.vy));
            ball.vy = -ball.vy * WALL_DAMPING;
        } else if (ball.y + BALL_RADIUS > DISPLAY_H) {
            ball.y = DISPLAY_H - BALL_RADIUS;
            this.playThud(Math.abs(ball.vy));
            ball.vy = -ball.vy * WALL_DAMPING;

            // Touching the floor: scrub a little horizontal speed so balls come to rest
            // after a few rolls.
            ball.vx *= FLOOR_FRICTION;
        }

        // Snap negligible velocities to zero so balls truly stop instead of creeping
        // forever.
        if (Math.abs(ball.vx) < MIN_SPEED) {
            ball.vx = 0;
        }

        if (Math.abs(ball.vy) < MIN_SPEED) {
            ball.vy = 0;
        }
    }

    // Plays the wall/floor bounce thud, skipping bounces too gentle to notice and scaling
    // volume with impact speed. `impactSpeed` is the absolute velocity component
    // (px/tick) at the moment of impact.
    playThud(impactSpeed) {
        if (impactSpeed < THUD_MIN_SPEED) {
            return;
        }

        const volume = clamp(impactSpeed / THUD_VOLUME_MAX_SPEED, 0.2, 1);
        BT.soundPlay(this.thudClip, { volume });
    }

    // The HUD, built from shared UI kit groups: the full-width title strip at the top (it
    // doubles as the ceiling of the physics box - see HUD_HEIGHT), plus a compact corner
    // panel with one pip per pointer slot. A pip lights up while that slot (M = mouse,
    // T1-T3 = touch fingers) is grabbing a ball.
    renderHUD() {
        // The classic full-width 22 px title strip along the top edge.
        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel('Drag a ball, release to flick');

        // Browsers refuse to play any sound until the page is clicked or a key is
        // pressed. This shared row shows the standard warm "enable sound" prompt and
        // disappears on its own the moment audio unlocks - which here happens on the very
        // first grab.
        ui.audioUnlockHint();

        ui.end();

        // Per-slot grab indicators, tucked into the top-right corner just below the
        // strip. Balls may fly behind this panel - that is fine, it is a readout, not a
        // wall. ui.pip() draws a small square that fills in while its state is true.
        const labels = ['M', 'T1', 'T2', 'T3'];

        ui.begin(UI_ANCHORS.TOP_RIGHT, { y: HUD_HEIGHT + 6 });
        ui.panel('Grabs');

        for (let slot = 0; slot < 4; slot++) {
            // .some() asks: is there at least one ball whose grabbedBy equals this slot?
            const grabbing = this.balls.some((b) => b.grabbedBy === slot);
            ui.pip(labels[slot], grabbing);
        }

        ui.end();
    }

    // Draws each ball as a filled disc. Highlights the ball under the mouse (for hover
    // feedback) and outlines any ball currently grabbed.
    renderBalls() {
        // Determine which ball, if any, the mouse is currently hovering over. We only do
        // this for the mouse (slot 0) since touch slots only have a position while in
        // contact (which means they are already grabbing).
        const mousePos = BT.isPointerActive(0) ? BT.pointerPos(0) : null;
        let hoverIndex = -1;

        if (mousePos !== null && mousePos.y >= HUD_HEIGHT) {
            for (let i = this.balls.length - 1; i >= 0; i--) {
                const ball = this.balls[i];
                const dx = ball.x - mousePos.x;
                const dy = ball.y - mousePos.y;

                if (dx * dx + dy * dy <= BALL_RADIUS * BALL_RADIUS) {
                    hoverIndex = i;
                    break;
                }
            }
        }

        for (let i = 0; i < this.balls.length; i++) {
            const ball = this.balls[i];

            // BT.renderAlpha is a fraction from 0 (a physics tick just finished) to just
            // under 1 (the next tick is about to happen). Blending prevX/prevY toward x/y
            // by that fraction gives us the ball's position AT THIS EXACT RENDER MOMENT,
            // not just its position as of the last physics tick. Picture a movie: physics
            // ticks are the individual film frames, and render() is the projector running
            // faster than the film advances - renderAlpha tells the projector how far to
            // "tween" between the current frame and the next one so playback looks smooth
            // instead of jerky.
            const drawX = Math.round(ball.prevX + (ball.x - ball.prevX) * BT.renderAlpha);
            const drawY = Math.round(ball.prevY + (ball.y - ball.prevY) * BT.renderAlpha);

            this.drawDisc(drawX, drawY, BALL_RADIUS, ball.color);

            if (ball.grabbedBy !== -1) {
                // Outline grabbed balls so you can tell which ones are held.
                this.drawCircle(drawX, drawY, BALL_RADIUS + 1, C_BALL_OUTLINE);
            } else if (i === hoverIndex) {
                // Hover highlight: a thin amber ring on the topmost free ball under the
                // mouse cursor.
                this.drawCircle(drawX, drawY, BALL_RADIUS + 1, C_BALL_HIGHLIGHT);
            }
        }
    }

    // Small crosshair at every active pointer position so users can see where each finger
    // or the mouse currently is.
    renderCursors() {
        for (let slot = 0; slot < 4; slot++) {
            if (!BT.isPointerActive(slot)) {
                continue;
            }

            const pos = BT.pointerPos(slot);

            BT.drawLine(new Vector2i(pos.x - 4, pos.y), new Vector2i(pos.x + 4, pos.y), this.theme.text);
            BT.drawLine(new Vector2i(pos.x, pos.y - 4), new Vector2i(pos.x, pos.y + 4), this.theme.text);
        }
    }

    // Filled disc using a row-by-row scan: for each row in the bounding box, draw a
    // horizontal line of the pixels covered by the circle equation. Cheaper than
    // per-pixel testing and produces clean edges at this scale.
    drawDisc(cx, cy, r, color) {
        const r2 = r * r;

        for (let dy = -r; dy <= r; dy++) {
            // Half-width of the row at this y, from x * x + y * y <= r * r solved for x.
            const dx = Math.floor(Math.sqrt(r2 - dy * dy));

            BT.drawLine(new Vector2i(cx - dx, cy + dy), new Vector2i(cx + dx, cy + dy), color);
        }
    }

    // Hollow circle outline (the midpoint circle algorithm). Used to ring the grabbed and
    // hovered balls without splatting a full disc on top. The loop walks one eighth of
    // the circle and mirrors every point into the other seven octants.
    drawCircle(cx, cy, r, color) {
        let x = r;
        let y = 0;
        let err = 0;

        while (x >= y) {
            BT.drawPixel(new Vector2i(cx + x, cy + y), color);
            BT.drawPixel(new Vector2i(cx + y, cy + x), color);
            BT.drawPixel(new Vector2i(cx - y, cy + x), color);
            BT.drawPixel(new Vector2i(cx - x, cy + y), color);
            BT.drawPixel(new Vector2i(cx - x, cy - y), color);
            BT.drawPixel(new Vector2i(cx - y, cy - x), color);
            BT.drawPixel(new Vector2i(cx + y, cy - x), color);
            BT.drawPixel(new Vector2i(cx + x, cy - y), color);

            // Step along y and let the error term decide when x has to step inward.
            y += 1;
            err += 1 + 2 * y;

            if (2 * (err - x) + 1 > 0) {
                x -= 1;
                err += 1 - 2 * x;
            }
        }
    }
}

bootstrap(Demo);
