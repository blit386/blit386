/**
 * Sprite Demo
 *
 * Shows how to use sprite sheets and textured rendering in Blit-Tech.
 * Demonstrates:
 * - Loading/creating sprite sheets
 * - Drawing sprites with source rectangles
 * - Color tinting and alpha blending
 * - Animated sprite effects
 *
 * To use your own sprites:
 * 1. Load a sprite sheet with SpriteSheet.load('path/to/sprites.png')
 * 2. Define sprite regions with Rect2i (source rectangle in texture)
 * 3. Render with BT.drawSprite(spriteSheet, srcRect, destPos, tint)
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
 * Demonstrates sprite rendering with various tint and animation effects.
 * Creates a programmatic sprite sheet with basic shapes for demo purposes.
 */
class SpriteDemo implements IBlitTechGame {
    // #region Module State

    /** Loaded sprite sheet containing shape sprites. */
    private spriteSheet: SpriteSheet | null = null;

    /** Bitmap font for text rendering. */
    private font: BitmapFont | null = null;

    /** Animation time accumulator in seconds. */
    private animTime: number = 0;

    /** Source rectangles for each sprite in the sheet. */
    private readonly sprites = {
        square: new Rect2i(0, 0, 32, 32),
        circle: new Rect2i(32, 0, 32, 32),
        triangle: new Rect2i(64, 0, 32, 32),
        star: new Rect2i(96, 0, 32, 32),
        heart: new Rect2i(0, 32, 32, 32),
        diamond: new Rect2i(32, 32, 32, 32),
    };

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
     * Creates a demo sprite sheet with basic shapes and loads font.
     * In production, you would load from an image file instead.
     *
     * @returns Promise resolving to true when initialization succeeds.
     */
    async initialize(): Promise<boolean> {
        console.log('[SpriteDemo] Initializing...');

        // Create a sprite sheet programmatically for demonstration.
        this.spriteSheet = await this.createDemoSpriteSheet();
        console.log('[SpriteDemo] Sprite sheet created successfully!');

        // Load bitmap font for text rendering.
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');
            console.log(`[SpriteDemo] Loaded font: ${this.font.name} (${this.font.glyphCount} glyphs)`);
        } catch (error) {
            console.error('[SpriteDemo] Failed to load font:', error);
            return false;
        }

        console.log('[SpriteDemo] Initialization complete!');
        return true;
    }

    /**
     * Updates the animation state each tick.
     * Increments the animation timer for time-based effects.
     */
    update(): void {
        this.animTime += 0.016; // ~60 FPS.
    }

    /**
     * Renders all sprite demonstrations.
     * Shows colored sprites, rainbow tints, pulsing opacity, and bouncing animations.
     */
    render(): void {
        // Clear to dark background.
        BT.clear(new Color32(30, 20, 40));

        if (!this.font || !this.spriteSheet) {
            BT.print(new Vector2i(10, 10), Color32.white(), 'Loading...');
            return;
        }

        // Calculate animation values.
        const hue1 = (this.animTime * 60) % 360;
        const hue2 = (this.animTime * 60 + 90) % 360;
        const hue3 = (this.animTime * 60 + 180) % 360;
        const hue4 = (this.animTime * 60 + 270) % 360;
        const pulse = Math.sin(this.animTime * 3) * 0.5 + 0.5;
        const alpha = Math.floor(100 + pulse * 155);
        const bounce1 = Math.sin(this.animTime * 4) * 10;
        const bounce2 = Math.sin(this.animTime * 4 + 1) * 10;
        const bounce3 = Math.sin(this.animTime * 4 + 2) * 10;

        // Draw all sprites first.
        this.renderColoredSprites();
        this.renderRainbowSprites(hue1, hue2, hue3, hue4);
        this.renderPulsingSprites(alpha);
        this.renderBouncingSprites(bounce1, bounce2, bounce3);

        // Draw all text after sprites.
        this.renderLabels();
        this.renderInstructions();
    }

    // #endregion

    // #region Rendering Helpers

    /**
     * Renders sprites with different solid colors.
     */
    private renderColoredSprites(): void {
        if (!this.spriteSheet) {
            return;
        }

        const row1Y = 45;

        BT.drawSprite(this.spriteSheet, this.sprites.square, new Vector2i(10, row1Y), new Color32(255, 100, 100));
        BT.drawSprite(this.spriteSheet, this.sprites.circle, new Vector2i(50, row1Y), new Color32(100, 255, 100));
        BT.drawSprite(this.spriteSheet, this.sprites.triangle, new Vector2i(90, row1Y), new Color32(100, 100, 255));
        BT.drawSprite(this.spriteSheet, this.sprites.star, new Vector2i(130, row1Y), new Color32(255, 255, 100));
    }

    /**
     * Renders sprites with animated rainbow tints.
     *
     * @param hue1 - Hue value for the first sprite (0-360).
     * @param hue2 - Hue value for the second sprite (0-360).
     * @param hue3 - Hue value for the third sprite (0-360).
     * @param hue4 - Hue value for the fourth sprite (0-360).
     */
    private renderRainbowSprites(hue1: number, hue2: number, hue3: number, hue4: number): void {
        if (!this.spriteSheet) {
            return;
        }

        const row2Y = 100;

        BT.drawSprite(this.spriteSheet, this.sprites.heart, new Vector2i(10, row2Y), Color32.fromHSL(hue1, 100, 60));
        BT.drawSprite(this.spriteSheet, this.sprites.diamond, new Vector2i(50, row2Y), Color32.fromHSL(hue2, 100, 60));
        BT.drawSprite(this.spriteSheet, this.sprites.circle, new Vector2i(90, row2Y), Color32.fromHSL(hue3, 100, 60));
        BT.drawSprite(this.spriteSheet, this.sprites.star, new Vector2i(130, row2Y), Color32.fromHSL(hue4, 100, 60));
    }

    /**
     * Renders sprites with pulsing opacity.
     *
     * @param alpha - Alpha channel value (0-255).
     */
    private renderPulsingSprites(alpha: number): void {
        if (!this.spriteSheet) {
            return;
        }

        const row3Y = 155;

        BT.drawSprite(
            this.spriteSheet,
            this.sprites.square,
            new Vector2i(10, row3Y),
            new Color32(255, 255, 255, alpha),
        );
        BT.drawSprite(
            this.spriteSheet,
            this.sprites.circle,
            new Vector2i(50, row3Y),
            new Color32(255, 255, 255, alpha),
        );
        BT.drawSprite(
            this.spriteSheet,
            this.sprites.triangle,
            new Vector2i(90, row3Y),
            new Color32(255, 255, 255, alpha),
        );
    }

    /**
     * Renders bouncing animated sprites.
     *
     * @param bounce1 - Vertical offset for the first sprite.
     * @param bounce2 - Vertical offset for the second sprite.
     * @param bounce3 - Vertical offset for the third sprite.
     */
    private renderBouncingSprites(bounce1: number, bounce2: number, bounce3: number): void {
        if (!this.spriteSheet) {
            return;
        }

        const baseY = 210;

        BT.drawSprite(this.spriteSheet, this.sprites.star, new Vector2i(10, baseY + bounce1), Color32.white());
        BT.drawSprite(
            this.spriteSheet,
            this.sprites.heart,
            new Vector2i(50, baseY + bounce2),
            new Color32(255, 100, 150),
        );
        BT.drawSprite(
            this.spriteSheet,
            this.sprites.diamond,
            new Vector2i(90, baseY + bounce3),
            new Color32(100, 200, 255),
        );
    }

    /**
     * Renders text labels for each sprite row.
     */
    private renderLabels(): void {
        if (!this.font) {
            return;
        }

        // Title.
        BT.printFont(this.font, new Vector2i(10, 10), 'BLIT-TECH SPRITE DEMO', Color32.white());

        // Row labels.
        BT.printFont(this.font, new Vector2i(10, 30), 'Colored Sprites:', new Color32(200, 200, 200));
        BT.printFont(this.font, new Vector2i(10, 85), 'Rainbow Tints:', new Color32(200, 200, 200));
        BT.printFont(this.font, new Vector2i(10, 140), 'Pulsing:', new Color32(200, 200, 200));
        BT.printFont(this.font, new Vector2i(10, 195), 'Animated:', new Color32(200, 200, 200));
    }

    /**
     * Renders code usage instructions.
     */
    private renderInstructions(): void {
        if (!this.font) {
            return;
        }

        BT.printFont(this.font, new Vector2i(170, 30), 'Load your own', new Color32(150, 150, 150));
        BT.printFont(this.font, new Vector2i(170, 45), 'sprite sheets:', new Color32(150, 150, 150));
        BT.printFont(this.font, new Vector2i(170, 65), 'const sheet =', new Color32(100, 150, 200));
        BT.printFont(this.font, new Vector2i(170, 80), '  await', new Color32(100, 150, 200));
        BT.printFont(this.font, new Vector2i(170, 95), '  SpriteSheet', new Color32(100, 150, 200));
        BT.printFont(this.font, new Vector2i(170, 110), '  .load(url);', new Color32(100, 150, 200));
        BT.printFont(this.font, new Vector2i(170, 130), 'BT.drawSprite(', new Color32(100, 150, 200));
        BT.printFont(this.font, new Vector2i(170, 145), '  sheet,', new Color32(100, 150, 200));
        BT.printFont(this.font, new Vector2i(170, 160), '  srcRect,', new Color32(100, 150, 200));
        BT.printFont(this.font, new Vector2i(170, 175), '  destPos,', new Color32(100, 150, 200));
        BT.printFont(this.font, new Vector2i(170, 190), '  tint', new Color32(100, 150, 200));
        BT.printFont(this.font, new Vector2i(170, 205), ');', new Color32(100, 150, 200));
    }

    // #endregion

    // #region Sprite Sheet Creation

    /**
     * Creates a sprite sheet with geometric shapes using canvas drawing.
     * In a real game, you would load from an image file:
     * ```
     * const spriteSheet = await SpriteSheet.load('path/to/sprites.png');
     * ```
     *
     * @returns Promise resolving to the created SpriteSheet.
     */
    private async createDemoSpriteSheet(): Promise<SpriteSheet> {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;

        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('[SpriteDemo] Failed to acquire 2D canvas context');
        }

        // Fill with a transparent background.
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw simple shapes as sprites.
        ctx.fillStyle = 'white';

        // Square at (0, 0).
        ctx.fillRect(4, 4, 24, 24);

        // Circle at (32, 0).
        ctx.beginPath();
        ctx.arc(48, 16, 12, 0, Math.PI * 2);
        ctx.fill();

        // Triangle at (64, 0).
        ctx.beginPath();
        ctx.moveTo(80, 4);
        ctx.lineTo(92, 28);
        ctx.lineTo(68, 28);
        ctx.closePath();
        ctx.fill();

        // Star at (96, 0).
        this.drawStar(ctx, 112, 16, 5, 12, 6);

        // Heart at (0, 32).
        this.drawHeart(ctx, 16, 40, 10);

        // Diamond at (32, 32).
        ctx.beginPath();
        ctx.moveTo(48, 36);
        ctx.lineTo(56, 48);
        ctx.lineTo(48, 60);
        ctx.lineTo(40, 48);
        ctx.closePath();
        ctx.fill();

        // Convert canvas to image.
        const dataUrl = canvas.toDataURL();
        const image = new Image();
        await new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.src = dataUrl;
        });

        return new SpriteSheet(image);
    }

    /**
     * Draws a star polygon on a canvas context.
     *
     * @param ctx - Canvas 2D rendering context.
     * @param cx - Center X coordinate.
     * @param cy - Center Y coordinate.
     * @param spikes - Number of star points.
     * @param outerRadius - Radius to outer points.
     * @param innerRadius - Radius to inner valleys.
     */
    private drawStar(
        ctx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        spikes: number,
        outerRadius: number,
        innerRadius: number,
    ): void {
        let rot = (Math.PI / 2) * 3;
        let x = cx;
        let y = cy;
        const step = Math.PI / spikes;

        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);

        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }

        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Draws a heart shape using Bézier curves.
     *
     * @param ctx - Canvas 2D rendering context.
     * @param cx - Center X coordinate.
     * @param cy - Top center Y coordinate.
     * @param size - Heart size scale factor.
     */
    private drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
        ctx.beginPath();
        const topCurveHeight = size * 0.3;

        ctx.moveTo(cx, cy + topCurveHeight);

        // Left half.
        ctx.bezierCurveTo(cx, cy, cx - size / 2, cy, cx - size / 2, cy + topCurveHeight);
        ctx.bezierCurveTo(
            cx - size / 2,
            cy + (size + topCurveHeight) / 2,
            cx,
            cy + (size + topCurveHeight) * 1.3,
            cx,
            cy + size * 1.7,
        );

        // Right half.
        ctx.bezierCurveTo(
            cx,
            cy + (size + topCurveHeight) * 1.3,
            cx + size / 2,
            cy + (size + topCurveHeight) / 2,
            cx + size / 2,
            cy + topCurveHeight,
        );

        ctx.bezierCurveTo(cx + size / 2, cy, cx, cy, cx, cy + topCurveHeight);
        ctx.closePath();
        ctx.fill();
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Bootstrap the game with default settings.
bootstrap(SpriteDemo);

// #endregion
