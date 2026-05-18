// Demo 010 -- Sprite Effects: shows how to use palette offsets to create game effects.
//
// Prerequisites: 001-Basics (https://vancura.dev/articles/blit-tech-basics),
// 008-Sprites (https://vancura.dev/articles/blit-tech-sprites).
// Live article: https://vancura.dev/articles/blit-tech-sprite-effects
//
// In the palette-based rendering system, each sprite pixel stores a palette index.
// By drawing the same sprite with a different "palette offset", every pixel shifts
// to a different color block in the palette. This replaces what the old API called
// "tinting" (multiplying pixels by a color).
//
// Common uses in retro games:
//   - Damage flash: swap to a block of reds, then back to normal after 30 ticks
//   - Silhouette: use a block where all colors are black
//   - Ghost: a block where all colors have low alpha
//   - Team colors: separate pre-built blocks for red/blue/green teams
//   - Status effects: frozen (all shifted to cold blues), poisoned (pulsing greens)
//   - Day/night: a block dynamically updated every tick to reflect ambient light
//
// For STATIC effects (normal, silhouette, team red/blue/green, frozen): we build color
// blocks once in init() and never change them.
//
// For DYNAMIC effects (damage flash, ghost pulse, invincibility, poison, day/night):
// we update the color block in update() every tick and draw with that offset in render().
//
// We learned about palette offsets in Demo 008-Sprites:
// https://vancura.dev/articles/blit-tech-sprites

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Where sprite colors start in the palette.
// Must be above the highest UI slot (C_FPS = 11) to avoid overwriting UI colors.
const SPRITE_BASE = 12;

// Placeholder for "how many unique colors in the sprite" -- set during init().
// We use 0 here and update it after extracting colors.
let N = 0; // Each theme block is N entries wide.

// Static UI color indices.
const C_WHITE = 1;
const C_BG = 2; // (25, 25, 35) dark background.
const C_LABEL = 3; // (200, 200, 200) section labels.
const C_LABEL_RED = 4; // (255, 100, 100) damage/red label.
const C_LABEL_BLUE = 5; // (100, 150, 255) blue team label.
const C_LABEL_GREEN = 6; // (100, 255, 100) green team label.
const C_LABEL_CYAN = 7; // (150, 200, 255) frozen label.
const C_LABEL_YELLOW = 8; // (255, 200, 100) day/night label.
const C_BAR_DARK = 9; // (30, 30, 30) progress bar track.
const C_BAR_BORDER = 10; // (150, 150, 150) progress bar outline.
const C_FPS = 11; // (100, 100, 100) dim FPS.

// Theme block indices (as palette offsets from SPRITE_BASE).
// Each block contains N entries. Offset = blockIndex * N.
// Blocks 0..7 are static; blocks 8..12 are dynamic (updated in update()).
//
// Block 0 (offset 0):         Original stone colors.
// Block 1 (offset N):         Silhouette -- all colors near-black.
// Block 2 (offset 2*N):       Damage white -- all colors bright white.
// Block 3 (offset 3*N):       Damage red -- all colors shifted red.
// Block 4 (offset 4*N):       Team red.
// Block 5 (offset 5*N):       Team blue.
// Block 6 (offset 6*N):       Team green.
// Block 7 (offset 7*N):       Frozen (cool blue).
// Block 8 (offset 8*N):       Damage flash (dynamic: toggling white/red).
// Block 9 (offset 9*N):       Ghost (dynamic: pulsing low alpha).
// Block 10 (offset 10*N):     Invincibility (dynamic: hue rotation).
// Block 11 (offset 11*N):     Poison (dynamic: pulsing green brightness).
// Block 12 (offset 12*N):     Day/night ambient (dynamic: brightness cycle).

const BLOCK_ORIGINAL = 0;
const BLOCK_SILHOUETTE = 1;
const BLOCK_DAMAGE_WHITE = 2;
const BLOCK_DAMAGE_RED = 3;
const BLOCK_TEAM_RED = 4;
const BLOCK_TEAM_BLUE = 5;
const BLOCK_TEAM_GREEN = 6;
const BLOCK_FROZEN = 7;
const BLOCK_DAMAGE_FLASH = 8; // Dynamic.
const BLOCK_GHOST = 9; // Dynamic.
const BLOCK_INVINCIBLE = 10; // Dynamic.
const BLOCK_POISON = 11; // Dynamic.
const BLOCK_DAYNIGHT = 12; // Dynamic.

// #endregion

// #region Main Logic

/**
 * Demonstrates palette-offset based sprite effects.
 * Static effects are pre-built in init(); dynamic effects update in update().
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The palette holds all colors for this demo.
    palette = null;

    // The sprite sheet loaded from /sprites/test.png.
    spriteSheet = null;

    // The source rectangle for the rock sprite.
    charSprite = null;

    // How many unique colors the sprite has (N). Computed in init().
    spriteColorCount = 0;

    // The extracted original Color32 objects (used to build theme blocks).
    baseColors = [];

    // animTime drives all dynamic effects.
    animTime = 0;

    // Which tick the last "damage event" occurred on (for the damage flash).
    damageFlashTick = 0;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Sets up the palette with static UI colors, builds all 13 theme blocks,
     * loads the sprite, and loads the font.
     *
     * @returns {Promise<boolean>} Returns true when everything is ready.
     */
    async init() {
        console.log('[SpriteEffectsDemo] Initializing...');

        // --- Palette: static UI colors ---
        // applyHUD(1) fills six standard HUD slots. Slots 1 (white) and 3 (label
        // gray) match this demo's values exactly. Slot 2 (bg) and slots 4-6 are
        // overridden below with demo-specific colors; slots 7-11 are new additions.
        this.palette = BT.paletteCreate(256);
        this.palette.applyHUD(1);

        this.palette.set(C_BG, new Color32(25, 25, 35));
        this.palette.set(C_LABEL_RED, new Color32(255, 100, 100));
        this.palette.set(C_LABEL_BLUE, new Color32(100, 150, 255));
        this.palette.set(C_LABEL_GREEN, new Color32(100, 255, 100));
        this.palette.set(C_LABEL_CYAN, new Color32(150, 200, 255));
        this.palette.set(C_LABEL_YELLOW, new Color32(255, 200, 100));
        this.palette.set(C_BAR_DARK, new Color32(30, 30, 30));
        this.palette.set(C_BAR_BORDER, new Color32(150, 150, 150));
        this.palette.set(C_FPS, new Color32(100, 100, 100));

        // --- Extract sprite colors ---
        // Ask the engine to scan the PNG and add every unique color it finds into our palette,
        // starting at SPRITE_BASE. The returned array is the same colors in palette-write order
        // (sorted darkest-first by brightness). We keep them so the theme-block builders can
        // tint each base color and write the result into a higher slot.
        this.baseColors = await SpriteSheet.loadColorsIntoPalette('/sprites/test.png', this.palette, SPRITE_BASE);
        const colorCount = this.baseColors.length;
        this.spriteColorCount = colorCount;

        // Update the module-level N so other helpers can use it without passing it around.
        N = colorCount;

        // --- Build the 8 static theme blocks ---
        // Each block sits at SPRITE_BASE + blockIndex * N.
        this.buildStaticThemeBlocks();

        // Dynamic blocks (8..12) start as copies of the original.
        // update() will replace them each tick.
        for (let block = BLOCK_DAMAGE_FLASH; block <= BLOCK_DAYNIGHT; block++) {
            for (let i = 0; i < N; i++) {
                const base = this.baseColors[i];
                this.palette.set(SPRITE_BASE + block * N + i, new Color32(base.r, base.g, base.b, base.a));
            }
        }

        // --- Load and indexize sprite ---
        try {
            const indexed = await SpriteSheet.loadIndexed('/sprites/test.png', this.palette, SPRITE_BASE, {
                sort: 'none',
            });
            this.spriteSheet = indexed.sheet;
            this.charSprite = this.spriteSheet.fullRect();
            BT.paletteSet(this.palette);
            console.log(`[SpriteEffectsDemo] Loaded sprite: ${this.charSprite.width}x${this.charSprite.height}px`);
        } catch (error) {
            console.error('[SpriteEffectsDemo] Failed to load sprite:', error);
            return false;
        }

        console.log('[SpriteEffectsDemo] Initialization complete!');
        return true;
    }

    /**
     * Advances animTime and updates all five dynamic theme blocks.
     *
     * The damage flash toggles between Block 2 (white) and Block 3 (red) every 3 ticks.
     * Ghost pulses alpha between 40 and 180.
     * Invincibility rotates hue around the color wheel.
     * Poison pulses brightness up and down.
     * Day/night smoothly cycles brightness over 20 seconds.
     */
    update() {
        this.animTime += BT.deltaSeconds;

        if (!this.spriteColorCount) {
            return;
        }

        // Trigger a damage event every 3 seconds (180 ticks).
        if (BT.ticks % 180 === 0) {
            this.damageFlashTick = BT.ticks;
        }

        this.updateDamageFlashBlock();
        this.updateGhostBlock();
        this.updateInvincibleBlock();
        this.updatePoisonBlock();
        this.updateDayNightBlock();
    }

    /**
     * Runs once per screen refresh to draw all the sprite effect demonstrations.
     * Notice: NO Color32 objects appear in draw calls -- only palette indices and offsets.
     */
    render() {
        BT.clear(C_BG);

        if (!this.spriteSheet || !this.charSprite) {
            BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'Loading...');
            return;
        }

        // systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(new Vector2i(10, 8), C_WHITE, 'SPRITE PALETTE EFFECTS');

        // Draw both effect rows.
        this.renderStaticEffects();
        this.renderDynamicEffects();

        // Day/night cycle at the bottom.
        this.renderDayNightCycle();

        BT.systemPrint(new Vector2i(250, 225), C_FPS, `FPS: ${BT.targetFPS}`);
    }

    // #endregion

    // #region Static Theme Block Builder

    /**
     * Builds the 8 static theme blocks by transforming the base colors.
     * Called once in init() -- these never change after setup.
     */
    buildStaticThemeBlocks() {
        // Block 0 (original) is already filled by SpriteSheet.loadColorsIntoPalette above.

        for (let i = 0; i < N; i++) {
            const base = this.baseColors[i];

            // The average brightness of this pixel (0..255 range).
            const lum = Math.floor(base.luminance);

            // Block 1: Silhouette -- near-black with slight variation to preserve depth cues.
            this.palette.set(
                SPRITE_BASE + BLOCK_SILHOUETTE * N + i,
                new Color32(lum * 0.08, lum * 0.08, lum * 0.1, base.a),
            );

            // Block 2: Damage white -- everything shifted toward bright white.
            const whitened = Math.floor(128 + lum * 0.5);
            this.palette.set(
                SPRITE_BASE + BLOCK_DAMAGE_WHITE * N + i,
                new Color32(whitened, whitened, whitened, base.a),
            );

            // Block 3: Damage red -- everything shifted toward red.
            this.palette.set(
                SPRITE_BASE + BLOCK_DAMAGE_RED * N + i,
                new Color32(Math.min(255, lum + 80), lum * 0.3, lum * 0.3, base.a),
            );

            // Block 4: Team red -- multiply base colors with a red tint.
            this.palette.set(
                SPRITE_BASE + BLOCK_TEAM_RED * N + i,
                new Color32(
                    Math.min(255, Math.floor(base.r * 1.4)),
                    Math.floor(base.g * 0.5),
                    Math.floor(base.b * 0.5),
                    base.a,
                ),
            );

            // Block 5: Team blue -- multiply with a blue tint.
            this.palette.set(
                SPRITE_BASE + BLOCK_TEAM_BLUE * N + i,
                new Color32(
                    Math.floor(base.r * 0.5),
                    Math.floor(base.g * 0.7),
                    Math.min(255, Math.floor(base.b * 1.6)),
                    base.a,
                ),
            );

            // Block 6: Team green -- multiply with a green tint.
            this.palette.set(
                SPRITE_BASE + BLOCK_TEAM_GREEN * N + i,
                new Color32(
                    Math.floor(base.r * 0.5),
                    Math.min(255, Math.floor(base.g * 1.4)),
                    Math.floor(base.b * 0.5),
                    base.a,
                ),
            );

            // Block 7: Frozen -- push toward cold blue-white.
            this.palette.set(
                SPRITE_BASE + BLOCK_FROZEN * N + i,
                new Color32(Math.floor(lum * 0.7 + 40), Math.floor(lum * 0.8 + 40), Math.min(255, lum + 80), base.a),
            );
        }
    }

    // #endregion

    // #region Dynamic Block Updaters (called every tick in update())

    /**
     * Damage flash: alternates between "all white" and "all red" every 3 ticks
     * for the first 30 ticks after damage. Fades back to normal after that.
     */
    updateDamageFlashBlock() {
        const flashAge = BT.ticks - this.damageFlashTick;

        for (let i = 0; i < N; i++) {
            const base = this.baseColors[i];
            const lum = Math.floor(base.luminance);

            let color;

            if (flashAge < 30) {
                // Math.floor(flashAge / 3) % 2 alternates 0 and 1 every 3 ticks.
                // 0 = show white flash; 1 = show red.
                const phase = Math.floor(flashAge / 3) % 2;
                const whitened = Math.floor(128 + lum * 0.5);
                const redShift = Math.min(255, lum + 80);

                color =
                    phase === 0
                        ? new Color32(whitened, whitened, whitened, base.a)
                        : new Color32(redShift, Math.floor(lum * 0.3), Math.floor(lum * 0.3), base.a);
            } else {
                // Outside the flash window: use the original color.
                color = new Color32(base.r, base.g, base.b, base.a);
            }

            this.palette.set(SPRITE_BASE + BLOCK_DAMAGE_FLASH * N + i, color);
        }
    }

    /**
     * Ghost: the sprite appears semi-transparent with a blue-white tint.
     * Alpha pulses between 40 and 180 using a sine wave.
     */
    updateGhostBlock() {
        // Math.sin oscillates between -1 and 1; we shift it to 0..1.
        const pulse = Math.sin(this.animTime * 3) * 0.5 + 0.5;
        const alpha = Math.floor(40 + pulse * 140); // 40..180

        for (let i = 0; i < N; i++) {
            const base = this.baseColors[i];
            const lum = Math.floor(base.luminance);

            // Push toward a cool blue-white while reducing alpha.
            this.palette.set(
                SPRITE_BASE + BLOCK_GHOST * N + i,
                new Color32(Math.floor(lum * 0.8 + 40), Math.floor(lum * 0.8 + 40), Math.min(255, lum + 60), alpha),
            );
        }
    }

    /**
     * Invincibility: cycles the entire sprite through the rainbow.
     * The hue rotates 200 degrees per second.
     */
    updateInvincibleBlock() {
        const hue = (this.animTime * 200) % 360;

        for (let i = 0; i < N; i++) {
            const base = this.baseColors[i];

            // fromHSL takes hue (0-360), saturation (0-100), lightness (0-100).
            // We use varying lightness so darker parts stay darker.
            const lum = base.luminance;
            const lightness = 30 + (lum / 255) * 40; // 30..70%
            const rainbow = Color32.fromHSL(hue, 100, lightness);

            this.palette.set(
                SPRITE_BASE + BLOCK_INVINCIBLE * N + i,
                new Color32(rainbow.r, rainbow.g, rainbow.b, base.a),
            );
        }
    }

    /**
     * Poison: a green tint that pulses brighter and darker 5 times per second.
     */
    updatePoisonBlock() {
        const pulse = Math.sin(this.animTime * 5) * 0.2 + 0.8; // 0.6..1.0

        for (let i = 0; i < N; i++) {
            const base = this.baseColors[i];
            this.palette.set(
                SPRITE_BASE + BLOCK_POISON * N + i,
                new Color32(
                    Math.floor(base.r * 0.5 * pulse),
                    Math.min(255, Math.floor(base.g * 1.4 * pulse)),
                    Math.floor(base.b * 0.5 * pulse),
                    base.a,
                ),
            );
        }
    }

    /**
     * Day/night: a brightness multiplier that cycles over 20 seconds (1200 ticks).
     * At midday the multiplier is ~1.0; at midnight it drops to ~0.3.
     */
    updateDayNightBlock() {
        const cycle = (BT.ticks % 1200) / 1200; // 0..1
        const brightness = (Math.cos(cycle * Math.PI * 2) + 1) * 0.35 + 0.3; // 0.3..1.0

        for (let i = 0; i < N; i++) {
            const base = this.baseColors[i];
            // Blend from a fixed cool night tint (slight blue) toward the sprite's daylight colors as brightness → 1.
            // Color32.lerp(a, b, t): t=0 is all `a`, t=1 is all `b`; matches the old per-channel formula.
            const nightTint = new Color32(0, 0, 30, base.a);
            this.palette.set(SPRITE_BASE + BLOCK_DAYNIGHT * N + i, Color32.lerp(nightTint, base, brightness));
        }
    }

    // #endregion

    // #region Rendering

    /**
     * Draws the first row: five static tinting effects.
     * Normal, Silhouette, Team Red, Team Blue, Frozen.
     */
    renderStaticEffects() {
        if (!this.spriteSheet || !this.charSprite) {
            return;
        }

        const row1Y = 30;
        const spacing = 60;

        // Offset 0 = block 0 = original stone. systemPrint takes (position, paletteIndex, text).
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10, row1Y), BLOCK_ORIGINAL * N);
        BT.systemPrint(new Vector2i(6, row1Y + 36), C_LABEL, 'Normal');

        // Offset N = block 1 = silhouette (near-black).
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10 + spacing, row1Y), BLOCK_SILHOUETTE * N);
        BT.systemPrint(new Vector2i(6 + spacing, row1Y + 36), C_LABEL, 'Shadow');

        // Team red.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10 + spacing * 2, row1Y), BLOCK_TEAM_RED * N);
        BT.systemPrint(new Vector2i(6 + spacing * 2, row1Y + 36), C_LABEL_RED, 'Team Red');

        // Team blue.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10 + spacing * 3, row1Y), BLOCK_TEAM_BLUE * N);
        BT.systemPrint(new Vector2i(6 + spacing * 3, row1Y + 36), C_LABEL_BLUE, 'Team Blue');

        // Frozen.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10 + spacing * 4, row1Y), BLOCK_FROZEN * N);
        BT.systemPrint(new Vector2i(6 + spacing * 4, row1Y + 36), C_LABEL_CYAN, 'Frozen');
    }

    /**
     * Draws the second row: four dynamic effects (updated in update()).
     * Damage Flash, Ghost, Invincibility, Poison.
     */
    renderDynamicEffects() {
        if (!this.spriteSheet || !this.charSprite) {
            return;
        }

        const row2Y = 90;
        const spacing = 60;

        // systemPrint takes (position, paletteIndex, text).
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10, row2Y), BLOCK_DAMAGE_FLASH * N);
        BT.systemPrint(new Vector2i(6, row2Y + 36), C_LABEL_RED, 'Damage');

        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10 + spacing, row2Y), BLOCK_GHOST * N);
        BT.systemPrint(new Vector2i(6 + spacing, row2Y + 36), C_LABEL_CYAN, 'Ghost');

        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10 + spacing * 2, row2Y), BLOCK_INVINCIBLE * N);
        BT.systemPrint(new Vector2i(6 + spacing * 2, row2Y + 36), C_LABEL, 'Invincible');

        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10 + spacing * 3, row2Y), BLOCK_POISON * N);
        BT.systemPrint(new Vector2i(6 + spacing * 3, row2Y + 36), C_LABEL_GREEN, 'Poisoned');
    }

    /**
     * Shows a day/night cycle effect: the sprite dims at night and brightens at noon.
     * A progress bar shows the current phase.
     */
    renderDayNightCycle() {
        if (!this.spriteSheet || !this.charSprite) {
            return;
        }

        const baseY = 162;

        // systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(new Vector2i(10, baseY), C_LABEL_YELLOW, 'Day/Night Cycle:');

        // Draw the sprite with the day/night block.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(10, baseY + 16), BLOCK_DAYNIGHT * N);

        // Progress bar showing time of day.
        const barX = 60;
        const barY = baseY + 24;
        const barWidth = 240;
        const barHeight = 10;

        BT.drawRectFill(new Rect2i(barX, barY, barWidth, barHeight), C_BAR_DARK);

        const cycle = (BT.ticks % 1200) / 1200;
        const indicatorX = barX + Math.floor(barWidth * cycle);

        // The indicator rectangle uses the current day/night color (block 12, first color).
        // We compute the actual index: SPRITE_BASE + 12*N + 0 = first slot in the day/night block.
        BT.drawRectFill(new Rect2i(indicatorX - 2, barY - 2, 4, barHeight + 4), SPRITE_BASE + BLOCK_DAYNIGHT * N);
        BT.drawRect(new Rect2i(barX, barY, barWidth, barHeight), C_BAR_BORDER);

        // Phase labels.
        BT.systemPrint(new Vector2i(barX, barY + 14), C_LABEL, 'Day');
        BT.systemPrint(new Vector2i(barX + 60, barY + 14), C_LABEL, 'Sunset');
        BT.systemPrint(new Vector2i(barX + 120, barY + 14), C_LABEL, 'Night');
        BT.systemPrint(new Vector2i(barX + 180, barY + 14), C_LABEL, 'Dawn');
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
