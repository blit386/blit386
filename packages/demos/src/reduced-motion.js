/*

Reduced Motion: a warp starfield that damps itself when the viewer asks for less motion.
@description A warp starfield whose speed, streaks, shake, and blinking all damp for reduced motion.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Starfield: https://demos.blit386.dev/starfield

Live version: https://demos.blit386.dev/reduced-motion

Guides:
  - Splash: https://blit386.dev/docs/guides/splash#reduced-motion
  - Game loop: https://blit386.dev/docs/guides/game-loop#smoothing-motion-between-updates

Reference:
  - Core: https://blit386.dev/docs/api/core#reduced-motion
  - Camera: https://blit386.dev/docs/api/camera
  - Easing: https://blit386.dev/docs/api/easing#applyeasing

---

WHAT YOU WILL SEE
-----------------

A 320x240 cockpit window looking straight down the flight path: a two-tone frame around
the screen and an instrument housing in the top-right corner with a 12x12 lamp labeled
"WARP". 140 stars drift out from the center. The flight cycles through four phases:
cruise (2.5 s), jump (0.75 s), warp (2 s), and drop (0.75 s). At the jump the stars speed
up and stretch into long radial streaks, the hull kicks sideways by up to 5 pixels, and
the lamp starts blinking twice a second. The drop reverses it and the cycle repeats.

Three UI kit panels sit around the window: "Reduced motion" (top-left) shows the OS
preference, the local override, the effective state, a counter of change-hook calls, the
phase, and the jump count; "Controls" (bottom-left) holds the two controls; "When reduced"
(bottom-right) lists the four damped effects.

When reduced motion is preferred, the demo keeps flying but damps every effect: stars at
20 percent speed, no streaks, no shake, and a lamp that stays lit instead of blinking. It
never freezes, because a frozen screen reads as a crash.

WHAT YOU WILL LEARN
-------------------

- BT.isReducedMotionPreferred resolves the ?reducedmotion / ?noreducedmotion URL flags
  over the browser's prefers-reduced-motion media query. The demo reads it once in init().
- onReducedMotionChange(prefersReduced) on the demo class is called by the engine when the
  preference changes while the page is open. It reports changes only, never the initial
  value.
- Perspective projection: dividing a star's offset by its depth turns a flat list of
  points into a 3D tunnel, and the outward acceleration falls out of that division.
- Deriving a streak from speed: the tail is the star's position STREAK_TICKS ticks ago, so
  one speed number controls both the motion and the streak length.
- BT.renderAlpha blends each star's previous and current depth so the field moves smoothly
  between fixed updates.
- Screen shake as a camera offset (BT.cameraSet), and why BT.cameraReset() must run before
  the UI kit draws.
- applyEasing(t, 'cubic-in-out') for the speed ramps at the jump and the drop.
- Degrading motion instead of deleting it: slower, shorter, steadier - not stopped.

HOW THIS DIFFERS FROM THE STARFIELD DEMO
----------------------------------------

The Starfield demo (https://demos.blit386.dev/starfield) fakes depth: three flat layers
scrolling sideways at three speeds. This demo computes depth instead. Each star has a real
distance, and the screen position is worked out by dividing by it, so a star speeds up on
its own as it gets closer. Nothing in the code adds that acceleration - it falls out of
the division.

TRY THIS
--------

- Press M (or tap "Force reduced (M)") to force reduced motion on without touching the OS.
  The checkbox can only add reduced motion on top of the system setting, never remove it.
- Press J (or tap "Jump / drop (J)") to jump to warp or drop back out right now. The
  button does nothing while a jump or drop is already in progress.
- Turn the system's reduce-motion setting on or off while the page is open and watch the
  "Hook fired" counter and the "Last hook" line change. No reload is needed.
- Add ?reducedmotion or ?noreducedmotion to the URL to start in either state. A URL flag
  pins the answer, so the change hook stays quiet while it is present.

The engine's own startup splash follows the same preference by itself: it holds a still
frame instead of fading and dissolving.

*/

import { applyEasing, bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {{ x: number, y: number, z: number, prevZ: number, speedScale: number }} Star */

// Logical screen size in game pixels, and the vanishing point everything flies out of.
const DISPLAY_W = 320;
const DISPLAY_H = 240;
const CENTER_X = DISPLAY_W / 2;
const CENTER_Y = DISPLAY_H / 2;

// Palette slots for the scene. The shared UI kit owns slots 240-251 (see applyTheme in
// init()), so scene colors live down at the bottom where they can never collide.
const C_BG = 2; // deep space: almost black, faintly blue
const C_STAR_FAR = 3; // dim gray: stars still a long way off
const C_STAR_MID = 4; // middle distance
const C_STAR_NEAR = 5; // near white: about to fly past the window
const C_FRAME = 6; // cockpit window frame, lit edge
const C_FRAME_DARK = 7; // cockpit window frame, shadowed inner edge
const C_HULL = 8; // the instrument housing the lamp sits in
const C_LAMP_ON = 9; // lamp lit: amber, never a saturated red (see the flash note below)
const C_LAMP_DIM = 10; // lamp unlit: a dark amber so the bulb is still visible
const C_LAMP_RIM = 11; // lamp bezel and the small "WARP" label

// How many stars fly at once. Enough to feel dense at warp, few enough that every one can
// afford to draw a line instead of a dot.
const STAR_COUNT = 140;

// The depth range. Stars are born at Z_FAR and rush toward the cockpit; Z_NEAR is the
// point where they have flown past and get recycled to the back of the queue.
const Z_NEAR = 0.08;
const Z_FAR = 1.6;

// How strongly depth spreads stars apart on screen. Bigger means a wider, faster tunnel.
const PROJECT_SCALE = 150;

// How far off-center a star is born, in world units. Never zero: a star sitting exactly
// on the vanishing point would stay a single motionless pixel in the middle forever.
const SPAWN_RADIUS_MIN = 0.06;
const SPAWN_RADIUS_MAX = 0.9;

// Per-star speed variety, as a multiplier on the ship's speed.
const SPEED_SCALE_MIN = 0.85;
const SPEED_SCALE_MAX = 1.15;

// How much depth the ship eats per tick while cruising, and while at warp. The whole
// "speed" of the demo is this one number; everything else is derived from it.
const SPEED_CRUISE = 0.004;
const SPEED_WARP = 0.055;

// The four phases of the flight, and how many ticks (1/60 second each) each one lasts.
const PHASE_CRUISE = 'cruise';
const PHASE_JUMP = 'jump';
const PHASE_WARP = 'warp';
const PHASE_DROP = 'drop';
const PHASE_TICKS = {
    [PHASE_CRUISE]: 150,
    [PHASE_JUMP]: 45,
    [PHASE_WARP]: 120,
    [PHASE_DROP]: 45,
};

// A streak is the same star drawn twice: once where it is, once where it was a moment
// ago. This is how many ticks "a moment ago" means. Because the gap is measured in ticks
// of the current speed, cruising gives a dot and warp gives a long line - one number,
// both looks.
const STREAK_TICKS = 2;

// Shorter than this on screen, the "line" is not worth drawing - use a single pixel.
const STREAK_MIN_PX = 1.5;

// When reduced motion is on, the ship still flies, at a fifth of the speed.
const REDUCED_SPEED_SCALE = 0.2;

// Screen shake: a kick this big, multiplied down each tick until it is small enough to
// stop.
const SHAKE_START_PX = 5;
const SHAKE_DECAY = 0.86;
const SHAKE_STOP_PX = 0.35;

// The warp lamp blinks once every 30 ticks: on for 15, off for 15. At 60 ticks a second
// that is 2 flashes a second. The accessibility limit is 3 flashes a second (WCAG 2.1,
// "Three Flashes or Below Threshold"), because faster flashing can trigger seizures. Two
// is comfortably under it, and the lamp is a 12x12 patch of a 320x240 screen. Never flash
// the whole screen, and never flash saturated red: both have stricter limits still.
const LAMP_PERIOD_TICKS = 30;
const LAMP_ON_TICKS = 15;

// Where the instrument housing and its lamp sit, in screen pixels.
const HOUSING_RECT = new Rect2i(262, 10, 48, 30);
const LAMP_RECT = new Rect2i(268, 16, 12, 12);
const LAMP_LABEL_X = 284;
const LAMP_LABEL_Y = 18;

// Depth thresholds picking which of the three star colors to draw with.
const BAND_FAR_Z = 1.0;
const BAND_MID_Z = 0.4;

// A star is recycled once it has flown this far past the edge of the window.
const CULL_MARGIN_PX = 12;

// A warp-speed cockpit whose motion damps itself when reduced motion is preferred.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Slot numbers of the shared UI kit colors, filled in init() by applyTheme().
    theme = null;

    // One plain object per star: `x` and `y` are the sideways and up/down offsets in
    // world units, fixed until the star respawns; `z` is the distance from the cockpit,
    // shrinking every tick; `prevZ` is where z was at the start of this tick, for
    // interpolated drawing; `speedScale` is a small per-star multiplier so the field does
    // not move in lockstep.
    /** @type {Star[]} */
    stars = [];

    // Where the flight is in the cruise / jump / warp / drop cycle, and how long it has
    // been there.
    phase = PHASE_CRUISE;
    phaseTicks = 0;

    // Depth eaten per tick right now. Recomputed every tick from the phase.
    warpSpeed = SPEED_CRUISE;

    // How many times the ship has jumped to warp, so the reader can see the button
    // worked.
    jumpCount = 0;

    // The operating system's answer, read ONCE in init() and kept current by the change
    // hook below. It is deliberately not read every frame: each read of
    // BT.isReducedMotionPreferred re-parses the URL flags and re-queries the media query,
    // which is wasted work sixty times a second.
    osPrefersReduced = false;

    // The M key / checkbox. It can only force reduced motion ON, never off: no demo
    // should offer a control that overrides someone's accessibility setting against them.
    forceReduced = false;

    // osPrefersReduced OR forceReduced. Recomputed at the top of every update().
    reducedNow = false;

    // Proof that onReducedMotionChange() really fires. Starting at zero is correct: the
    // engine only reports changes, so nothing is delivered until the setting actually
    // moves.
    hookCallCount = 0;

    /** @type {boolean | null} */
    lastHookValue = null;

    /** @type {number | null} */
    lastHookTick = null;

    // Shake state. shakeAmount is the fading strength; shakeX/shakeY is the whole-number
    // pixel offset actually handed to the camera this tick.
    shakeAmount = 0;
    shakeX = 0;
    shakeY = 0;

    // Counts 0..LAMP_PERIOD_TICKS-1 forever; the lamp is lit for the first half.
    lampTick = 0;

    // Reused objects. Creating a new Vector2i per star per frame would make hundreds of
    // throwaway objects a second, which is exactly what a retro engine cannot afford.
    cameraVec = new Vector2i(0, 0);
    headVec = new Vector2i(0, 0);
    tailVec = new Vector2i(0, 0);
    tempRect = new Rect2i(0, 0, 0, 0);

    // Builds the palette, fills the sky, and asks once whether this viewer wants less
    // motion.
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(3, 5, 14));
        this.palette.set(C_STAR_FAR, new Color32(96, 104, 124));
        this.palette.set(C_STAR_MID, new Color32(168, 180, 200));
        this.palette.set(C_STAR_NEAR, new Color32(236, 242, 255));
        this.palette.set(C_FRAME, new Color32(92, 104, 132));
        this.palette.set(C_FRAME_DARK, new Color32(38, 46, 64));
        this.palette.set(C_HULL, new Color32(52, 60, 80));
        this.palette.set(C_LAMP_ON, new Color32(255, 176, 58));
        this.palette.set(C_LAMP_DIM, new Color32(74, 44, 16));
        this.palette.set(C_LAMP_RIM, new Color32(126, 102, 70));

        // Fill the sky. Each star gets its own starting depth spread across the whole
        // range, so the very first frame already looks like a tunnel rather than a wall
        // of stars all arriving together.
        this.stars = [];

        for (let i = 0; i < STAR_COUNT; i++) {
            this.stars.push(this.createStar(BT.random.float(Z_NEAR, Z_FAR)));
        }

        // Install the shared UI kit colors in slots 240-251, then activate the palette.
        // applyTheme() must run BEFORE paletteSet(), or the kit would draw with whatever
        // happened to be in those slots.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Ask the browser once. From here on, onReducedMotionChange() keeps this current
        // - the engine installs its media-query listener right after this init() resolves
        // true.
        this.osPrefersReduced = BT.isReducedMotionPreferred;
        this.reducedNow = this.osPrefersReduced;

        this.enterPhase(PHASE_CRUISE);

        return true;
    }

    // Fixed-step logic: advance the flight, move every star, fade the shake, blink the
    // lamp.
    update() {
        // First line, always: this is what lets the kit see key presses and taps.
        ui.tick();

        // The OS setting and the local override are combined here, once, and every piece
        // of motion below reads the result. One switch, one place to change it.
        this.reducedNow = this.osPrefersReduced || this.forceReduced;

        this.advancePhase();
        this.moveStars();
        this.updateShake();

        // % wraps the counter back to 0 when it reaches the period, like a clock hand.
        this.lampTick = (this.lampTick + 1) % LAMP_PERIOD_TICKS;
    }

    // Draws the sky and hull under the shake, then the interface at rest on top.
    render() {
        // clear() paints the whole display and ignores the camera, so shaking the scene
        // can never expose an unpainted strip along an edge.
        BT.clear(C_BG);

        // Screen shake done properly: nudge the camera, not every single draw call. A
        // camera offset of -3 moves everything drawn after it 3 pixels the other way, so
        // nothing else in this method has to know the shake exists.
        BT.cameraSet(this.cameraVec.set(-this.shakeX, -this.shakeY));

        this.drawStars();
        this.drawHull();
        this.drawLamp();

        // Put the camera back BEFORE any ui.* call. The kit draws its panels through the
        // same camera-aware calls, but it decides what a finger hit using raw screen
        // positions - so a shaking camera would slide the buttons away from their own tap
        // targets.
        BT.cameraReset();

        this.drawStatusPanel();
        this.drawControlPanel();
        this.drawLegendPanel();
    }

    // The engine calls this when the system's reduce-motion setting changes while the
    // page is open. It fires only on a change - never once at startup with the current
    // value - which is why init() reads BT.isReducedMotionPreferred for the starting
    // answer. `prefersReduced` is true when the viewer now wants less motion.
    onReducedMotionChange(prefersReduced) {
        this.osPrefersReduced = prefersReduced;

        // Everything below is only here so the demo can show that the hook really fired.
        // A real game would just keep the line above.
        this.hookCallCount += 1;
        this.lastHookValue = prefersReduced;
        this.lastHookTick = BT.ticks;
    }

    // Makes one star at depth `z`: a random direction out from the middle, a random
    // distance along it, and a slightly random speed.
    createStar(z) {
        // BT.random.angle() picks a direction anywhere around a full turn. Cosine and
        // sine turn that direction plus a distance into a sideways and an up/down offset
        // - the standard way to scatter points evenly around a circle instead of in a
        // square.
        const angle = BT.random.angle();
        const radius = BT.random.float(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX);

        return {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            z,
            prevZ: z,
            speedScale: BT.random.float(SPEED_SCALE_MIN, SPEED_SCALE_MAX),
        };
    }

    // Sends one star back to the far end of the tunnel with a fresh direction.
    respawnStar(star) {
        const angle = BT.random.angle();
        const radius = BT.random.float(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX);

        star.x = Math.cos(angle) * radius;
        star.y = Math.sin(angle) * radius;
        star.z = Z_FAR;

        // Snap the remembered depth to the new one as well. Without this, the
        // interpolated drawing in drawStars() would blend from the star's old position
        // right next to the cockpit all the way back to the far distance, painting a
        // streak across the entire window on the frame it respawns.
        star.prevZ = Z_FAR;
    }

    // Walks the flight through cruise -> jump -> warp -> drop and back, and sets the
    // speed.
    advancePhase() {
        this.phaseTicks += 1;

        if (this.phaseTicks >= PHASE_TICKS[this.phase]) {
            if (this.phase === PHASE_CRUISE) {
                this.enterPhase(PHASE_JUMP);
            } else if (this.phase === PHASE_JUMP) {
                this.enterPhase(PHASE_WARP);
            } else if (this.phase === PHASE_WARP) {
                this.enterPhase(PHASE_DROP);
            } else {
                this.enterPhase(PHASE_CRUISE);
            }
        }

        // Base speed for this phase. The two transitions slide between the two speeds
        // instead of snapping: t counts 0 to 1 across the phase, and applyEasing() bends
        // that straight count into a slow start, fast middle, slow finish.
        let speed = this.phase === PHASE_WARP ? SPEED_WARP : SPEED_CRUISE;

        if (this.phase === PHASE_JUMP || this.phase === PHASE_DROP) {
            const t = this.phaseTicks / PHASE_TICKS[this.phase];
            const eased = applyEasing(t, 'cubic-in-out');

            speed =
                this.phase === PHASE_JUMP
                    ? SPEED_CRUISE + (SPEED_WARP - SPEED_CRUISE) * eased
                    : SPEED_WARP + (SPEED_CRUISE - SPEED_WARP) * eased;
        }

        // The first degradation: reduced motion keeps the whole flight, at a fifth of the
        // speed. Slowed, not stopped - a frozen starfield looks like the demo has
        // crashed.
        this.warpSpeed = this.reducedNow ? speed * REDUCED_SPEED_SCALE : speed;
    }

    // Switches to `phase` (one of PHASE_CRUISE, PHASE_JUMP, PHASE_WARP, PHASE_DROP), and
    // kicks the hull on the two moments where that makes sense.
    enterPhase(phase) {
        this.phase = phase;
        this.phaseTicks = 0;

        // Crossing into or out of warp is a jolt; cruising along and holding at warp are
        // not.
        if (phase === PHASE_JUMP || phase === PHASE_DROP) {
            this.shakeAmount = SHAKE_START_PX;
        }

        if (phase === PHASE_JUMP) {
            this.jumpCount += 1;
        }
    }

    // Pulls every star closer by this tick's speed, recycling the ones that have flown
    // past.
    moveStars() {
        for (let i = 0; i < this.stars.length; i++) {
            const star = this.stars[i];

            // Remember where the star was, so render() can draw the in-between position.
            star.prevZ = star.z;

            // Smaller z means closer. This is the only movement in the demo: while a star
            // is alive nothing changes its x or y. The sideways rush you see is entirely
            // the division by a shrinking depth over in drawStars().
            star.z -= this.warpSpeed * star.speedScale;

            if (star.z <= Z_NEAR || this.isStarOffScreen(star)) {
                this.respawnStar(star);
            }
        }
    }

    // Returns true when the star has flown out of the window. Checked so no star is ever
    // drawn - or worse, drawn as a very long line - far outside the screen.
    isStarOffScreen(star) {
        const sx = CENTER_X + (star.x / star.z) * PROJECT_SCALE;
        const sy = CENTER_Y + (star.y / star.z) * PROJECT_SCALE;

        return (
            sx < -CULL_MARGIN_PX ||
            sx > DISPLAY_W + CULL_MARGIN_PX ||
            sy < -CULL_MARGIN_PX ||
            sy > DISPLAY_H + CULL_MARGIN_PX
        );
    }

    // Fades the shake toward nothing, then turns it into whole pixels - or zero, if
    // damped.
    updateShake() {
        // Multiplying by a number just under 1 every tick makes the kick die away quickly
        // at first and gently later, which is how a real jolt settles. Below about a
        // third of a pixel it is invisible, so snap it to nothing and stop the wobble
        // cleanly.
        this.shakeAmount *= SHAKE_DECAY;

        if (this.shakeAmount < SHAKE_STOP_PX) {
            this.shakeAmount = 0;
        }

        // The second degradation: no shake at all. The jump still happens, and the panel
        // still counts it - only the camera stops moving.
        if (this.reducedNow) {
            this.shakeX = 0;
            this.shakeY = 0;

            return;
        }

        this.shakeX = Math.round(BT.random.float(-this.shakeAmount, this.shakeAmount));
        this.shakeY = Math.round(BT.random.float(-this.shakeAmount, this.shakeAmount));
    }

    // Draws every star as a streak from where it is back toward where it just was.
    //
    // THE ONE IDEA IN THIS DEMO: dividing by depth. A star two units away is drawn half
    // as far from the middle as the same star one unit away. So as depth shrinks, the
    // drawn position races outward faster and faster all by itself. Think of standing
    // between railway tracks: sleepers far ahead barely seem to move, the one at your
    // feet whips past.
    drawStars() {
        // BT.renderAlpha says how far this frame is between the last tick and the next
        // one, from 0 to just under 1. Blending the old and new depth by it keeps the
        // flight smooth even though the logic above only runs at a fixed 60 steps a
        // second.
        const alpha = BT.renderAlpha;

        // The third degradation: reduced motion drops the trail length to zero, so every
        // star stays a dot at every speed. The long radial smear is the part that hurts.
        const streakTicks = this.reducedNow ? 0 : STREAK_TICKS;

        for (let i = 0; i < this.stars.length; i++) {
            const star = this.stars[i];
            const z = star.prevZ + (star.z - star.prevZ) * alpha;

            // Guard against a depth of zero: dividing by it would give infinity.
            if (z <= 0) {
                continue;
            }

            const scale = PROJECT_SCALE / z;
            const hx = CENTER_X + star.x * scale;
            const hy = CENTER_Y + star.y * scale;

            // Where the star was streakTicks ticks ago: the same star, further away.
            // Because the gap is this tick's speed times a fixed number of ticks, the
            // streak is short when the ship crawls and long when it is at warp. One
            // number, two looks.
            const zTail = z + this.warpSpeed * star.speedScale * streakTicks;
            const tailScale = PROJECT_SCALE / zTail;
            const tx = CENTER_X + star.x * tailScale;
            const ty = CENTER_Y + star.y * tailScale;

            const slot = this.starSlot(z);

            // A "line" shorter than a pixel and a half is just a dot with extra work.
            if (Math.abs(hx - tx) < STREAK_MIN_PX && Math.abs(hy - ty) < STREAK_MIN_PX) {
                BT.drawPixel(this.headVec.set(Math.round(hx), Math.round(hy)), slot);
            } else {
                BT.drawLine(
                    this.tailVec.set(Math.round(tx), Math.round(ty)),
                    this.headVec.set(Math.round(hx), Math.round(hy)),
                    slot,
                );
            }
        }
    }

    // Picks a palette slot for a star from its blended depth `z`: distant stars are dim,
    // close ones glare.
    starSlot(z) {
        if (z > BAND_FAR_Z) {
            return C_STAR_FAR;
        }

        if (z > BAND_MID_Z) {
            return C_STAR_MID;
        }

        return C_STAR_NEAR;
    }

    // The cockpit window frame and the instrument housing. This is not decoration: a
    // shake against a plain starfield is nearly invisible, because there is no straight
    // edge to measure it against. Give the eye a rigid frame and the same 5 pixels read
    // as a jolt.
    drawHull() {
        BT.drawRect(this.tempRect.set(2, 2, DISPLAY_W - 4, DISPLAY_H - 4), C_FRAME);
        BT.drawRect(this.tempRect.set(4, 4, DISPLAY_W - 8, DISPLAY_H - 8), C_FRAME_DARK);

        BT.drawRectFill(HOUSING_RECT, C_HULL);
        BT.drawRect(HOUSING_RECT, C_FRAME);
    }

    // The warp lamp. Lit while the ship is jumping or at warp, dark while cruising.
    //
    // The fourth degradation: normally the lamp blinks twice a second, but under reduced
    // motion it simply stays lit for the same phases. Same color, same meaning, no
    // flicker - which is also why the lamp is never the ONLY thing telling you the state.
    // Blinking alone is a poor way to say anything: the "Phase" line in the panel says it
    // in words.
    drawLamp() {
        const isWarping = this.phase === PHASE_JUMP || this.phase === PHASE_WARP;
        const isLit = isWarping && (this.reducedNow || this.lampTick < LAMP_ON_TICKS);

        BT.drawRectFill(LAMP_RECT, isLit ? C_LAMP_ON : C_LAMP_DIM);
        BT.drawRect(LAMP_RECT, C_LAMP_RIM);

        // Drawn inside the camera offset with the rest of the hull, so the label shakes
        // along with the panel it is printed on instead of floating free of it.
        BT.systemPrint(this.headVec.set(LAMP_LABEL_X, LAMP_LABEL_Y), C_LAMP_RIM, 'WARP');
    }

    // Top-left panel: what the system said, what the override says, and proof the hook
    // fires.
    drawStatusPanel() {
        ui.begin(UI_ANCHORS.TOP_LEFT);
        ui.panel('Reduced motion');
        ui.kv('OS pref', this.osPrefersReduced ? 'reduce' : 'no-pref');
        ui.kv('Override', this.forceReduced ? 'on' : 'off');
        ui.kv('Effective', this.reducedNow ? 'REDUCED' : 'FULL');
        ui.separator();

        // "0" here is the right answer at startup, not a bug: the hook reports changes
        // only.
        ui.kv('Hook fired', this.hookCallCount);
        ui.kv('Last hook', this.formatLastHook());
        ui.separator();
        ui.kv('Phase', this.phase);
        ui.kv('Jumps', this.jumpCount);
        ui.end();
    }

    // Puts the most recent hook call into one short line.
    formatLastHook() {
        if (this.lastHookValue === null) {
            return 'never';
        }

        return `${this.lastHookValue ? 'reduce' : 'no-pref'} @${this.lastHookTick}`;
    }

    // Bottom-left panel: the two controls, both usable by key and by touch.
    drawControlPanel() {
        ui.begin(UI_ANCHORS.BOTTOM_LEFT);
        ui.panel('Controls');

        // A checkbox, not a button, because this is a lasting on/off state. The { key }
        // option gives it a keyboard shortcut and a tap target at once, so the demo works
        // on a phone with no keyboard attached.
        //
        // Note the direction: this can only ADD reduced motion on top of the system
        // setting. Nothing here can take it away from someone whose OS asked for it.
        this.forceReduced = ui.checkbox('Force reduced (M)', this.forceReduced, { key: 'KeyM' });

        // A little breathing room: buttons are taller than text rows, and without a gap
        // the button's top edge clips the descenders of the checkbox label above it.
        ui.spacer(4);

        if (ui.button('Jump / drop (J)', { key: 'KeyJ' })) {
            this.toggleWarp();
        }

        ui.label('Flip the OS setting', { color: 'dim' });
        ui.end();
    }

    // Bottom-right panel: exactly what changes when reduced motion is on.
    drawLegendPanel() {
        ui.begin(UI_ANCHORS.BOTTOM_RIGHT);
        ui.panel('When reduced');
        ui.label('Stars   20% speed', { color: 'dim' });
        ui.label('Streaks dots only', { color: 'dim' });
        ui.label('Shake   none', { color: 'dim' });
        ui.label('Lamp    steady', { color: 'dim' });
        ui.end();
    }

    // Jumps to warp now, or drops out now, so nobody has to wait for the cycle to come
    // round. Mid-transition (jump or drop) the button does nothing: the ship is already
    // busy changing speed, and interrupting it would snap the starfield.
    toggleWarp() {
        if (this.phase === PHASE_CRUISE) {
            this.enterPhase(PHASE_JUMP);
        } else if (this.phase === PHASE_WARP) {
            this.enterPhase(PHASE_DROP);
        }
    }
}

// bootstrap finds the canvas, builds the Demo, and runs the loop.
bootstrap(Demo);
