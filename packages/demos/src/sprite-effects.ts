/**
 * Sprite Effects & Tinting Demo
 *
 * Demonstrates practical sprite tinting effects commonly used in 2D games.
 * Shows how to use BT.drawSprite() with tint colors for various visual effects:
 * - damage flash (red/white pulse on hit),
 * - silhouettes and shadows (black tint),
 * - ghost/fade effects (white tint and alpha),
 * - environmental color grading (ambient lighting),
 * - team colors (palette swaps via tinting),
 * - day/night cycle color shifts.
 */

import {
    BitmapFont,
    bootstrap,
    BT,
    Color32,
    type HardwareSettings,
    type IBlitTechGame,
    Rect2i,
    SpriteSheet,
    Vector2i,
} from 'blit-tech';

// #region Game Class

/**
 * Demonstrates practical sprite tinting effects for games.
 * Shows damage flashes, status effects, team colors, and environmental lighting.
 */
class SpriteEffectsDemo implements IBlitTechGame {
    // #region Module State

    /** Bitmap font for UI text. */
    private font: BitmapFont | null = null;

    /** Sprite sheet with character sprite. */
    private spriteSheet: SpriteSheet | null = null;

    /** Animation time for effects in seconds. */
    private animTime: number = 0;

    /** Damage flash trigger timer (tick when damage occurred). */
    private damageFlashTick: number = 0;

    /** Source rectangle for character sprite in the sheet. */
    private readonly charSprite = new Rect2i(0, 0, 32, 32);

    // #endregion

    // #region IBlitTechGame Implementation

    /**
     * Configures hardware settings for this demo.
     * Sets up a 320×240 internal resolution with 2× CSS upscaling.
     *
     * @returns Hardware configuration specifying display size and target FPS.
     */
    queryHardware(): HardwareSettings {
        return {
            displaySize: new Vector2i(320, 240),
            canvasDisplaySize: new Vector2i(640, 480),
            targetFPS: 60,
        };
    }

    /**
     * Initializes the demo after the engine is ready.
     * Loads font and creates character sprite for demonstrations.
     *
     * @returns Promise resolving to true when initialization succeeds.
     */
    async initialize(): Promise<boolean> {
        console.log('[SpriteEffectsDemo] Initializing...');

        // Load font.
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');
            console.log(`[SpriteEffectsDemo] Loaded font: ${this.font.name}`);
        } catch (error) {
            console.error('[SpriteEffectsDemo] Failed to load font:', error);
            return false;
        }

        // Create the character sprite sheet.
        this.spriteSheet = await this.createCharacterSprite();
        console.log('[SpriteEffectsDemo] Created sprite sheet');

        console.log('[SpriteEffectsDemo] Initialization complete!');
        return true;
    }

    /**
     * Updates the animation state each tick.
     * Updates animation timer and triggers periodic damage flashes.
     */
    update(): void {
        this.animTime += 1 / 60;

        // Trigger damage flash every 3 seconds.
        if (BT.ticks() % 180 === 0) {
            this.damageFlashTick = BT.ticks();
        }
    }

    /**
     * Renders all sprite effect demonstrations.
     * Shows various tint effects, team colors, status effects, and day/night cycle.
     */
    render(): void {
        // Clear screen.
        BT.clear(new Color32(25, 25, 35));

        if (!this.font || !this.spriteSheet) {
            BT.print(new Vector2i(10, 10), Color32.white(), 'Loading...');
            return;
        }

        // Title.
        BT.printFont(this.font, new Vector2i(10, 8), 'SPRITE TINTING EFFECTS', Color32.white());

        // Draw all effect demonstrations.
        this.renderEffectExamples();

        // Draw the day / night cycle demo.
        this.renderDayNightCycle();

        // FPS counter.
        BT.printFont(this.font, new Vector2i(250, 225), `FPS: ${BT.fps()}`, new Color32(100, 100, 100));
    }

    // #endregion

    // #region Effect Demonstrations

    /**
     * Renders various sprite tinting effects in two rows.
     * Row 1: Basic tinting effects (normal, damage, shadow, ghost, invincibility).
     * Row 2: Team colors and status effects (frozen, poisoned).
     */
    private renderEffectExamples(): void {
        if (!this.spriteSheet || !this.font) {
            return;
        }

        this.renderBasicEffects();
        this.renderTeamColorsAndStatus();
    }

    /**
     * Renders basic tinting effects (row 1).
     */
    private renderBasicEffects(): void {
        if (!this.spriteSheet || !this.font) {
            return;
        }

        const row1Y = 35;
        const spacing = 55;

        // Normal (no tint).
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15, row1Y), Color32.white());
        BT.printFont(this.font, new Vector2i(10, row1Y + 36), 'Normal', new Color32(200, 200, 200));

        // Damage flash (pulsing red/white).
        const flashTint = this.calculateDamageFlashTint();
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing, row1Y), flashTint);
        BT.printFont(this.font, new Vector2i(10 + spacing, row1Y + 36), 'Damage', new Color32(255, 100, 100));

        // Silhouette (solid black).
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing * 2, row1Y), new Color32(0, 0, 0));
        BT.printFont(this.font, new Vector2i(10 + spacing * 2, row1Y + 36), 'Shadow', new Color32(150, 150, 150));

        // Ghost effect (white tint and reduced alpha).
        const ghostPulse = Math.sin(this.animTime * 3) * 0.3 + 0.5;
        const ghostTint = new Color32(200, 200, 255, Math.floor(ghostPulse * 255));
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing * 3, row1Y), ghostTint);
        BT.printFont(this.font, new Vector2i(10 + spacing * 3, row1Y + 36), 'Ghost', new Color32(150, 150, 200));

        // Invincibility flash (rainbow).
        const invincHue = (this.animTime * 200) % 360;
        const invincTint = Color32.fromHSL(invincHue, 100, 70);
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing * 4, row1Y), invincTint);
        BT.printFont(this.font, new Vector2i(10 + spacing * 4, row1Y + 36), 'Invincible', new Color32(255, 200, 100));
    }

    /**
     * Renders team colors and status effects (row 2).
     */
    private renderTeamColorsAndStatus(): void {
        if (!this.spriteSheet || !this.font) {
            return;
        }

        const row2Y = 105;
        const spacing = 55;

        // Team Red.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15, row2Y), new Color32(255, 100, 100));
        BT.printFont(this.font, new Vector2i(10, row2Y + 36), 'Team Red', new Color32(255, 100, 100));

        // Team Blue.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing, row2Y), new Color32(100, 100, 255));
        BT.printFont(this.font, new Vector2i(10 + spacing, row2Y + 36), 'Team Blue', new Color32(100, 150, 255));

        // Team Green.
        BT.drawSprite(
            this.spriteSheet,
            this.charSprite,
            new Vector2i(15 + spacing * 2, row2Y),
            new Color32(100, 255, 100),
        );
        BT.printFont(this.font, new Vector2i(10 + spacing * 2, row2Y + 36), 'Team Green', new Color32(100, 255, 100));

        // Frozen (cyan/blue tint).
        BT.drawSprite(
            this.spriteSheet,
            this.charSprite,
            new Vector2i(15 + spacing * 3, row2Y),
            new Color32(150, 200, 255),
        );
        BT.printFont(this.font, new Vector2i(10 + spacing * 3, row2Y + 36), 'Frozen', new Color32(150, 200, 255));

        // Poisoned (pulsing green tint).
        const poisonTint = this.calculatePoisonTint();
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing * 4, row2Y), poisonTint);
        BT.printFont(this.font, new Vector2i(10 + spacing * 4, row2Y + 36), 'Poisoned', new Color32(100, 255, 100));
    }

    /**
     * Calculates the damage flash tint color.
     * Alternates between red and white for the first 30 ticks after damage.
     *
     * @returns Tint color for damage flash effect.
     */
    private calculateDamageFlashTint(): Color32 {
        const flashAge = BT.ticks() - this.damageFlashTick;

        if (flashAge < 30) {
            // Flash effect: alternate red and white.
            const flashPhase = Math.floor(flashAge / 3) % 2;
            return flashPhase === 0 ? new Color32(255, 255, 255) : new Color32(255, 50, 50);
        }

        return Color32.white();
    }

    /**
     * Calculates the poison tint color with a pulsing effect.
     *
     * @returns Tint color for poison effect.
     */
    private calculatePoisonTint(): Color32 {
        const poisonPulse = Math.sin(this.animTime * 5) * 0.2 + 0.8;
        return new Color32(Math.floor(100 * poisonPulse), Math.floor(255 * poisonPulse), Math.floor(100 * poisonPulse));
    }

    /**
     * Demonstrates day/night cycle color grading.
     * Cycles through Day, Sunset, Night, and Dawn with ambient tinting.
     */
    private renderDayNightCycle(): void {
        if (!this.spriteSheet || !this.font) {
            return;
        }

        const baseY = 175;

        BT.printFont(this.font, new Vector2i(10, baseY), 'Day/Night Cycle:', new Color32(255, 200, 100));

        // Cycle through different times of day (4 phases, 6-second total cycle).
        const cycleTime = (this.animTime * 0.5) % 4;

        const { timeName, ambientTint } = this.getDayNightPhase(cycleTime);

        // Draw character with ambient lighting.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15, baseY + 20), ambientTint);

        // Time label.
        BT.printFont(this.font, new Vector2i(10, baseY + 56), timeName, ambientTint);

        // Draw the progression bar.
        this.renderDayNightProgressBar(baseY, cycleTime, ambientTint);
    }

    /**
     * Gets the time name and ambient tint for a given cycle time.
     *
     * @param cycleTime - Current position in the day/night cycle (0-4).
     * @returns Object containing time name and ambient tint color.
     */
    private getDayNightPhase(cycleTime: number): { timeName: string; ambientTint: Color32 } {
        if (cycleTime < 1) {
            return { timeName: 'Day', ambientTint: new Color32(255, 255, 255) };
        }
        if (cycleTime < 2) {
            return { timeName: 'Sunset', ambientTint: new Color32(255, 180, 120) };
        }
        if (cycleTime < 3) {
            return { timeName: 'Night', ambientTint: new Color32(80, 80, 150) };
        }
        return { timeName: 'Dawn', ambientTint: new Color32(180, 150, 200) };
    }

    /**
     * Renders the day/night cycle progress bar with time labels.
     *
     * @param baseY - Base Y position for the cycle demo.
     * @param cycleTime - Current position in the cycle (0-4).
     * @param ambientTint - Current ambient tint color.
     */
    private renderDayNightProgressBar(baseY: number, cycleTime: number, ambientTint: Color32): void {
        if (!this.font) {
            return;
        }

        const barX = 60;
        const barY = baseY + 25;
        const barWidth = 240;
        const barHeight = 10;

        // Background.
        BT.drawRectFill(new Rect2i(barX, barY, barWidth, barHeight), new Color32(30, 30, 30));

        // Progress indicator.
        const progress = (cycleTime % 4) / 4;
        const indicatorX = barX + Math.floor(barWidth * progress);
        BT.drawRectFill(new Rect2i(indicatorX - 2, barY - 2, 4, barHeight + 4), ambientTint);

        // Border.
        BT.drawRect(new Rect2i(barX, barY, barWidth, barHeight), new Color32(150, 150, 150));

        // Time labels.
        BT.printFont(this.font, new Vector2i(barX, barY + 14), 'Day', new Color32(150, 150, 150));
        BT.printFont(this.font, new Vector2i(barX + 60, barY + 14), 'Sunset', new Color32(150, 150, 150));
        BT.printFont(this.font, new Vector2i(barX + 120, barY + 14), 'Night', new Color32(150, 150, 150));
        BT.printFont(this.font, new Vector2i(barX + 180, barY + 14), 'Dawn', new Color32(150, 150, 150));
    }

    // #endregion

    // #region Sprite Creation

    /**
     * Creates a simple character sprite for demonstration purposes.
     * In a real game, you would load from an image file instead.
     *
     * @returns Promise resolving to the created SpriteSheet.
     */
    private async createCharacterSprite(): Promise<SpriteSheet> {
        const canvas = document.createElement('canvas');
        const size = 32;
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('[SpriteEffectsDemo] Failed to acquire 2D canvas context');
        }

        // Clear background.
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, size, size);

        // Draw a simple character in white.
        ctx.fillStyle = 'white';

        // Head.
        ctx.beginPath();
        ctx.arc(16, 10, 6, 0, Math.PI * 2);
        ctx.fill();

        // Body.
        ctx.fillRect(12, 16, 8, 10);

        // Arms.
        ctx.fillRect(8, 18, 4, 6);
        ctx.fillRect(20, 18, 4, 6);

        // Legs.
        ctx.fillRect(12, 26, 4, 6);
        ctx.fillRect(16, 26, 4, 6);

        // Convert to image.
        const dataUrl = canvas.toDataURL();
        const image = new Image();
        await new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.src = dataUrl;
        });

        return new SpriteSheet(image);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Bootstrap the game with default settings.
bootstrap(SpriteEffectsDemo);

// #endregion
