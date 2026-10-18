/*

Game Scene: one small world that uses almost everything from the series.
@description The capstone: tilemap ground, patterns, sprites, camera, animation, and looping music in one scene.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Colors: https://demos.blit386.dev/colors
  - Patterns: https://demos.blit386.dev/patterns
  - Camera: https://demos.blit386.dev/camera
  - Sprites: https://demos.blit386.dev/sprites
  - Animation: https://demos.blit386.dev/animation
  - Sprite Effects: https://demos.blit386.dev/sprite-effects
  - Starfield: https://demos.blit386.dev/starfield
  - Tilemap: https://demos.blit386.dev/tilemap
  - Image Output: https://demos.blit386.dev/image-output
  - Music: https://demos.blit386.dev/music
  - Random Basics: https://demos.blit386.dev/random-basics

Live version: https://demos.blit386.dev/game-scene

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#per-draw-palette-offsets-zero-cost-color-variants
  - Game Loop: https://blit386.dev/docs/guides/game-loop#smoothing-motion-between-updates
  - Audio: https://blit386.dev/docs/guides/audio#playing-music
  - Random: https://blit386.dev/docs/guides/random#deterministic-by-default
  - Overlay: https://blit386.dev/docs/guides/overlay#custom-rows

Reference:
  - Palette: https://blit386.dev/docs/api/palette#per-draw-offset
  - Camera: https://blit386.dev/docs/api/camera
  - Game Loop: https://blit386.dev/docs/api/game-loop#timer
  - Audio: https://blit386.dev/docs/api/audio#loop-points
  - Rendering: https://blit386.dev/docs/api/rendering#frame-capture
  - Easing: https://blit386.dev/docs/api/easing#applyeasing
  - Overlay: https://blit386.dev/docs/api/overlay#custom-rows

---

WHAT YOU WILL SEE
-----------------

A 640x240 world seen through a 320x240 window. From back to front:

- A sky of 20 horizontal bands, eased from a deep blue at the top to a pale blue at the
  horizon, with five two-rectangle clouds that scroll at 22 percent of the camera speed
  (the parallax idea from Starfield).
- Four buildings filled with a 4x4 checker pattern (Patterns) and framed with an outline,
  standing on the far edge of the walkway.
- A grass strip from y = 188 down, a 3-pixel dark line on top of it, and above that the
  walkway: one row of 16x16 tiles alternating two grass, two brown dirt, picked by tile
  ID from an array (Tilemap).
- The 44x44 rock sprite from Sprites walking left and right along the walkway at one
  pixel per tick, bobbing one pixel every 8 ticks, with a thin shadow under its feet. The
  camera eases after it (Camera) and is clamped to the world.
- Three sparkles every 30 ticks around the rock: 3x3 squares that hue-shift and fade out
  over 72 ticks (the particle idea from Animation).
- A 20-second day/night cycle: every world color dims toward a cool blue at night and
  back (the palette tinting idea from Sprite Effects).
- Looping background music with a real intro-then-loop point (Music), a chime on every
  day-phase change, and a blip after a successful PNG capture.
- Two small UI kit panels (src/shared/ui.js) along the top: Capstone in the top-left
  corner with a Save PNG button (Image Output), and Status in the top-right corner with
  the score and the time of day. Until sound is unlocked, the standard "enable sound"
  hint sits on the grass in the bottom-left corner.
- Score, rock position, and day phase as engine overlay rows above the FPS bar.

WHAT YOU WILL LEARN
-------------------

- Palette-first lighting: every ambient-lit color is written into a dedicated palette
  slot in update(); render() passes palette indices only (see below).
- Per-draw palette offsets: BT.drawSprite(sheet, rect, pos, spriteColorCount) shifts the
  rock's pixel indices into a second "ambient" block of slots that update() re-lights
  every tick.
- Color32.multiply(), Color32.lerp(), Color32.fromHSL(), and applyEasing(t, 'ease-in-out')
  for the sky gradient.
- Fixed-step timing with Timer.fireIfElapsed(tick) for the walk bob, the score, and the
  sparkle spawns.
- Smoothing the rock and the camera between ticks with BT.renderAlpha, with zero
  per-frame allocation (reused Vector2i and Rect2i instances).
- BT.cameraSet(), BT.cameraReset(), and BT.cameraClamp(camera, worldSize, viewSize),
  plus a second, slower camera for the sky layer.
- BT.musicPlay(clip, { loop, loopStart, loopEnd }), AudioClip.synth(),
  BT.synthPreset.blip(), and BT.soundPlay(); music requested before the audio unlock
  starts on the first click or key press.
- BT.downloadFrame(filename) from a UI kit button bound to Space, with a busy flag while
  the promise is pending.
- BT.random.int(min, max) for the sparkle scatter.
- Overlay configuration: overlayRows(), overlayStyle, overlayTimingChartStyle, the palette
  grid (isOverlayPaletteEnabled, 32 columns, 3 visible rows), and hiding the toggle hint
  with isOverlayToggleHintVisible: false.

HOW THE DAY/NIGHT PALETTE WORKS
-------------------------------

Instead of computing base.multiply(ambient) in render() and passing a Color32 to draw
calls, update() pre-computes those multiplied colors and stores them in dedicated palette
slots. render() only ever uses palette index numbers.

Color32.multiply() scales each channel of the base color by the matching channel of the
ambient color and returns a new Color32 - like shining a colored light on a surface: a
blue light on a red wall gives a darker, purplish result.

Example: the grass fill has a base color (50, 140, 70) and a reserved slot C_GRASS. Every
tick update() computes grassBaseColor.multiply(ambient) and writes it to C_GRASS.
render() calls BT.drawRectFill(rect, C_GRASS) - no Color32 needed there.

The ambient color itself comes from a cosine over the 1200-tick cycle: bright and warm
(255, 255, 255) at the start, cool and dark (70, 75, 120) halfway through.

TRY THIS
--------

- Click or tap "Save PNG (Space)", or press Space, to download blit386-scene.png. The
  label reads "Capturing..." while the browser writes the file, then "Saved: ..." for
  3 seconds, and a blip plays.
- Click anywhere or press any key once to unlock audio; the music starts from its intro
  and then loops between 1.5 s and 7.9 s. Listen for the chime every 5 seconds as the day
  phase changes.
- Press Backquote (`) to open the engine overlay. The three custom rows show the score,
  the rock's world position, and the day phase; the palette grid at the bottom shows the
  scene slots re-lighting as the day turns.

*/

import { applyEasing, AudioClip, bootstrap, BT, Color32, Rect2i, SpriteSheet, Timer, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */

// Internal game resolution width.
const DISPLAY_W = 320;

// The level is wider than the screen so the camera can scroll (Camera).
const WORLD_W = 640;
const WORLD_H = 240;

// Where the walkway ends and the grass starts.
const GROUND_Y = 188;

// One row of 16 px tiles along the walkway (Tilemap: small tile IDs in an array).
const GROUND_TILE_SIZE = 16;
const TILE_GRASS_ID = 1;
const TILE_DIRT_ID = 2;

// The buildings stand on the far edge of the walkway, and the rock walks along it 4
// pixels in from its near edge, so the scene reads front to back: grass, walkway with the
// rock, buildings, sky.
const WALKWAY_Y = GROUND_Y - GROUND_TILE_SIZE;
const WALK_LINE_Y = GROUND_Y - 4;

// test.png is 44x44, but its bottom 8 rows are transparent: the rock's lowest visible
// pixels are on row 35. Standing the rock on the walk line uses this, not the frame
// height, so its feet touch the ground instead of hovering 8 pixels above it.
const HERO_ART_BOTTOM = 36;

// Checker squares inside buildings (Patterns: repeating blocks, no images).
const BUILDING_PATTERN_CELL = 4;

// How far the rock moves along x each update tick.
const HERO_SPEED = 1;

// Walk bob timer: advance the step counter every 8 ticks.
const WALK_FRAME_TICKS = 8;

// Score +1 every 60 ticks (one second at the default 60 ticks per second).
const SCORE_INTERVAL_TICKS = 60;

// A batch of sparkles every 30 ticks.
const PARTICLE_SPAWN_INTERVAL = 30;

// Full day/night loop: 1200 ticks, 20 seconds at 60 ticks per second.
const DAY_NIGHT_CYCLE_TICKS = 1200;

// Camera smoothing: each tick the camera steps 14 percent closer to its target.
const CAMERA_LERP = 0.14;

// These two numbers come straight out of public/audio/music-intro-loop.loop.json,
// generated by scripts/generate-audio-loops.mjs. Music plays the same track in
// isolation.
const MUSIC_LOOP_START_SECONDS = 1.5;
const MUSIC_LOOP_END_SECONDS = 7.9;

// Parallax: clouds move at 22 percent of the real camera speed.
const SKY_PARALLAX = 0.22;

// How many sky bands cover the sky from y = 0 to GROUND_Y.
const SKY_BANDS = 20;

// Size of the rotating pool of particle palette slots.
const MAX_PARTICLES = 20;

// Static scene slot (never changes after init). UI text and panel colors come from the
// shared UI kit theme (slots 240 and up); the slots below belong to the scene itself.
const C_BLACK = 2; // black for BT.clear

// Dynamic world slots, rewritten every tick in update(). Sky bands: 10..10+SKY_BANDS-1
// (20 slots).
const C_SKY_BASE = 10;

// Ground: 30..31, and the walkway's dirt tiles at 47.
const C_GRASS = 30;
const C_DIRTLINE = 31;
const C_DIRT = 47;

// Buildings: 4 buildings x 2 slots (fill + outline) = 8 slots at 32..39.
const C_BUILDING_BASE = 32;

// Clouds: one slot at 40.
const C_CLOUD = 40;

// Overlay text and timing-chart colors: 41..44, dimmed with the scene at night.
const C_HUD_TITLE = 41; // timing-chart error markers only
const C_HUD_SCORE = 42;
const C_HUD_POS = 43;
const C_HUD_PHASE = 44; // colors the day-phase overlay row (Day / Night / ...)

// Hero shadow: 45.
const C_HERO_SHADOW = 45;

// Overlay bar fill (text slots reuse C_HUD_SCORE / C_HUD_POS / C_HUD_PHASE).
const C_OVERLAY_BAR = 46;

// Particle slots: 50..69 (MAX_PARTICLES = 20).
const PARTICLE_SLOT_START = 50;

// Sprite base colors extracted from test.png: 70..70+N-1. The ambient (lit) version of
// the same colors: 70+N..70+2N-1.
const SPRITE_BASE = 70;

// One self-running mini scene: walking rock, following camera, overlay rows, day/night,
// sparkles. All color computation happens in update(); render() uses palette indices
// only.
class Demo {
    // The palette holds every color this demo uses.
    /** @type {Palette | null} */
    palette = null;

    // Sprite sheet for the rock hero, loaded from /sprites/test.png.
    /** @type {SpriteSheet | null} */
    heroSheet = null;

    // Looping background music with a distinct intro section.
    /** @type {AudioClip | null} */
    musicClip = null;

    // Short chime played on every day/night phase change.
    /** @type {AudioClip | null} */
    dayPhaseChimeClip = null;

    // Confirmation blip played after a successful PNG capture.
    /** @type {AudioClip | null} */
    captureBlipClip = null;

    // Day phase label as of the previous tick, used to detect changes.
    /** @type {string | null} */
    lastDayPhaseLabel = null;

    // The full source rectangle for the hero sprite.
    /** @type {Rect2i | null} */
    heroSprite = null;

    // Hero sprite size in world pixels, read from the loaded sheet in init() (test.png is
    // 44x44). Deriving it from the real image instead of a guessed number keeps movement
    // bounds, camera centering, and particle spawns matching what is drawn.
    /** @type {Vector2i} */
    heroSize = new Vector2i(0, 0);

    // How many unique colors the sprite has (N).
    spriteColorCount = 0;

    // Original Color32 objects for the sprite's colors, for the ambient multiplication.
    spriteBaseColors = [];

    // Rock position in world pixels. The y here is a placeholder: init() sets the real y
    // once the sprite has loaded and its height is known, so the rock stands exactly on
    // the ground line.
    heroPos = new Vector2i(120, 0);

    // Rock position at the start of the most recent update() tick, before this tick's
    // walk step moved it. render() blends between heroPrevPos and heroPos using
    // BT.renderAlpha so the rock glides between ticks instead of jumping (Game Loop
    // guide, "Smoothing motion between updates"). init() snaps this to heroPos so the
    // very first frame does not blend in from a stale position.
    heroPrevPos = new Vector2i(120, 0);

    // +1 = moving right, -1 = moving left.
    heroFacing = 1;

    // Walk step counter: not a frame index, it only bobs the rock one pixel.
    walkStep = 0;
    walkFrameTimer = new Timer(WALK_FRAME_TICKS);

    // Camera top-left in world coordinates.
    cameraPos = new Vector2i(0, 0);

    // Camera position at the start of the most recent update() tick, before this tick's
    // follow-lerp moved it. render() blends between this and cameraPos using
    // BT.renderAlpha for the same reason as heroPrevPos above.
    cameraPrevPos = new Vector2i(0, 0);

    // Reused every render() call for the interpolated camera and hero positions, so no
    // new Vector2i is allocated per frame.
    cameraRenderPos = new Vector2i(0, 0);
    heroRenderPos = new Vector2i(0, 0);

    // Float version of the camera x for a smooth lerp without pixel jitter.
    cameraXFloat = 0;

    // Simple score counter and its timer.
    score = 0;
    scoreTimer = new Timer(SCORE_INTERVAL_TICKS);

    // Particle spawn timer.
    particleSpawnTimer = new Timer(PARTICLE_SPAWN_INTERVAL);

    // Active particle objects: { pos, spawnTick, paletteSlot }.
    particles = [];

    // Rotating pool index for particle palette slots.
    nextParticleSlot = 0;

    // World decoration: buildings and clouds, built once in init().
    buildings = [];
    clouds = [];

    // Tile IDs for the walkway row (Tilemap): each entry is TILE_GRASS_ID or
    // TILE_DIRT_ID.
    groundTileIds = [];

    // PNG capture state (Image Output): the Capstone panel's Save button (click, tap, or
    // Space) triggers BT.downloadFrame() once per press.
    capturing = false;
    lastCaptureMessage = '';
    messageTimer = 0;

    // Base colors for buildings, clouds, and ground, multiplied by the ambient in
    // update().
    buildingFills = [];
    buildingOutlines = [];
    cloudBaseColor = new Color32(230, 240, 255, 200);
    grassBaseColor = new Color32(50, 140, 70);
    dirtBaseColor = new Color32(40, 100, 55);
    walkwayDirtBaseColor = new Color32(130, 100, 70);

    // Reused rectangle and vectors to avoid creating new objects every frame.
    tempRect = new Rect2i(0, 0, 0, 0);
    tempVec = new Vector2i(0, 0);
    worldSize = new Vector2i(WORLD_W, WORLD_H); // pre-allocated for cameraClamp calls

    // Sky gradient: base colors at the top and at the horizon.
    skyTop = new Color32(40, 70, 140);
    skyHorizon = new Color32(120, 170, 220);

    // Overlay text base colors, before the ambient is applied.
    hudTitleBase = new Color32(255, 230, 180);
    hudScoreBase = new Color32(200, 220, 255);
    hudPosBase = new Color32(180, 200, 180);
    hudFpsBase = new Color32(150, 150, 160);

    // Reused every frame for the overlay rows: score, rock position, day phase.
    overlayRowData = [
        { leftText: 'Score 0', textPaletteIndex: C_HUD_SCORE },
        { leftText: 'Rock (0, 0)', textPaletteIndex: C_HUD_POS },
        { leftText: 'Dawn/Day', textPaletteIndex: C_HUD_PHASE },
    ];

    // Palette slots for the engine overlay bars (the FPS strip keeps the engine
    // defaults). The live palette grid at the bottom of the overlay shows which slots
    // this frame's draw calls use, which is handy for the day/night tinting and the
    // sprite palette blocks: 32 swatches per row, 3 visible rows, scroll to browse all
    // 256 slots.
    configure() {
        return {
            // The engine normally draws a small toggle hint in the bottom-left corner so
            // people know they can press Backquote (`) to open the stats overlay. This is
            // an immersive game scene, so the hint is hidden to keep the picture clean.
            // The overlay still works: ` reveals the full dev HUD (timing chart and
            // palette grid) on demand, ` again hides it. Teaching demos leave the hint
            // visible (the default) so newcomers can find it.
            isOverlayToggleHintVisible: false,

            // Space is the Save PNG shortcut; keep the page from scrolling when it is
            // pressed.
            isCapturingKeyboardScroll: true,

            isOverlayPaletteEnabled: true,
            overlayPaletteColumns: 32,
            overlayPaletteRowsVisible: 3,
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_HUD_SCORE,
                gapPaletteIndex: C_OVERLAY_BAR,
            },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_HUD_POS,
                renderBarPaletteIndex: C_HUD_SCORE,
                warningPaletteIndex: C_HUD_PHASE,
                errorPaletteIndex: C_HUD_TITLE,
                tagPaletteIndex: C_HUD_POS,
            },
        };
    }

    // Loads the hero sprite sheet, builds the palette, places buildings and clouds, and
    // starts the audio.
    async init() {
        console.log('[GameSceneDemo] Initializing...');

        // Create the palette and set the static slots. The shared UI kit needs its
        // twelve theme colors in the palette before any widget draws. applyTheme() writes
        // them into high slots (240 and up), far above this demo's scene slots, which end
        // at SPRITE_BASE + 2N - 1 (below slot 100). The returned slot map is not needed
        // here, so the call is side effect only.
        this.palette = BT.paletteCreate(256);
        applyTheme(this.palette);

        this.palette.set(C_BLACK, new Color32(0, 0, 0));
        // Overlay row backgrounds.
        this.palette.set(C_OVERLAY_BAR, new Color32(0, 0, 0, 180));

        // Pre-fill the particle slots as transparent.
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.palette.set(PARTICLE_SLOT_START + i, new Color32(0, 0, 0, 0));
        }

        // Build the world decoration and the walkway tile-ID row (Tilemap).
        this.buildWorldDecor();
        this.buildGroundTileStrip();

        // Extract the sprite colors and register them in the palette: the engine scans
        // the PNG and adds every unique color it finds, starting at SPRITE_BASE. The
        // returned array holds the same colors in palette-write order (sorted darkest
        // first by luminance). They are kept so updateWorldPalette() can multiply each
        // base color by the current ambient tint and write the lit version into the
        // higher "ambient block" (SPRITE_BASE+N..SPRITE_BASE+2N-1).
        this.spriteBaseColors = await SpriteSheet.loadColorsIntoPalette('/sprites/test.png', this.palette, SPRITE_BASE);

        const colorCount = this.spriteBaseColors.length;
        this.spriteColorCount = colorCount;

        // Pre-fill the ambient sprite block (SPRITE_BASE+N..SPRITE_BASE+2N-1). update()
        // recalculates these every tick from the current ambient light.
        for (let i = 0; i < colorCount; i++) {
            this.palette.set(SPRITE_BASE + colorCount + i, this.spriteBaseColors[i]);
        }

        // Load the hero sprite against the slots registered above.
        const indexed = await SpriteSheet.loadIndexed('/sprites/test.png', this.palette, SPRITE_BASE, {
            sort: 'none',
        });
        this.heroSheet = indexed.sheet;
        this.heroSprite = this.heroSheet.fullRect();
        BT.paletteSet(this.palette);
        console.log(`[GameSceneDemo] Loaded sprite: ${this.heroSprite.width}x${this.heroSprite.height}px`);

        // Read the hero's real size from the loaded sheet (44x44 for test.png), the same
        // way Basics Enhanced and Logo Low-Res do. Every bit of math below - movement
        // bounds, camera centering, particle spawns - uses this size, so the logic always
        // matches the picture on screen.
        this.heroSize.set(this.heroSheet.size.x, this.heroSheet.size.y);

        // Stand the rock on the walk line: the sprite's top-left y is the walk line minus
        // the height of its visible pixels (HERO_ART_BOTTOM), so its lowest pixels sit
        // right on WALK_LINE_Y.
        this.heroPos.y = WALK_LINE_Y - HERO_ART_BOTTOM;

        // Snap heroPrevPos to match so the very first render does not blend in from the
        // placeholder position the class fields started with.
        this.heroPrevPos.set(this.heroPos.x, this.heroPos.y);

        // Place the camera on the hero to start.
        this.cameraXFloat = this.heroPos.x - DISPLAY_W / 2 + this.heroSize.x / 2;
        this.cameraPos.x = Math.floor(this.cameraXFloat);
        this.cameraPos.y = 0;
        this.clampCamera();

        // Snap cameraPrevPos to match the starting camera position so the very first
        // render does not blend in from (0, 0).
        this.cameraPrevPos.set(this.cameraPos.x, this.cameraPos.y);

        // Write every ambient-lit color once now. update() rewrites them each tick, but
        // the first frame can be drawn before the first update() runs, and without this
        // it would show a black world.
        this.updateWorldPalette();

        // Load and start all sound: music, the day/night chime, and the capture blip.
        await this.initAudio();

        console.log('[GameSceneDemo] Ready.');

        return true;
    }

    // Loads the music track, synthesizes the two sound effects, and starts the music.
    // Called once from init(); split out so the audio setup reads as one step.
    async initAudio() {
        // Background music: a real intro-then-loop track, the same one Music plays in
        // isolation. BT.musicPlay() called before the page is unlocked is remembered and
        // starts for real the instant the player clicks or presses a key.
        //
        // Load and play are wrapped like in Snake Game: a missing or undecodable file
        // must not abort the whole scene - the capstone still renders with SFX only.
        try {
            this.musicClip = await AudioClip.load('/audio/music-intro-loop.wav');
            BT.musicPlay(this.musicClip, {
                loop: true,
                loopStart: MUSIC_LOOP_START_SECONDS,
                loopEnd: MUSIC_LOOP_END_SECONDS,
            });
        } catch (error) {
            console.warn('[GameSceneDemo] Failed to load background music, continuing without it.', error);
            this.musicClip = null;
        }

        // A soft sine chime for day/night transitions, and BT.synthPreset.blip() (the
        // same UI blip Synth Toy uses) for a successful capture.
        this.dayPhaseChimeClip = await AudioClip.synth({
            waveform: 'sine',
            frequency: 660,
            duration: 0.6,
            volume: 0.5,
            envelope: { attack: 0.02, decay: 0.15, sustain: 0.3, release: 0.4 },
            seed: 1,
        });
        this.captureBlipClip = await AudioClip.synth(BT.synthPreset.blip());

        // Remember the starting day phase so updateDayPhaseSound() only chimes when the
        // phase actually changes, not on the very first tick.
        this.lastDayPhaseLabel = this.getDayPhaseLabel();
    }

    // Fixed-step logic: moves the rock, camera, score, and particles, then recalculates
    // all ambient-lit palette colors.
    update() {
        // Let the shared UI kit latch keyboard shortcuts and touch contacts for this
        // tick. This must run before anything else so the Save button's Space binding
        // works.
        ui.tick();

        const tick = BT.ticks;

        this.updateDayPhaseSound(tick);

        // The PNG capture itself starts from the kit's Save button in renderHud().
        // Here only the "Saved: ..." message is counted down so it disappears after a
        // while.
        if (this.messageTimer > 0) {
            this.messageTimer--;
        }

        this.updateHeroMovement();
        this.updateWalkStep(tick);
        this.updateCameraFollow();
        this.updateScore(tick);
        this.updateParticlesSpawn(tick);
        this.cleanupParticles(tick);
        this.updateParticleColors(tick);

        // Recalculate all ambient-lit palette colors: the core of the day/night system.
        this.updateWorldPalette();
    }

    // Plays a short chime the instant the day/night phase label changes (Day -> Toward
    // dusk -> Night -> Toward dawn -> Day ...). Comparing this tick's label against last
    // tick's label is the same edge-detection idea Keyboard Input uses for key presses:
    // only the moment something changes matters, not every tick it stays the same.
    updateDayPhaseSound(tick) {
        const currentPhase = this.getDayPhaseLabel(tick);

        if (this.lastDayPhaseLabel !== null && currentPhase !== this.lastDayPhaseLabel) {
            BT.soundPlay(this.dayPhaseChimeClip);
        }

        this.lastDayPhaseLabel = currentPhase;
    }

    // Draws the world layers back to front. Score, position, and phase text are handled
    // by the engine overlay. Every draw call uses palette index numbers only, no Color32.
    render() {
        BT.clear(C_BLACK);

        // Blend cameraPrevPos toward cameraPos by BT.renderAlpha - a fraction from 0 (a
        // tick just finished) to just under 1 (the next tick is about to happen) - so the
        // camera's on-screen position matches this exact render moment instead of only
        // its last-tick position. Both the sky parallax and the full camera offset use
        // this same smoothed value, so the layers never drift apart.
        this.cameraRenderPos.set(
            Math.floor(this.cameraPrevPos.x + (this.cameraPos.x - this.cameraPrevPos.x) * BT.renderAlpha),
            Math.floor(this.cameraPrevPos.y + (this.cameraPos.y - this.cameraPrevPos.y) * BT.renderAlpha),
        );

        // Layer 1: sky and clouds with parallax.
        this.renderSkyLayer();

        // Layer 2: world with the full camera offset.
        BT.cameraSet(this.cameraRenderPos);
        this.renderGroundAndBuildings();
        this.renderParticles();
        this.renderHero();
        BT.cameraReset();

        // HUD panels and capture controls, in screen space (not scrolled with the
        // world).
        this.renderHud();

        // Score, rock position, and day phase are drawn in overlayRows() above the FPS
        // bar.
    }

    // Score, rock position, and day/night phase for the engine overlay. The text colors
    // are updated each tick in updateWorldPalette() so they dim at night.
    overlayRows() {
        this.overlayRowData[0].leftText = `Score ${this.score}`;
        this.overlayRowData[1].leftText = `Rock (${this.heroPos.x}, ${this.heroPos.y})`;
        this.overlayRowData[2].leftText = this.getDayPhaseLabel();

        return this.overlayRowData;
    }

    // Fills groundTileIds with alternating grass/dirt tile IDs for one 16 px row
    // (Tilemap).
    buildGroundTileStrip() {
        const cols = Math.ceil(WORLD_W / GROUND_TILE_SIZE);
        this.groundTileIds = [];

        for (let col = 0; col < cols; col++) {
            // Simple pattern: two grass tiles, then two dirt tiles, repeat.
            this.groundTileIds.push(col % 4 < 2 ? TILE_GRASS_ID : TILE_DIRT_ID);
        }
    }

    // Places buildings and clouds once at startup, and stores the building base colors in
    // separate arrays so update() can apply the ambient.
    buildWorldDecor() {
        const rawBuildings = [
            {
                x: 40,
                y: WALKWAY_Y - 52,
                w: 36,
                h: 52,
                fill: new Color32(140, 90, 70),
                outline: new Color32(80, 50, 40),
            },
            {
                x: 200,
                y: WALKWAY_Y - 70,
                w: 44,
                h: 70,
                fill: new Color32(110, 120, 140),
                outline: new Color32(60, 70, 90),
            },
            {
                x: 380,
                y: WALKWAY_Y - 46,
                w: 32,
                h: 46,
                fill: new Color32(160, 100, 100),
                outline: new Color32(100, 50, 50),
            },
            {
                x: 500,
                y: WALKWAY_Y - 60,
                w: 40,
                h: 60,
                fill: new Color32(120, 130, 100),
                outline: new Color32(70, 80, 60),
            },
        ];

        // Fresh arrays every call, never push() onto the old ones: a second call would
        // leave 8 buildings whose palette slots spill past slot 39 into the cloud,
        // overlay, and walkway colors. Array.map returns a new array with one result per
        // entry.
        this.buildings = rawBuildings.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
        this.buildingFills = rawBuildings.map((b) => b.fill);
        this.buildingOutlines = rawBuildings.map((b) => b.outline);

        this.clouds = [
            { x: 30, y: 24, w: 42, h: 14 },
            { x: 160, y: 40, w: 56, h: 18 },
            { x: 320, y: 18, w: 48, h: 16 },
            { x: 480, y: 36, w: 50, h: 15 },
            { x: 600, y: 22, w: 44, h: 17 },
        ];
    }

    // Computes the current ambient tint from the day/night cycle and returns it as a
    // Color32, the "color of the light": bright white at midday, dark blue at midnight.
    // Called from update() to drive the palette, never from render().
    getAmbientTint() {
        const tick = BT.ticks;
        const cycle = (tick % DAY_NIGHT_CYCLE_TICKS) / DAY_NIGHT_CYCLE_TICKS;

        // Math.cos returns -1..1; (cos + 1) / 2 gives 0..1 for "how bright is the sun".
        const dayAmount = (Math.cos(cycle * Math.PI * 2) + 1) * 0.5;

        // Interpolate from a cool night color to a warm day color.
        const r = Math.floor(70 + dayAmount * 185);
        const g = Math.floor(75 + dayAmount * 180);
        const b = Math.floor(120 + dayAmount * 135);

        return new Color32(r, g, b);
    }

    // Recalculates every ambient-dependent palette entry. Called every tick in update()
    // so render() always has up-to-date slot values.
    updateWorldPalette() {
        const ambient = this.getAmbientTint();

        // Sky gradient bands.
        for (let band = 0; band < SKY_BANDS; band++) {
            // t goes from 0 at the top to 1 near the horizon.
            const t = band / SKY_BANDS;

            // applyEasing(t, 'ease-in-out') squashes the transition so it moves slowly
            // near the top, speeds up through the middle, then slows again near the
            // horizon. Real skies work the same way: a deep uniform color at the zenith,
            // a quick shift through the middle bands, then a flatter wash near the
            // horizon. lerp(other, t) blends between two Color32 values: t = 0 is all
            // skyTop, t = 1 is all skyHorizon.
            const bandBase = this.skyTop.lerp(this.skyHorizon, applyEasing(t, 'ease-in-out'));
            this.palette.set(C_SKY_BASE + band, bandBase.multiply(ambient));
        }

        // Ground.
        this.palette.set(C_GRASS, this.grassBaseColor.multiply(ambient));
        this.palette.set(C_DIRTLINE, this.dirtBaseColor.multiply(ambient));
        this.palette.set(C_DIRT, this.walkwayDirtBaseColor.multiply(ambient));

        // Buildings.
        for (let i = 0; i < this.buildings.length; i++) {
            this.palette.set(C_BUILDING_BASE + i * 2, this.buildingFills[i].multiply(ambient));
            this.palette.set(C_BUILDING_BASE + i * 2 + 1, this.buildingOutlines[i].multiply(ambient));
        }

        // Clouds.
        this.palette.set(C_CLOUD, this.cloudBaseColor.multiply(ambient));

        // Engine overlay text: a subtle night tint on the score / position / phase rows.
        // The kit HUD panels keep their fixed theme colors and does not dim at night.
        this.palette.set(C_HUD_TITLE, this.hudTitleBase.multiply(ambient));
        this.palette.set(C_HUD_SCORE, this.hudScoreBase.multiply(ambient));
        this.palette.set(C_HUD_POS, this.hudPosBase.multiply(ambient));
        this.palette.set(C_HUD_PHASE, this.hudFpsBase.multiply(ambient));

        // Hero shadow, softer at night.
        const shadowAlpha = Math.floor(60 + (ambient.r / 255) * 60);
        this.palette.set(C_HERO_SHADOW, new Color32(0, 0, 0, shadowAlpha));

        // Sprite ambient block: each base stone color is multiplied by the current
        // ambient to get the lit version. drawSprite uses offset = spriteColorCount so it
        // reads from this block.
        for (let i = 0; i < this.spriteColorCount; i++) {
            const base = this.spriteBaseColors[i];
            this.palette.set(SPRITE_BASE + this.spriteColorCount + i, base.multiply(ambient));
        }
    }

    // Draws the sky gradient and clouds using a slower second camera for parallax depth.
    renderSkyLayer() {
        // The sky camera x is only a fraction of the real one, so clouds drift slower
        // than the ground. It uses the same interpolated camera position as the ground
        // layer, so the two never drift apart from each other frame to frame.
        const paraX = Math.floor(this.cameraRenderPos.x * SKY_PARALLAX);
        BT.cameraSet(new Vector2i(paraX, 0));

        // Each band is GROUND_Y / SKY_BANDS pixels tall.
        const bandH = Math.ceil(GROUND_Y / SKY_BANDS);

        for (let band = 0; band < SKY_BANDS; band++) {
            this.tempRect.set(0, band * bandH, WORLD_W, bandH);
            BT.drawRectFill(this.tempRect, C_SKY_BASE + band);
        }

        // Clouds: two overlapping rectangles for a puffy look.
        for (const c of this.clouds) {
            this.tempRect.set(c.x, c.y, c.w, c.h);
            BT.drawRectFill(this.tempRect, C_CLOUD);
            this.tempRect.set(c.x + 8, c.y - 6, c.w - 16, c.h - 4);
            BT.drawRectFill(this.tempRect, C_CLOUD);
        }

        BT.cameraReset();
    }

    // Draws the grass strip, the tile row, and the building blocks in world space.
    renderGroundAndBuildings() {
        // Grass.
        this.tempRect.set(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);
        BT.drawRectFill(this.tempRect, C_GRASS);

        // Thin dark line at the top of the grass for depth.
        this.tempRect.set(0, GROUND_Y, WORLD_W, 3);
        BT.drawRectFill(this.tempRect, C_DIRTLINE);

        // Walkway tile row: each cell is a tile ID mapped to a palette color (Tilemap).
        this.renderGroundTileStrip();

        // Buildings: checker fill (Patterns) plus an outline frame.
        for (let i = 0; i < this.buildings.length; i++) {
            const b = this.buildings[i];
            const fillIdx = C_BUILDING_BASE + i * 2;
            const outlineIdx = fillIdx + 1;
            this.renderBuildingChecker(b, fillIdx, outlineIdx);
            this.tempRect.set(b.x, b.y, b.w, b.h);
            BT.drawRect(this.tempRect, outlineIdx);
        }
    }

    // Draws one 16 px tall row of tiles above the grass using the IDs in groundTileIds.
    renderGroundTileStrip() {
        const rowY = GROUND_Y - GROUND_TILE_SIZE;

        for (let col = 0; col < this.groundTileIds.length; col++) {
            const tileId = this.groundTileIds[col];
            const colorIndex = tileId === TILE_GRASS_ID ? C_GRASS : C_DIRT;
            const worldX = col * GROUND_TILE_SIZE;

            this.tempRect.set(worldX, rowY, GROUND_TILE_SIZE, GROUND_TILE_SIZE);
            BT.drawRectFill(this.tempRect, colorIndex);
        }
    }

    // Fills a building with alternating 4x4 blocks (the checker pattern from Patterns).
    // `fillIdx` is the palette index for the light squares, `outlineIdx` for the dark
    // ones.
    renderBuildingChecker(building, fillIdx, outlineIdx) {
        const cell = BUILDING_PATTERN_CELL;

        for (let py = building.y; py < building.y + building.h; py += cell) {
            for (let px = building.x; px < building.x + building.w; px += cell) {
                // `>> 2` divides by 4 (the cell size); an even cell sum picks the fill.
                const useFill = ((px >> 2) + (py >> 2)) % 2 === 0;
                const colorIndex = useFill ? fillIdx : outlineIdx;

                this.tempRect.set(px, py, cell, cell);
                BT.drawRectFill(this.tempRect, colorIndex);
            }
        }
    }

    // Moves the rock left and right automatically, turning around at the world edges.
    updateHeroMovement() {
        // Remember where the rock was before this tick moves it, so render() can draw a
        // smooth in-between position instead of a pop.
        this.heroPrevPos.set(this.heroPos.x, this.heroPos.y);

        let nextX = this.heroPos.x + HERO_SPEED * this.heroFacing;
        const margin = 2;

        if (nextX <= margin) {
            nextX = margin;
            this.heroFacing = 1;
        } else if (nextX + this.heroSize.x >= WORLD_W - margin) {
            nextX = WORLD_W - this.heroSize.x - margin;
            this.heroFacing = -1;
        }

        this.heroPos.x = nextX;
    }

    // Advances the step counter every WALK_FRAME_TICKS ticks, for the subtle bob of the
    // rock as it moves.
    updateWalkStep(tick) {
        if (this.walkFrameTimer.fireIfElapsed(tick)) {
            this.walkStep = (this.walkStep + 1) % 4;
        }
    }

    // Draws the rock sprite with a shadow underfoot. The sprite is drawn with
    // paletteOffset = spriteColorCount, which shifts each pixel index into the ambient
    // block (SPRITE_BASE+N..SPRITE_BASE+2N-1). Those slots are rewritten every tick in
    // updateWorldPalette() for the current ambient light, so the rock dims at night.
    renderHero() {
        if (!this.heroSheet || !this.heroSprite) {
            return;
        }

        // Blend heroPrevPos toward heroPos by BT.renderAlpha so the rock's drawn position
        // matches this exact render moment instead of only its last-tick position (same
        // idea as the camera blend in render() above).
        this.heroRenderPos.set(
            Math.round(this.heroPrevPos.x + (this.heroPos.x - this.heroPrevPos.x) * BT.renderAlpha),
            Math.round(this.heroPrevPos.y + (this.heroPos.y - this.heroPrevPos.y) * BT.renderAlpha),
        );

        // Tiny vertical bob based on walkStep: steps 0 and 2 are up, 1 and 3 at rest.
        const bob = this.walkStep % 2 === 0 ? -1 : 0;

        this.tempVec.set(this.heroRenderPos.x, this.heroRenderPos.y + bob);

        // The ambient offset shifts all pixel indices into the pre-lit block.
        BT.drawSprite(this.heroSheet, this.heroSprite, this.tempVec, this.spriteColorCount);

        // Shadow underfoot: a 2-pixel strip on the walk line, as wide as the rock's
        // visible pixels (x = 4 to 38 in the frame) minus a little at each end. It uses
        // heroRenderPos, not tempVec, so it stays on the ground while the rock bobs.
        // The engine draws rectangles before sprites, so the rock covers its top row.
        this.tempRect.set(this.heroRenderPos.x + 6, WALK_LINE_Y - 1, 30, 2);
        BT.drawRectFill(this.tempRect, C_HERO_SHADOW);
    }

    // Smoothly follows the hero, then clamps so the view never leaves the world.
    updateCameraFollow() {
        // Remember where the camera was before this tick's follow-lerp moves it.
        this.cameraPrevPos.set(this.cameraPos.x, this.cameraPos.y);

        const targetCamX = this.heroPos.x - DISPLAY_W / 2 + this.heroSize.x / 2;
        this.cameraXFloat += (targetCamX - this.cameraXFloat) * CAMERA_LERP;
        this.cameraPos.x = Math.floor(this.cameraXFloat);
        this.clampCamera();
    }

    // Keeps cameraPos.x between 0 and WORLD_W - DISPLAY_W.
    clampCamera() {
        const clamped = BT.cameraClamp(this.cameraPos, this.worldSize, BT.displaySize);
        this.cameraPos.x = clamped.x;
        this.cameraPos.y = clamped.y;
        this.cameraXFloat = this.cameraPos.x;
    }

    // +1 score every SCORE_INTERVAL_TICKS.
    updateScore(tick) {
        if (this.scoreTimer.fireIfElapsed(tick)) {
            this.score += 1;
        }
    }

    // Spawns three sparkles near the rock on a fixed schedule.
    updateParticlesSpawn(tick) {
        if (this.particleSpawnTimer.fireIfElapsed(tick)) {
            for (let i = 0; i < 3; i++) {
                const slot = PARTICLE_SLOT_START + (this.nextParticleSlot % MAX_PARTICLES);
                this.nextParticleSlot++;

                // Scatter each sparkle around the rock. BT.random.int(min, max) returns a
                // whole number from min up to but not including max, so int(-10, 10)
                // gives -10 to 9. The y range is lopsided on purpose: most offsets are
                // negative, which on screen means upward, so the sparkles gather above
                // the rock.
                const ox = BT.random.int(-10, 10);
                const oy = BT.random.int(-12, 4);

                this.particles.push({
                    // Spawn each sparkle near the center of the rock (half its real width
                    // and height in from the top-left corner), plus the random offset
                    // picked above.
                    pos: new Vector2i(
                        this.heroPos.x + this.heroSize.x / 2 + ox,
                        this.heroPos.y + this.heroSize.y / 2 + oy,
                    ),
                    spawnTick: tick,
                    paletteSlot: slot,
                });
            }
        }
    }

    // Removes particles older than 72 ticks (1.2 seconds).
    cleanupParticles(tick) {
        this.particles = this.particles.filter((p) => tick - p.spawnTick < 72);
    }

    // Updates each particle's palette slot with its current color. The hue comes from
    // spawnTick and age; the alpha fades out as the particle ages. The ambient tint is
    // applied too, so sparkles dim at night.
    updateParticleColors(tick) {
        const ambient = this.getAmbientTint();

        for (const p of this.particles) {
            const age = tick - p.spawnTick;
            const fade = 1 - age / 72;
            const alpha = Math.floor(200 * fade);

            const hue = (p.spawnTick * 7 + age * 4) % 360;
            const base = Color32.fromHSL(hue, 90, 65);
            const lit = base.multiply(ambient);

            this.palette.set(p.paletteSlot, new Color32(lit.r, lit.g, lit.b, alpha));
        }
    }

    // Draws the active particles as 3x3 colored squares. The colors were computed in
    // update(); render() only reads the slot.
    renderParticles() {
        for (const p of this.particles) {
            this.tempRect.set(p.pos.x - 1, p.pos.y - 1, 3, 3);
            BT.drawRectFill(this.tempRect, p.paletteSlot);
        }
    }

    // The HUD in screen space, built with the shared UI kit: a small Capstone panel with
    // the Save button in the top-left corner, a Score and time-of-day panel in the
    // top-right corner, and the "enable sound" hint down on the grass. The two panels
    // stay small so most of the sky and clouds stay visible. The Save button also listens
    // for the Space key, so keyboard, mouse, and touch all trigger the same PNG capture
    // (Image Output).
    renderHud() {
        // Anchor the group to the top-left corner; the kit sizes the panel to fit its
        // rows. panel() gives the group a background, border, and an amber title line.
        ui.begin(UI_ANCHORS.TOP_LEFT);
        ui.panel('Capstone');

        // The Save button returns true only on the frame it is clicked, tapped, or its
        // bound key (Space) is pressed. The `capturing` flag stops a second capture from
        // starting while the browser is still writing the first PNG.
        if (ui.button('Save PNG (Space)', { key: 'Space' }) && !this.capturing) {
            this.startCapture();
        }

        // Progress / result line for the capture, in the kit's accent color.
        if (this.capturing) {
            ui.label('Capturing...', { color: 'accent' });
        } else if (this.messageTimer > 0) {
            ui.label(this.lastCaptureMessage, { color: 'accent' });
        }

        ui.end();

        // Score and time of day, the two things a player of this scene would want to
        // see. kv() rows line their values up in a column; kvCols: 6 makes the key
        // column wide enough for "Score" plus a space.
        ui.begin(UI_ANCHORS.TOP_RIGHT, { kvCols: 6 });
        ui.panel('Status');
        ui.kv('Score', this.score);
        ui.kv('Time', this.getDayPhaseLabel());
        ui.end();

        // Browsers keep all sound muted until the player clicks or presses a key. This
        // kit row shows the standard warm "enable sound" hint only while the audio is
        // still locked, then disappears on its own. It sits on the plain grass in the
        // bottom-left corner, out of the way of the sky and the walking rock.
        ui.begin(UI_ANCHORS.BOTTOM_LEFT);
        ui.audioUnlockHint();
        ui.end();
    }

    // Starts one PNG download (Image Output). BT.downloadFrame() is asynchronous - it
    // hands the browser a file and resolves later - so `capturing` flips on now and the
    // result message (shown for 3 seconds via messageTimer) is set when the promise
    // settles.
    startCapture() {
        this.capturing = true;
        BT.downloadFrame('blit386-scene.png')
            .then(() => {
                this.lastCaptureMessage = 'Saved: blit386-scene.png';
                this.messageTimer = 180;
                this.capturing = false;
                BT.soundPlay(this.captureBlipClip);
                return null;
            })
            .catch((err) => {
                this.lastCaptureMessage = `Error: ${err.message}`;
                this.messageTimer = 180;
                this.capturing = false;
                console.error('[GameSceneDemo] Capture failed:', err);
            });
    }

    // Human-readable label for the current point in the day/night cycle. `tick` defaults
    // to BT.ticks.
    getDayPhaseLabel(tick = BT.ticks) {
        const phaseTick = tick % DAY_NIGHT_CYCLE_TICKS;

        if (phaseTick < DAY_NIGHT_CYCLE_TICKS * 0.25) {
            return 'Day';
        }

        if (phaseTick < DAY_NIGHT_CYCLE_TICKS * 0.5) {
            return 'Toward dusk';
        }

        if (phaseTick < DAY_NIGHT_CYCLE_TICKS * 0.75) {
            return 'Night';
        }

        return 'Toward dawn';
    }
}

bootstrap(Demo);
