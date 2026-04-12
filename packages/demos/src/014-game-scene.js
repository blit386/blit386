// Demo 014 -- Game Scene (CAPSTONE): one small world that uses almost everything from the series.
//
// This demo brings together everything you have learned!
//
// Written for readers about 12 years old. Prerequisites (do these first):
//   001-Basics       https://vancura.dev/articles/blit-tech-basics
//   002-Primitives   https://vancura.dev/articles/blit-tech-primitives
//   003-Colors       https://vancura.dev/articles/blit-tech-colors
//   004-Fonts        https://vancura.dev/articles/blit-tech-fonts
//   005-Pixel Art    https://vancura.dev/articles/blit-tech-pixel-art
//   006-Patterns     https://vancura.dev/articles/blit-tech-patterns
//   007-Camera       https://vancura.dev/articles/blit-tech-camera
//   008-Sprites      https://vancura.dev/articles/blit-tech-sprites
//   009-Animation    https://vancura.dev/articles/blit-tech-animation
//   010-Sprite-FX    https://vancura.dev/articles/blit-tech-sprite-effects
//   011-Starfield    https://vancura.dev/articles/blit-tech-starfield
//   012-Tilemap      https://vancura.dev/articles/blit-tech-tilemap
//   013-Image Output https://vancura.dev/articles/blit-tech-image-output
//
// Live article: https://vancura.dev/articles/blit-tech-game-scene
//
// WHAT YOU SEE (how the pieces connect):
//   - Sky gradient and slow-moving clouds = colors (003) + parallax idea from starfield (011).
//   - Scrolling ground and blocky buildings = camera over a bigger world (007).
//   - Moving rock hero = sprites (008) and timing (009).
//   - Sparkles near the rock = small fading squares, like the particles in animation (009).
//   - Day and night = palette-based ambient lighting (010); the world dims at night.
//   - Score, position, FPS on top = bitmap text HUD (004).
//
// HOW THE DAY/NIGHT PALETTE WORKS:
//
// Instead of computing `multiplyColor(base, ambient)` in render() and passing a Color32
// to draw calls, we pre-compute those multiplied colors in update() and store them in
// dedicated palette slots. render() only ever uses palette index numbers.
//
// Example: the grass fill has a base color (50, 140, 70) and a reserved slot C_GRASS.
// Every tick in update(), we compute `ambient * base` and write it to C_GRASS.
// render() calls `BT.drawRectFill(rect, C_GRASS)` -- no Color32 needed there.
//
// Think of it as updating the paint cans before the painter starts working.

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Constants

// Internal game resolution.
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// The level is wider than the screen so the camera can scroll (007-Camera).
const WORLD_W = 640;
const WORLD_H = 240;

// Where the sidewalk / grass starts.
const GROUND_Y = 188;

// Rock sprite size in world pixels.
const HERO_W = 16; // Adjusted to a reasonable display size; actual sprite may differ.
const HERO_H = 16;

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

// Parallax: clouds move at 22% of the real camera speed (parallax illusion).
const SKY_PARALLAX = 0.22;

// How many sky bands cover the height of the sky (from 0 to GROUND_Y).
const SKY_BANDS = 20;

// Maximum live particles at once.
const MAX_PARTICLES = 20;

// #endregion

// #region Palette Constants

// Static UI slots (never change after initialize).
const C_WHITE = 1; // Font base color.
const C_BLACK = 2; // Black for BT.clear.
const C_HUD_BAR = 3; // (0,0,0,150) semi-transparent HUD overlay.

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
const C_HUD_FPS = 44;

// Hero shadow: 45.
const C_HERO_SHADOW = 45;

// Particle slots: 50..69 (MAX_PARTICLES=20).
const PARTICLE_SLOT_START = 50;

// Sprite base colors extracted from test.png: 70..70+N-1.
// The ambient (lit) version of sprite colors: 70+N..70+2N-1.
const SPRITE_BASE = 70;

// #endregion

// #region Helpers

/**
 * "Multiplies" two colors the same way a sprite tint does: each channel is scaled 0-255.
 * Used in update() to compute ambient-lit versions of base colors for palette slots.
 *
 * Think of it as shining a colored flashlight on a surface. A blue light on a red wall
 * gives you a darker, purple-ish result.
 *
 * @param {Color32} base - The original paint color (grass green, brick red, etc.).
 * @param {Color32} ambient - The lighting tint (bright = day, dark blue = night).
 * @returns {Color32} A new color representing base under ambient lighting.
 */
function multiplyColor(base, ambient) {
    return new Color32(
        Math.floor((base.r * ambient.r) / 255),
        Math.floor((base.g * ambient.g) / 255),
        Math.floor((base.b * ambient.b) / 255),
        base.a,
    );
}

// #endregion

// #region Demo Class

/**
 * One self-running mini scene: walking rock, following camera, HUD, day/night, sparkles.
 * All color computation happens in update(); render() uses only palette indices.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The palette holds all colors used in this demo.
    palette = null;

    // Sprite sheet for the rock hero, loaded from /sprites/test.png.
    heroSheet = null;

    // The full source rectangle for the hero sprite.
    heroSprite = null;

    // How many unique colors the sprite has (N).
    spriteColorCount = 0;

    // Original Color32 objects for the sprite's colors (for ambient multiplication).
    spriteBaseColors = [];

    // Rock position in world pixels.
    heroPos = new Vector2i(120, GROUND_Y - HERO_H);

    // +1 = moving right, -1 = moving left.
    heroFacing = 1;

    // Walk "step" counter (not a frame index -- just bobs the rock position slightly).
    walkStep = 0;
    lastWalkFrameTick = 0;

    // Camera top-left in world coordinates.
    cameraPos = new Vector2i(0, 0);

    // Float version for smooth lerp without pixel jitter.
    cameraXFloat = 0;

    // Simple score counter.
    score = 0;
    lastScoreTick = 0;

    // Particle spawn timer.
    lastParticleSpawnTick = 0;

    // Active particle objects: { pos, spawnTick, paletteSlot }.
    particles = [];

    // Rotating pool index for particle palette slots.
    nextParticleSlot = 0;

    // World decoration: buildings and clouds (built once in initialize).
    buildings = [];
    clouds = [];

    // Base colors for buildings and clouds (used in update() for ambient multiplication).
    buildingFills = [];
    buildingOutlines = [];
    cloudBaseColor = new Color32(230, 240, 255, 200);
    grassBaseColor = new Color32(50, 140, 70);
    dirtBaseColor = new Color32(40, 100, 55);

    // Reused rectangle and vector to avoid creating new objects every frame.
    tempRect = new Rect2i(0, 0, 0, 0);
    tempVec = new Vector2i(0, 0);

    // Sky band colors: top and horizon base values for the gradient.
    skyTop = new Color32(40, 70, 140);
    skyHorizon = new Color32(120, 170, 220);

    // HUD text colors (base values before ambient is applied).
    hudTitleBase = new Color32(255, 230, 180);
    hudScoreBase = new Color32(200, 220, 255);
    hudPosBase = new Color32(180, 200, 180);
    hudFpsBase = new Color32(150, 150, 160);

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Screen size, canvas scale, and fixed update rate.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    queryHardware() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            canvasDisplaySize: new Vector2i(640, 480),
            targetFPS: 60,
        };
    }

    /**
     * Loads font, loads sprite, builds palette, places buildings and clouds.
     *
     * @returns {Promise<boolean>}
     */
    async initialize() {
        console.log('[GameSceneDemo] Initializing...');

        // --- Create palette and set static slots ---
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BLACK, new Color32(0, 0, 0));
        this.palette.set(C_HUD_BAR, new Color32(0, 0, 0, 150));

        // Pre-fill particle slots as transparent.
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.palette.set(PARTICLE_SLOT_START + i, new Color32(0, 0, 0, 0));
        }

        // --- Build world decoration ---
        this.buildWorldDecor();

        // --- Extract sprite colors and register in palette ---
        const colorCount = await this.extractSpriteColors('/sprites/test.png', SPRITE_BASE);

        this.spriteColorCount = colorCount;

        // Pre-fill the "ambient sprite" block (SPRITE_BASE+N..SPRITE_BASE+2N-1).
        // update() will recalculate these every tick based on the current ambient light.
        for (let i = 0; i < colorCount; i++) {
            this.palette.set(SPRITE_BASE + colorCount + i, this.spriteBaseColors[i]);
        }

        // --- Activate palette ---
        BT.paletteSet(this.palette);

        // --- Load hero sprite ---
        try {
            this.heroSheet = await SpriteSheet.load('/sprites/test.png');

            const img = new Image();
            img.src = '/sprites/test.png';
            await new Promise((resolve) => {
                img.onload = () => resolve();
            });
            this.heroSprite = new Rect2i(0, 0, img.naturalWidth, img.naturalHeight);
            this.heroSheet.indexize(this.palette);
            console.log(`[GameSceneDemo] Loaded sprite: ${img.naturalWidth}x${img.naturalHeight}px`);
        } catch (error) {
            console.error('[GameSceneDemo] Failed to load sprite:', error);
            return false;
        }

        // Place camera on the hero to start.
        this.cameraXFloat = this.heroPos.x - DISPLAY_W / 2 + HERO_W / 2;
        this.cameraPos.x = Math.floor(this.cameraXFloat);
        this.cameraPos.y = 0;
        this.clampCamera();

        console.log('[GameSceneDemo] Ready.');
        return true;
    }

    /**
     * Fixed-step logic: moves the rock, camera, score, and particles,
     * then recalculates all ambient-lit palette colors.
     */
    update() {
        const tick = BT.ticks();

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
     * Draws world layers back-to-front, then the HUD on top.
     * Every draw call uses only palette index numbers -- no Color32 objects.
     */
    render() {
        BT.clear(C_BLACK);

        if (!this.heroSheet) {
            BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'Loading...');
            return;
        }

        // Layer 1: sky and clouds with parallax.
        this.renderSkyLayer();

        // Layer 2: world with full camera offset.
        BT.cameraSet(this.cameraPos);
        this.renderGroundAndBuildings();
        this.renderParticles();
        this.renderHero();
        BT.cameraReset();

        // HUD: pinned to the screen (not the world).
        this.renderHud();
    }

    // #endregion

    // #region World Setup

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

    // #endregion

    // #region Ambient Light and Palette Updates

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
        const tick = BT.ticks();
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

        // --- Sky gradient bands ---
        for (let band = 0; band < SKY_BANDS; band++) {
            // t goes 0 at the top to 1 near the horizon.
            const t = band / SKY_BANDS;

            // Blend from skyTop to skyHorizon based on t.
            const bandBase = new Color32(
                Math.floor(this.skyTop.r + (this.skyHorizon.r - this.skyTop.r) * t),
                Math.floor(this.skyTop.g + (this.skyHorizon.g - this.skyTop.g) * t),
                Math.floor(this.skyTop.b + (this.skyHorizon.b - this.skyTop.b) * t),
            );
            this.palette.set(C_SKY_BASE + band, multiplyColor(bandBase, ambient));
        }

        // --- Ground ---
        this.palette.set(C_GRASS, multiplyColor(this.grassBaseColor, ambient));
        this.palette.set(C_DIRTLINE, multiplyColor(this.dirtBaseColor, ambient));

        // --- Buildings ---
        for (let i = 0; i < this.buildings.length; i++) {
            this.palette.set(C_BUILDING_BASE + i * 2, multiplyColor(this.buildingFills[i], ambient));
            this.palette.set(C_BUILDING_BASE + i * 2 + 1, multiplyColor(this.buildingOutlines[i], ambient));
        }

        // --- Clouds ---
        this.palette.set(C_CLOUD, multiplyColor(this.cloudBaseColor, ambient));

        // --- HUD text (subtle night tint on screen text) ---
        this.palette.set(C_HUD_TITLE, multiplyColor(this.hudTitleBase, ambient));
        this.palette.set(C_HUD_SCORE, multiplyColor(this.hudScoreBase, ambient));
        this.palette.set(C_HUD_POS, multiplyColor(this.hudPosBase, ambient));
        this.palette.set(C_HUD_FPS, multiplyColor(this.hudFpsBase, ambient));

        // --- Hero shadow ---
        const shadowAlpha = Math.floor(60 + (ambient.r / 255) * 60); // Softer at night.
        this.palette.set(C_HERO_SHADOW, new Color32(0, 0, 0, shadowAlpha));

        // --- Sprite ambient block ---
        // Each base stone color is multiplied by the current ambient to get the lit version.
        // drawSprite uses offset = spriteColorCount so it reads from this "ambient block".
        for (let i = 0; i < this.spriteColorCount; i++) {
            const base = this.spriteBaseColors[i];
            this.palette.set(SPRITE_BASE + this.spriteColorCount + i, multiplyColor(base, ambient));
        }
    }

    // #endregion

    // #region Sky and Parallax

    /**
     * Draws the sky gradient and clouds using a slower fake camera for parallax depth.
     */
    renderSkyLayer() {
        // Fake camera X is only a fraction of the real one: clouds drift slower than ground.
        const paraX = Math.floor(this.cameraPos.x * SKY_PARALLAX);
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

    // #endregion

    // #region Ground and Buildings

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

        // Buildings.
        for (let i = 0; i < this.buildings.length; i++) {
            const b = this.buildings[i];
            this.tempRect.set(b.x, b.y, b.w, b.h);
            BT.drawRectFill(this.tempRect, C_BUILDING_BASE + i * 2);
            BT.drawRect(this.tempRect, C_BUILDING_BASE + i * 2 + 1);
        }
    }

    // #endregion

    // #region Hero Movement

    /**
     * Moves the rock left/right automatically, bouncing off world edges.
     */
    updateHeroMovement() {
        let nextX = this.heroPos.x + HERO_SPEED * this.heroFacing;
        const margin = 2;

        if (nextX <= margin) {
            nextX = margin;
            this.heroFacing = 1;
        } else if (nextX + HERO_W >= WORLD_W - margin) {
            nextX = WORLD_W - HERO_W - margin;
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
        if (tick - this.lastWalkFrameTick >= WALK_FRAME_TICKS) {
            this.walkStep = (this.walkStep + 1) % 4;
            this.lastWalkFrameTick = tick;
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

        // Tiny vertical bob based on walkStep (steps 0,2 are up; 1,3 are at rest).
        const bob = this.walkStep % 2 === 0 ? -1 : 0;

        const drawPos = new Vector2i(this.heroPos.x, this.heroPos.y + bob);

        // The ambient offset shifts all pixel indices into the pre-lit block.
        BT.drawSprite(this.heroSheet, this.heroSprite, drawPos, this.spriteColorCount);

        // Shadow underfoot.
        const shadowY = this.heroPos.y + this.heroSprite.height - 2;
        this.tempRect.set(this.heroPos.x + 2, shadowY, this.heroSprite.width - 4, 3);
        BT.drawRectFill(this.tempRect, C_HERO_SHADOW);
    }

    // #endregion

    // #region Camera

    /**
     * Smoothly follows the hero, then clamps so the view never leaves the world.
     */
    updateCameraFollow() {
        const targetCamX = this.heroPos.x - DISPLAY_W / 2 + HERO_W / 2;
        this.cameraXFloat += (targetCamX - this.cameraXFloat) * CAMERA_LERP;
        this.cameraPos.x = Math.floor(this.cameraXFloat);
        this.clampCamera();
    }

    /**
     * Keeps cameraPos.x between 0 and WORLD_W - DISPLAY_W.
     */
    clampCamera() {
        const maxCamX = WORLD_W - DISPLAY_W;
        if (this.cameraPos.x < 0) {
            this.cameraPos.x = 0;
        }
        if (this.cameraPos.x > maxCamX) {
            this.cameraPos.x = maxCamX;
        }
        this.cameraXFloat = this.cameraPos.x;
    }

    // #endregion

    // #region Score and Particles

    /**
     * +1 score every SCORE_INTERVAL_TICKS.
     *
     * @param {number} tick - Current tick.
     */
    updateScore(tick) {
        if (tick - this.lastScoreTick >= SCORE_INTERVAL_TICKS) {
            this.score += 1;
            this.lastScoreTick = tick;
        }
    }

    /**
     * Spawns a handful of sparkles near the rock on a fixed schedule.
     *
     * @param {number} tick - Current tick.
     */
    updateParticlesSpawn(tick) {
        if (tick - this.lastParticleSpawnTick >= PARTICLE_SPAWN_INTERVAL) {
            for (let i = 0; i < 3; i++) {
                const slot = PARTICLE_SLOT_START + (this.nextParticleSlot % MAX_PARTICLES);
                this.nextParticleSlot++;

                const ox = Math.floor(Math.random() * 20) - 10;
                const oy = Math.floor(Math.random() * 16) - 12;

                this.particles.push({
                    pos: new Vector2i(this.heroPos.x + HERO_W / 2 + ox, this.heroPos.y + HERO_H / 2 + oy),
                    spawnTick: tick,
                    paletteSlot: slot,
                });
            }

            this.lastParticleSpawnTick = tick;
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
            const lit = multiplyColor(base, ambient);

            this.palette.set(p.paletteSlot, new Color32(lit.r, lit.g, lit.b, alpha));
        }
    }

    /**
     * Draws active particles as 3x3 colored squares.
     * Colors were already computed in update() -- render() just reads the slot.
     */
    renderParticles() {
        for (const p of this.particles) {
            this.tempRect.set(p.pos.x - 1, p.pos.y - 1, 3, 3);
            BT.drawRectFill(this.tempRect, p.paletteSlot);
        }
    }

    // #endregion

    // #region HUD

    /**
     * Screen-space labels pinned after cameraReset.
     */
    renderHud() {
        // Semi-transparent dark bar behind the HUD text so it stays readable.
        this.tempRect.set(0, 0, DISPLAY_W, 34);
        BT.drawRectFill(this.tempRect, C_HUD_BAR);

        // systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(new Vector2i(8, 4), C_HUD_TITLE, 'GAME SCENE CAPSTONE (014)');

        // Score and position.
        BT.systemPrint(new Vector2i(8, 18), C_HUD_SCORE, `Score: ${this.score}`);
        BT.systemPrint(new Vector2i(130, 18), C_HUD_POS, `Rock: (${this.heroPos.x},${this.heroPos.y})`);

        // FPS and day/night phase.
        BT.systemPrint(new Vector2i(260, 220), C_HUD_FPS, `FPS: ${BT.fps()}`);

        const phaseTick = BT.ticks() % DAY_NIGHT_CYCLE_TICKS;
        const phaseLabel =
            phaseTick < DAY_NIGHT_CYCLE_TICKS * 0.25
                ? 'Dawn/Day'
                : phaseTick < DAY_NIGHT_CYCLE_TICKS * 0.5
                  ? 'Toward dusk'
                  : phaseTick < DAY_NIGHT_CYCLE_TICKS * 0.75
                    ? 'Night'
                    : 'Toward dawn';
        BT.systemPrint(new Vector2i(8, 220), C_HUD_FPS, phaseLabel);
    }

    // #endregion

    // #region Sprite Color Extraction

    /**
     * Loads a PNG, finds all unique non-transparent pixel colors, sorts by brightness,
     * registers them in the palette, and saves them in this.spriteBaseColors.
     *
     * @param {string} imageUrl - URL of the PNG file.
     * @param {number} startSlot - First palette slot to use.
     * @returns {Promise<number>} Number of unique colors registered.
     */
    async extractSpriteColors(imageUrl, startSlot) {
        const img = new Image();
        img.src = imageUrl;
        await new Promise((resolve) => {
            img.onload = () => resolve();
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const { data } = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        const seen = new Map();
        const unique = [];

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a === 0) {
                continue;
            }

            const key = `${r},${g},${b},${a}`;

            if (!seen.has(key)) {
                seen.set(key, true);
                unique.push(new Color32(r, g, b, a));
            }
        }

        unique.sort((a, b) => a.r * 0.299 + a.g * 0.587 + a.b * 0.114 - (b.r * 0.299 + b.g * 0.587 + b.b * 0.114));

        for (let i = 0; i < unique.length; i++) {
            this.palette.set(startSlot + i, unique[i]);
            this.spriteBaseColors.push(unique[i]);
        }

        return unique.length;
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
