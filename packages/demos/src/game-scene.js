// Demo 014 - Game Scene (CAPSTONE): one small world that uses almost everything from the series.
//
// This demo brings together everything you have learned!
//
// Written for readers about 12 years old. Prerequisites (do these first):
//   001-Basics       https://demos.blit386.dev/001-basics
//   002-Primitives   https://demos.blit386.dev/002-primitives
//   003-Colors       https://demos.blit386.dev/003-colors
//   004-Fonts        https://demos.blit386.dev/004-fonts
//   005-Pixel Art    https://demos.blit386.dev/005-pixel-art
//   006-Patterns     https://demos.blit386.dev/006-patterns
//   007-Camera       https://demos.blit386.dev/007-camera
//   008-Sprites      https://demos.blit386.dev/008-sprites
//   009-Animation    https://demos.blit386.dev/009-animation
//   010-Sprite-FX    https://demos.blit386.dev/010-sprite-effects
//   011-Starfield    https://demos.blit386.dev/011-starfield
//   012-Tilemap      https://demos.blit386.dev/012-tilemap
//   013-Image Output https://demos.blit386.dev/013-image-output
//
// Live article: https://vancura.dev/articles/blit386-game-scene
//
// WHAT YOU SEE (how the pieces connect):
//   - Sky gradient and slow-moving clouds = colors (003) + parallax idea from starfield (011).
//   - Scrolling ground, tile-ID sidewalk strip (012), checker buildings (006) = camera (007).
//   - Moving rock hero = sprites (008) and timing (009).
//   - Sparkles near the rock = small fading squares, like the particles in animation (009).
//   - Day and night = palette-based ambient lighting (010); the world dims at night.
//   - Background music with a real intro-then-loop point (037), plus a chime on every
//     day/night phase change and a blip on a successful PNG capture.
//   - Score, rock position, and day phase = engine overlay rows (004 + built-in FPS bar).
//   - A legend panel built with the shared UI kit (src/shared/ui.js) explains the mix and
//     holds a Save PNG button (013): click it, tap it on a touchscreen, or press Space.
//
// HOW THE DAY/NIGHT PALETTE WORKS:
//
// Instead of computing `base.multiply(ambient)` in render() and passing a Color32 to draw
// calls, we pre-compute those multiplied colors in update() and store them in dedicated
// palette slots. render() only ever uses palette index numbers.
//
// `Color32.multiply()` is a built-in engine method: it scales each channel of `base` by
// the matching channel of `ambient` and returns a new Color32. Think of it as shining a
// colored flashlight on a surface - a blue light on a red wall gives you a darker,
// purple-ish result.
//
// Example: the grass fill has a base color (50, 140, 70) and a reserved slot C_GRASS.
// Every tick in update(), we compute `grassBase.multiply(ambient)` and write it to C_GRASS.
// render() calls `BT.drawRectFill(rect, C_GRASS)` - no Color32 needed there.
//
// Think of it as updating the paint cans before the painter starts working.

import { applyEasing, AudioClip, bootstrap, BT, Color32, Rect2i, SpriteSheet, Timer, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */

// Internal game resolution.
const DISPLAY_W = 320;

// The level is wider than the screen so the camera can scroll (007-Camera).
const WORLD_W = 640;
const WORLD_H = 240;

// Where the sidewalk / grass starts.
const GROUND_Y = 188;

// One row of 16 px tiles along the sidewalk (012-Tilemap idea: small tile IDs in an array).
const GROUND_TILE_SIZE = 16;
const TILE_GRASS_ID = 1;
const TILE_DIRT_ID = 2;

// Checker squares inside buildings (006-Patterns idea: repeating blocks, no images).
const BUILDING_PATTERN_CELL = 4;

// How fast the rock moves along X each update tick.
const HERO_SPEED = 1;

// Walk frame timer: advance the "step" counter every 8 ticks.
const WALK_FRAME_TICKS = 8;

// Score +1 every 60 ticks (~1 second).
const SCORE_INTERVAL_TICKS = 60;

// Sparkle particle batch every 30 ticks.
const PARTICLE_SPAWN_INTERVAL = 30;

// Full day/night loop = 1200 ticks (~20 seconds at 60 FPS).
const DAY_NIGHT_CYCLE_TICKS = 1200;

// Camera smooth factor: each tick we step 14% closer to the target.
const CAMERA_LERP = 0.14;

// These two numbers come straight out of public/audio/music-intro-loop.loop.json, generated
// by scripts/generate-audio-loops.mjs (see 037-Music for the same track used in isolation).
const MUSIC_LOOP_START_SECONDS = 1.5;
const MUSIC_LOOP_END_SECONDS = 7.9;

// Parallax: clouds move at 22% of the real camera speed (parallax illusion).
const SKY_PARALLAX = 0.22;

// How many sky bands cover the height of the sky (from 0 to GROUND_Y).
const SKY_BANDS = 20;

// Maximum live particles at once.
const MAX_PARTICLES = 20;

// Static scene slots (never change after init).
// UI text and panel colors now come from the shared UI kit theme (slots 240 and up); the
// slots below belong to the scene itself.
const C_BLACK = 2; // Black for BT.clear.

// Dynamic world slots (updated every tick in update()).
// Sky bands: 10..10+SKY_BANDS-1 (20 slots).
const C_SKY_BASE = 10;

// Ground: 30..31.
const C_GRASS = 30;
const C_DIRTLINE = 31;

// Buildings: 4 buildings × 2 slots (fill + outline) = 8 slots at 32..39.
const C_BUILDING_BASE = 32;

// Clouds: 1 slot at 40.
const C_CLOUD = 40;

// HUD text: 41..44.
const C_HUD_TITLE = 41;
const C_HUD_SCORE = 42;
const C_HUD_POS = 43;
const C_HUD_PHASE = 44; // Colors the day-phase overlay row (Day / Night / ...).

// Hero shadow: 45.
const C_HERO_SHADOW = 45;

// Overlay bar fill (text slots reuse C_HUD_SCORE / C_HUD_POS / C_HUD_PHASE below).
const C_OVERLAY_BAR = 46;

// Particle slots: 50..69 (MAX_PARTICLES=20).
const PARTICLE_SLOT_START = 50;

// Sprite base colors extracted from test.png: 70..70+N-1.
// The ambient (lit) version of sprite colors: 70+N..70+2N-1.
const SPRITE_BASE = 70;

/**
 * One self-running mini scene: walking rock, following camera, HUD, day/night, sparkles.
 * All color computation happens in update(); render() uses only palette indices.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // The palette holds all colors used in this demo.
    /** @type {Palette | null} */
    palette = null;

    // Sprite sheet for the rock hero, loaded from /sprites/test.png.
    /** @type {SpriteSheet | null} */
    heroSheet = null;

    /** @type {AudioClip | null} Looping background music with a distinct intro section. */
    musicClip = null;

    /** @type {AudioClip | null} Short chime played on every day/night phase change. */
    dayPhaseChimeClip = null;

    /** @type {AudioClip | null} Confirmation blip played after a successful PNG capture. */
    captureBlipClip = null;

    /** @type {string | null} Day phase label as of the previous tick, used to detect changes. */
    lastDayPhaseLabel = null;

    // The full source rectangle for the hero sprite.
    /** @type {Rect2i | null} */
    heroSprite = null;

    // Hero sprite size in world pixels, read from the loaded sheet in init()
    // (test.png is 44x44). Deriving it from the real image - instead of guessing a
    // number here - keeps movement bounds, camera centering, and particle spawns
    // matching what is actually drawn on screen.
    /** @type {Vector2i} */
    heroSize = new Vector2i(0, 0);

    // How many unique colors the sprite has (N).
    spriteColorCount = 0;

    // Original Color32 objects for the sprite's colors (for ambient multiplication).
    spriteBaseColors = [];

    // Rock position in world pixels. The Y here is a placeholder: init() sets the
    // real Y once the sprite has loaded and its true height is known, so the rock
    // stands exactly on the ground line.
    heroPos = new Vector2i(120, 0);

    // Rock position at the START of the most recent update() tick, before this tick's
    // walk step moved it. render() blends between heroPrevPos and heroPos using
    // BT.renderAlpha so the rock glides smoothly between physics ticks instead of
    // jumping - see "Interpolating render state with renderAlpha" in the engine's
    // docs/api-game-loop.md. init() snaps this to match heroPos so the very first
    // frame does not blend in from a stale position.
    heroPrevPos = new Vector2i(120, 0);

    // +1 = moving right, -1 = moving left.
    heroFacing = 1;

    // Walk "step" counter (not a frame index - just bobs the rock position slightly).
    walkStep = 0;
    walkFrameTimer = new Timer(WALK_FRAME_TICKS);

    // Camera top-left in world coordinates.
    cameraPos = new Vector2i(0, 0);

    // Camera position at the START of the most recent update() tick, before this tick's
    // follow-lerp moved it. render() blends between this and cameraPos using
    // BT.renderAlpha for the same reason as heroPrevPos above.
    cameraPrevPos = new Vector2i(0, 0);

    // Reused every render() call for the render-time (interpolated) camera and hero
    // positions, so we do not allocate new Vector2i instances every frame.
    cameraRenderPos = new Vector2i(0, 0);
    heroRenderPos = new Vector2i(0, 0);

    // Float version for smooth lerp without pixel jitter.
    cameraXFloat = 0;

    // Simple score counter.
    score = 0;
    scoreTimer = new Timer(SCORE_INTERVAL_TICKS);

    // Particle spawn timer.
    particleSpawnTimer = new Timer(PARTICLE_SPAWN_INTERVAL);

    // Active particle objects: { pos, spawnTick, paletteSlot }.
    particles = [];

    // Rotating pool index for particle palette slots.
    nextParticleSlot = 0;

    // World decoration: buildings and clouds (built once in init).
    buildings = [];
    clouds = [];

    // Tile IDs for one sidewalk row (012): each entry is TILE_GRASS_ID or TILE_DIRT_ID.
    groundTileIds = [];

    // PNG capture state (013): the legend's Save button (click, tap, or Space)
    // triggers BT.downloadFrame once per press.
    capturing = false;
    lastCaptureMessage = '';
    messageTimer = 0;

    // Base colors for buildings and clouds (used in update() for ambient multiplication).
    buildingFills = [];
    buildingOutlines = [];
    cloudBaseColor = new Color32(230, 240, 255, 200);
    grassBaseColor = new Color32(50, 140, 70);
    dirtBaseColor = new Color32(40, 100, 55);

    // Reused rectangle and vector to avoid creating new objects every frame.
    tempRect = new Rect2i(0, 0, 0, 0);
    tempVec = new Vector2i(0, 0);
    worldSize = new Vector2i(WORLD_W, WORLD_H); // pre-allocated for cameraClamp calls

    // Sky band colors: top and horizon base values for the gradient.
    skyTop = new Color32(40, 70, 140);
    skyHorizon = new Color32(120, 170, 220);

    // HUD text colors (base values before ambient is applied).
    hudTitleBase = new Color32(255, 230, 180);
    hudScoreBase = new Color32(200, 220, 255);
    hudPosBase = new Color32(180, 200, 180);
    hudFpsBase = new Color32(150, 150, 160);

    // Reused every frame for overlay rows (score, rock position, day phase).
    overlayRowData = [
        { leftText: 'Score 0', textPaletteIndex: C_HUD_SCORE },
        { leftText: 'Rock (0, 0)', textPaletteIndex: C_HUD_POS },
        { leftText: 'Dawn/Day', textPaletteIndex: C_HUD_PHASE },
    ];

    /**
     * Palette slots for the engine overlay bars (FPS strip uses the engine defaults).
     *
     * The live palette grid at the bottom shows which slots this frame's draw calls
     * use (helpful for day/night tinting and sprite palette blocks). Thirty-two swatches
     * per row, three visible rows; scroll to browse the full 256-slot palette.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            // The engine normally shows a tiny "~" toggle hint in the bottom-left
            // corner so people know they can press the Backquote key (`) to open the
            // stats overlay. This is an immersive game scene, so we hide that hint to
            // keep the picture clean. The overlay still works: press ` to reveal the
            // full dev HUD (timing chart and palette grid) on demand, then ` again to
            // hide it. Teaching demos leave this hint visible (the default) so newcomers
            // can find it.
            isOverlayToggleHintVisible: false,

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

    /**
     * Loads the hero sprite sheet, builds the palette, and places buildings and clouds.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        console.log('[GameSceneDemo] Initializing...');

        // Create palette and set static slots
        // The shared UI kit needs its twelve theme colors in the palette before any widget
        // draws. applyTheme() writes them into high slots (240 and up), far above this
        // demo's scene slots (which top out around slot 110 at the sprite ambient block).
        // This demo never needs the returned slot map, so the call is side effect only.
        this.palette = BT.paletteCreate(256);
        applyTheme(this.palette);

        this.palette.set(C_BLACK, new Color32(0, 0, 0));
        this.palette.set(C_OVERLAY_BAR, new Color32(0, 0, 0, 180)); // overlay row backgrounds

        // Pre-fill particle slots as transparent.
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.palette.set(PARTICLE_SLOT_START + i, new Color32(0, 0, 0, 0));
        }

        // Build world decoration and the sidewalk tile-ID row (Demo 012).
        this.buildWorldDecor();
        this.buildGroundTileStrip();

        // Extract sprite colors and register in palette
        // Ask the engine to scan the PNG and add every unique color it finds into our palette,
        // starting at SPRITE_BASE. The returned array is the same colors in palette-write order
        // (sorted darkest-first by brightness). We keep them so updateWorldPalette() can
        // multiply each base color by the current ambient tint and write the lit version into
        // the higher "ambient block" (SPRITE_BASE+N..SPRITE_BASE+2N-1).
        this.spriteBaseColors = await SpriteSheet.loadColorsIntoPalette('/sprites/test.png', this.palette, SPRITE_BASE);

        const colorCount = this.spriteBaseColors.length;
        this.spriteColorCount = colorCount;

        // Pre-fill the "ambient sprite" block (SPRITE_BASE+N..SPRITE_BASE+2N-1).
        // update() will recalculate these every tick based on the current ambient light.
        for (let i = 0; i < colorCount; i++) {
            this.palette.set(SPRITE_BASE + colorCount + i, this.spriteBaseColors[i]);
        }

        // Load hero sprite
        const indexed = await SpriteSheet.loadIndexed('/sprites/test.png', this.palette, SPRITE_BASE, {
            sort: 'none',
        });
        this.heroSheet = indexed.sheet;
        this.heroSprite = this.heroSheet.fullRect();
        BT.paletteSet(this.palette);
        console.log(`[GameSceneDemo] Loaded sprite: ${this.heroSprite.width}x${this.heroSprite.height}px`);

        // Read the hero's real size from the loaded sheet (44x44 for test.png), the
        // same way demos 033 and 034 do. Every bit of math below - movement bounds,
        // camera centering, particle spawns - uses this size, so the logic always
        // matches the picture on screen.
        this.heroSize.set(this.heroSheet.size.x, this.heroSheet.size.y);

        // Stand the rock on the ground line: the sprite's top-left Y is the ground
        // minus the sprite's height, so its bottom edge touches GROUND_Y exactly.
        this.heroPos.y = GROUND_Y - this.heroSize.y;

        // Snap heroPrevPos to match so the very first render does not blend in from
        // the placeholder position the class fields started with.
        this.heroPrevPos.set(this.heroPos.x, this.heroPos.y);

        // Place camera on the hero to start.
        this.cameraXFloat = this.heroPos.x - DISPLAY_W / 2 + this.heroSize.x / 2;
        this.cameraPos.x = Math.floor(this.cameraXFloat);
        this.cameraPos.y = 0;
        this.clampCamera();

        // Snap cameraPrevPos to match the starting camera position so the very first
        // render does not blend in from (0, 0).
        this.cameraPrevPos.set(this.cameraPos.x, this.cameraPos.y);

        // Load and start all sound: music, the day/night chime, and the capture blip.
        await this.initAudio();

        console.log('[GameSceneDemo] Ready.');
        return true;
    }

    /**
     * Loads the music track, synthesizes the two sound effects, and starts the music.
     * Called once from init(); split out so the audio setup reads as one clear step.
     */
    async initAudio() {
        // Background music: a real intro-then-loop track, the same one 037-Music
        // demonstrates in isolation. BT.musicPlay() called before the page is unlocked is
        // "remembered" and starts for real the instant the player clicks or presses a key.
        this.musicClip = await AudioClip.load('/audio/music-intro-loop.wav');
        BT.musicPlay(this.musicClip, {
            loop: true,
            loopStart: MUSIC_LOOP_START_SECONDS,
            loopEnd: MUSIC_LOOP_END_SECONDS,
        });

        // A soft rising chime for day/night transitions, and BT.synthPreset.blip() (the
        // same UI blip 041-Synth Toy uses) for a successful capture.
        this.dayPhaseChimeClip = await AudioClip.synth({
            waveform: 'sine',
            frequency: 660,
            duration: 0.6,
            volume: 0.5,
            envelope: { attack: 0.02, decay: 0.15, sustain: 0.3, release: 0.4 },
            seed: 1,
        });
        this.captureBlipClip = await AudioClip.synth(BT.synthPreset.blip());

        // Remember the starting day phase so updateDayPhaseSound() only chimes when
        // the phase actually changes, not on the very first tick.
        this.lastDayPhaseLabel = this.getDayPhaseLabel();
    }

    /**
     * Fixed-step logic: moves the rock, camera, score, and particles,
     * then recalculates all ambient-lit palette colors.
     */
    update() {
        // Let the shared UI kit latch keyboard shortcuts and touch contacts for this tick.
        // This must run before anything else so the Save button's Space binding works.
        ui.tick();

        const tick = BT.ticks;

        this.updateDayPhaseSound(tick);

        // The PNG capture itself now starts from the kit's Save button in renderLegend().
        // Here we only count down the "Saved: ..." message so it disappears after a while.
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

        // Recalculate all ambient-lit palette colors.
        // This is the core of the day/night system.
        this.updateWorldPalette();
    }

    /**
     * Plays a short chime the instant the day/night phase label changes (Day -> Toward dusk
     * -> Night -> Toward dawn -> Day...). Comparing this tick's label against last tick's
     * label is the same "edge detection" idea 028-Keyboard Input uses for key presses - we
     * only care about the moment something changes, not every tick it stays the same.
     *
     * @param {number} tick - Current engine tick (BT.ticks).
     */
    updateDayPhaseSound(tick) {
        const currentPhase = this.getDayPhaseLabel(tick);

        if (this.lastDayPhaseLabel !== null && currentPhase !== this.lastDayPhaseLabel) {
            BT.soundPlay(this.dayPhaseChimeClip);
        }

        this.lastDayPhaseLabel = currentPhase;
    }

    /**
     * Draws world layers back-to-front. HUD text is handled by the engine overlay.
     * Every draw call uses only palette index numbers - no Color32 objects.
     */
    render() {
        BT.clear(C_BLACK);

        // Blend cameraPrevPos toward cameraPos by BT.renderAlpha - a fraction from 0
        // (a tick just finished) to just under 1 (the next tick is about to happen) -
        // so the camera's on-screen position matches this exact render moment instead
        // of only its last-tick position. Both the sky parallax below and the full
        // camera offset use this same smoothed value, so the layers never drift apart.
        this.cameraRenderPos.set(
            Math.floor(this.cameraPrevPos.x + (this.cameraPos.x - this.cameraPrevPos.x) * BT.renderAlpha),
            Math.floor(this.cameraPrevPos.y + (this.cameraPos.y - this.cameraPrevPos.y) * BT.renderAlpha),
        );

        // Layer 1: sky and clouds with parallax.
        this.renderSkyLayer();

        // Layer 2: world with full camera offset.
        BT.cameraSet(this.cameraRenderPos);
        this.renderGroundAndBuildings();
        this.renderParticles();
        this.renderHero();
        BT.cameraReset();

        // First-time legend and capture hint (screen space, not scrolled with the world).
        this.renderLegend();

        // Score, rock position, and day phase are drawn in overlayRows() above the FPS bar.
    }

    /**
     * Score, rock position, and day/night phase for the engine overlay.
     * Text colors are updated each tick in updateWorldPalette() so they dim at night.
     *
     * @returns {readonly { leftText: string, rightText?: string }[]}
     */
    overlayRows() {
        this.overlayRowData[0].leftText = `Score ${this.score}`;
        this.overlayRowData[1].leftText = `Rock (${this.heroPos.x}, ${this.heroPos.y})`;
        this.overlayRowData[2].leftText = this.getDayPhaseLabel();

        return this.overlayRowData;
    }

    /**
     * Fills groundTileIds with alternating grass/dirt tile IDs for one 16 px row (Demo 012).
     */
    buildGroundTileStrip() {
        const cols = Math.ceil(WORLD_W / GROUND_TILE_SIZE);
        this.groundTileIds = [];

        for (let col = 0; col < cols; col++) {
            // Simple pattern: two grass tiles, then two dirt tiles, repeat.
            this.groundTileIds.push(col % 4 < 2 ? TILE_GRASS_ID : TILE_DIRT_ID);
        }
    }

    /**
     * Places buildings and clouds once at startup.
     * Stores their base colors in separate arrays so update() can apply ambient.
     */
    buildWorldDecor() {
        const rawBuildings = [
            { x: 40, y: GROUND_Y - 52, w: 36, h: 52, fill: new Color32(140, 90, 70), outline: new Color32(80, 50, 40) },
            {
                x: 200,
                y: GROUND_Y - 70,
                w: 44,
                h: 70,
                fill: new Color32(110, 120, 140),
                outline: new Color32(60, 70, 90),
            },
            {
                x: 380,
                y: GROUND_Y - 46,
                w: 32,
                h: 46,
                fill: new Color32(160, 100, 100),
                outline: new Color32(100, 50, 50),
            },
            {
                x: 500,
                y: GROUND_Y - 60,
                w: 40,
                h: 60,
                fill: new Color32(120, 130, 100),
                outline: new Color32(70, 80, 60),
            },
        ];

        for (const b of rawBuildings) {
            this.buildings.push({ x: b.x, y: b.y, w: b.w, h: b.h });
            this.buildingFills.push(b.fill);
            this.buildingOutlines.push(b.outline);
        }

        this.clouds = [
            { x: 30, y: 24, w: 42, h: 14 },
            { x: 160, y: 40, w: 56, h: 18 },
            { x: 320, y: 18, w: 48, h: 16 },
            { x: 480, y: 36, w: 50, h: 15 },
            { x: 600, y: 22, w: 44, h: 17 },
        ];
    }

    /**
     * Computes the current ambient tint based on the day/night cycle.
     * Returns a Color32 that represents the current "color of the light".
     * Bright white = midday; dark blue = midnight.
     *
     * This is called in update() to drive the palette, not in render().
     *
     * @returns {Color32} The ambient light color.
     */
    getAmbientTint() {
        const tick = BT.ticks;
        const cycle = (tick % DAY_NIGHT_CYCLE_TICKS) / DAY_NIGHT_CYCLE_TICKS;

        // Math.cos returns -1..1. (cos + 1) / 2 gives 0..1 for "how bright is the sun".
        const dayAmount = (Math.cos(cycle * Math.PI * 2) + 1) * 0.5;

        // Interpolate from a cool night color to a warm day color.
        const r = Math.floor(70 + dayAmount * 185);
        const g = Math.floor(75 + dayAmount * 180);
        const b = Math.floor(120 + dayAmount * 135);

        return new Color32(r, g, b);
    }

    /**
     * Recalculates all ambient-dependent palette entries.
     * Called every tick in update() so render() always has up-to-date slot values.
     */
    updateWorldPalette() {
        const ambient = this.getAmbientTint();

        // Sky gradient bands
        for (let band = 0; band < SKY_BANDS; band++) {
            // t goes 0 at the top to 1 near the horizon.
            const t = band / SKY_BANDS;

            // applyEasing(t, 'ease-in-out') squishes the transition so it moves slowly
            // near the top, speeds up through the middle, then slows again near the horizon.
            // Real skies work the same way: a deep uniform color at the zenith, a quick
            // color shift through the middle bands, then a flatter wash near the horizon.
            // lerp(other, t) blends smoothly between two Color32 values at position t,
            // where t=0 is all skyTop and t=1 is all skyHorizon.
            const bandBase = this.skyTop.lerp(this.skyHorizon, applyEasing(t, 'ease-in-out'));
            this.palette.set(C_SKY_BASE + band, bandBase.multiply(ambient));
        }

        // Ground
        this.palette.set(C_GRASS, this.grassBaseColor.multiply(ambient));
        this.palette.set(C_DIRTLINE, this.dirtBaseColor.multiply(ambient));

        // Buildings
        for (let i = 0; i < this.buildings.length; i++) {
            this.palette.set(C_BUILDING_BASE + i * 2, this.buildingFills[i].multiply(ambient));
            this.palette.set(C_BUILDING_BASE + i * 2 + 1, this.buildingOutlines[i].multiply(ambient));
        }

        // Clouds
        this.palette.set(C_CLOUD, this.cloudBaseColor.multiply(ambient));

        // Engine overlay text (subtle night tint on the score / position / phase rows).
        // The kit legend panel keeps its fixed theme colors and does not dim at night.
        this.palette.set(C_HUD_TITLE, this.hudTitleBase.multiply(ambient));
        this.palette.set(C_HUD_SCORE, this.hudScoreBase.multiply(ambient));
        this.palette.set(C_HUD_POS, this.hudPosBase.multiply(ambient));
        this.palette.set(C_HUD_PHASE, this.hudFpsBase.multiply(ambient));

        // Hero shadow
        const shadowAlpha = Math.floor(60 + (ambient.r / 255) * 60); // Softer at night.
        this.palette.set(C_HERO_SHADOW, new Color32(0, 0, 0, shadowAlpha));

        // Sprite ambient block
        // Each base stone color is multiplied by the current ambient to get the lit version.
        // drawSprite uses offset = spriteColorCount so it reads from this "ambient block".
        for (let i = 0; i < this.spriteColorCount; i++) {
            const base = this.spriteBaseColors[i];
            this.palette.set(SPRITE_BASE + this.spriteColorCount + i, base.multiply(ambient));
        }
    }

    /**
     * Draws the sky gradient and clouds using a slower fake camera for parallax depth.
     */
    renderSkyLayer() {
        // Fake camera X is only a fraction of the real one: clouds drift slower than ground.
        // Uses the same render-time (interpolated) camera position as the ground layer
        // below, so the two never drift apart from each other frame to frame.
        const paraX = Math.floor(this.cameraRenderPos.x * SKY_PARALLAX);
        BT.cameraSet(new Vector2i(paraX, 0));

        // Each band is GROUND_Y/SKY_BANDS pixels tall.
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

    /**
     * Draws the grass strip and building blocks in world space.
     */
    renderGroundAndBuildings() {
        // Grass.
        this.tempRect.set(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);
        BT.drawRectFill(this.tempRect, C_GRASS);

        // Thin dark line at the top of the grass for depth.
        this.tempRect.set(0, GROUND_Y, WORLD_W, 3);
        BT.drawRectFill(this.tempRect, C_DIRTLINE);

        // Sidewalk tile row: each cell is a tile ID mapped to a palette color (Demo 012).
        this.renderGroundTileStrip();

        // Buildings: checker fill (Demo 006) plus outline frame.
        for (let i = 0; i < this.buildings.length; i++) {
            const b = this.buildings[i];
            const fillIdx = C_BUILDING_BASE + i * 2;
            const outlineIdx = fillIdx + 1;
            this.renderBuildingChecker(b, fillIdx, outlineIdx);
            this.tempRect.set(b.x, b.y, b.w, b.h);
            BT.drawRect(this.tempRect, outlineIdx);
        }
    }

    /**
     * Draws one 16 px tall row of tiles above the grass using tile IDs from groundTileIds.
     */
    renderGroundTileStrip() {
        const rowY = GROUND_Y - GROUND_TILE_SIZE;

        for (let col = 0; col < this.groundTileIds.length; col++) {
            const tileId = this.groundTileIds[col];
            const colorIndex = tileId === TILE_GRASS_ID ? C_GRASS : C_DIRTLINE;
            const worldX = col * GROUND_TILE_SIZE;

            this.tempRect.set(worldX, rowY, GROUND_TILE_SIZE, GROUND_TILE_SIZE);
            BT.drawRectFill(this.tempRect, colorIndex);
        }
    }

    /**
     * Fills a building with alternating 4x4 blocks (checker pattern from Demo 006).
     *
     * @param {{ x: number, y: number, w: number, h: number }} building
     * @param {number} fillIdx palette index for "light" squares
     * @param {number} outlineIdx palette index for "dark" squares
     */
    renderBuildingChecker(building, fillIdx, outlineIdx) {
        const cell = BUILDING_PATTERN_CELL;

        for (let py = building.y; py < building.y + building.h; py += cell) {
            for (let px = building.x; px < building.x + building.w; px += cell) {
                const useFill = ((px >> 2) + (py >> 2)) % 2 === 0;
                const colorIndex = useFill ? fillIdx : outlineIdx;

                this.tempRect.set(px, py, cell, cell);
                BT.drawRectFill(this.tempRect, colorIndex);
            }
        }
    }

    /**
     * Moves the rock left/right automatically, bouncing off world edges.
     */
    updateHeroMovement() {
        // Remember where the rock was before this tick moves it, so render() can
        // draw a smooth in-between position instead of a pop.
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

    /**
     * Advances a step counter every WALK_FRAME_TICKS ticks.
     * Used to add a subtle bob to the rock as it moves.
     *
     * @param {number} tick - Current tick.
     */
    updateWalkStep(tick) {
        if (this.walkFrameTimer.fireIfElapsed(tick)) {
            this.walkStep = (this.walkStep + 1) % 4;
        }
    }

    /**
     * Draws the rock sprite with a shadow underfoot.
     * The sprite is drawn with paletteOffset = spriteColorCount, which shifts each pixel
     * index into the "ambient block" (SPRITE_BASE+N..SPRITE_BASE+2N-1).
     * Those slots are updated every tick in updateWorldPalette() to reflect the current
     * ambient light, so the rock automatically dims at night.
     */
    renderHero() {
        if (!this.heroSheet || !this.heroSprite) {
            return;
        }

        // Blend heroPrevPos toward heroPos by BT.renderAlpha so the rock's drawn
        // position matches this exact render moment instead of only its last-tick
        // position (same idea as the camera blend in render() above).
        this.heroRenderPos.set(
            Math.round(this.heroPrevPos.x + (this.heroPos.x - this.heroPrevPos.x) * BT.renderAlpha),
            Math.round(this.heroPrevPos.y + (this.heroPos.y - this.heroPrevPos.y) * BT.renderAlpha),
        );

        // Tiny vertical bob based on walkStep (steps 0,2 are up; 1,3 are at rest).
        const bob = this.walkStep % 2 === 0 ? -1 : 0;

        this.tempVec.set(this.heroRenderPos.x, this.heroRenderPos.y + bob);

        // The ambient offset shifts all pixel indices into the pre-lit block.
        BT.drawSprite(this.heroSheet, this.heroSprite, this.tempVec, this.spriteColorCount);

        // Shadow underfoot.
        const shadowY = this.heroRenderPos.y + this.heroSprite.height - 2;
        this.tempRect.set(this.heroRenderPos.x + 2, shadowY, this.heroSprite.width - 4, 3);
        BT.drawRectFill(this.tempRect, C_HERO_SHADOW);
    }

    /**
     * Smoothly follows the hero, then clamps so the view never leaves the world.
     */
    updateCameraFollow() {
        // Remember where the camera was before this tick's follow-lerp moves it.
        this.cameraPrevPos.set(this.cameraPos.x, this.cameraPos.y);

        const targetCamX = this.heroPos.x - DISPLAY_W / 2 + this.heroSize.x / 2;
        this.cameraXFloat += (targetCamX - this.cameraXFloat) * CAMERA_LERP;
        this.cameraPos.x = Math.floor(this.cameraXFloat);
        this.clampCamera();
    }

    /**
     * Keeps cameraPos.x between 0 and WORLD_W - DISPLAY_W.
     */
    clampCamera() {
        const clamped = BT.cameraClamp(this.cameraPos, this.worldSize, BT.displaySize);
        this.cameraPos.x = clamped.x;
        this.cameraPos.y = clamped.y;
        this.cameraXFloat = this.cameraPos.x;
    }

    /**
     * +1 score every SCORE_INTERVAL_TICKS.
     *
     * @param {number} tick - Current tick.
     */
    updateScore(tick) {
        if (this.scoreTimer.fireIfElapsed(tick)) {
            this.score += 1;
        }
    }

    /**
     * Spawns a handful of sparkles near the rock on a fixed schedule.
     *
     * @param {number} tick - Current tick.
     */
    updateParticlesSpawn(tick) {
        if (this.particleSpawnTimer.fireIfElapsed(tick)) {
            for (let i = 0; i < 3; i++) {
                const slot = PARTICLE_SLOT_START + (this.nextParticleSlot % MAX_PARTICLES);
                this.nextParticleSlot++;

                const ox = Math.floor(Math.random() * 20) - 10;
                const oy = Math.floor(Math.random() * 16) - 12;

                this.particles.push({
                    // Spawn each sparkle near the center of the rock (half its real
                    // width and height in from the top-left corner), plus the random
                    // offset picked above.
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

    /**
     * Removes particles older than 72 ticks (~1.2 seconds).
     *
     * @param {number} tick - Current tick.
     */
    cleanupParticles(tick) {
        this.particles = this.particles.filter((p) => tick - p.spawnTick < 72);
    }

    /**
     * Updates each particle's palette slot with its current color.
     * Hue comes from spawnTick; alpha fades out as the particle ages.
     * The ambient tint is also applied so sparkles dim at night.
     *
     * @param {number} tick - Current tick.
     */
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

    /**
     * Draws active particles as 3x3 colored squares.
     * Colors were already computed in update() - render() just reads the slot.
     */
    renderParticles() {
        for (const p of this.particles) {
            this.tempRect.set(p.pos.x - 1, p.pos.y - 1, 3, 3);
            BT.drawRectFill(this.tempRect, p.paletteSlot);
        }
    }

    /**
     * Short legend for first-time viewers (screen space, top-left), built with the shared
     * UI kit. The Save button also listens for the Space key, so keyboard, mouse, and
     * touch all trigger the same PNG capture (Demo 013).
     */
    renderLegend() {
        // Anchor the group to the top-left corner; the kit sizes the panel to fit its rows.
        ui.begin('topLeft');

        // panel() gives the group a background, border, and an amber title line.
        ui.panel('Capstone: scroll, tiles, sprite, day/night');

        // A dim (secondary) line pointing back at the demos these visuals come from.
        ui.label('Tiles + checker = demos 012 + 006', { color: 'dim' });

        // The Save button returns true only on the frame it is clicked, tapped, or its
        // bound key (Space) is pressed. The `capturing` flag stops a second capture from
        // starting while the browser is still writing the first PNG.
        if (ui.button('Save PNG (Space)', { key: 'Space' }) && !this.capturing) {
            this.startCapture();
        }

        // Progress / result line for the capture, in the kit's green accent color.
        if (this.capturing) {
            ui.label('Capturing...', { color: 'accent' });
        } else if (this.messageTimer > 0) {
            ui.label(this.lastCaptureMessage, { color: 'accent' });
        }

        // Browsers keep all sound muted until the player clicks or presses a key.
        // This kit row shows the standard warm "enable sound" hint only while the
        // audio is still locked, then disappears on its own.
        ui.audioUnlockHint();

        ui.end();
    }

    /**
     * Starts one PNG download (Demo 013). BT.downloadFrame() is asynchronous - it hands
     * the browser a file and resolves later - so we flip `capturing` on now and set the
     * result message (shown for ~3 seconds via messageTimer) when the promise settles.
     */
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

    /**
     * Human-readable label for where we are in the day/night cycle.
     *
     * @param {number} [tick] - Tick to evaluate (defaults to {@link BT.ticks}).
     * @returns {string}
     */
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
