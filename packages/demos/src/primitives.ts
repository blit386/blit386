/**
 * Primitives Demo
 *
 * Showcases all basic drawing functions in Blit-Tech:
 * - drawPixel: Single pixel rendering
 * - drawLine: Bresenham line algorithm
 * - drawRect: Rectangle outlines
 * - drawRectFill: Filled rectangles
 * - clearRect: Region clearing
 */

import {
    BitmapFont,
    bootstrap,
    BT,
    Color32,
    type HardwareSettings,
    type IBlitTechGame,
    Rect2i,
    Vector2i,
} from 'blit-tech';

// #region Game Class

/**
 * Demonstrates all primitive drawing operations with animated examples.
 * Each section shows a different drawing function in action with real-time animation.
 */
class PrimitivesDemo implements IBlitTechGame {
    // #region Module State

    /** Animation tick counter for time-based effects. */
    private animTicks: number = 0;

    /** Bitmap font for text rendering. */
    private font: BitmapFont | null = null;

    // #endregion

    // #region IBlitTechGame Implementation

    /**
     * Configures hardware settings for this game.
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
     * Loads the bitmap font for text rendering.
     *
     * @returns Promise resolving to true when initialization succeeds.
     */
    async initialize(): Promise<boolean> {
        console.log('[PrimitivesDemo] Initializing...');

        // Load bitmap font for text rendering.
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');
            console.log(`[PrimitivesDemo] Loaded font: ${this.font.name} (${this.font.glyphCount} glyphs)`);
        } catch (error) {
            console.error('[PrimitivesDemo] Failed to load font:', error);
            return false;
        }

        console.log('[PrimitivesDemo] Initialized');
        return true;
    }

    /**
     * Updates the animation state each tick.
     * Increments the animation counter for time-based effects.
     */
    update(): void {
        this.animTicks++;
    }

    /**
     * Renders all primitive demonstrations.
     * Displays pixels, lines, rectangles, and combined effects in separate sections.
     */
    render(): void {
        // Clear background to dark blue.
        BT.clear(new Color32(20, 30, 50));

        if (!this.font) {
            BT.print(new Vector2i(10, 10), Color32.white(), 'Loading font...');
            return;
        }

        // Title.
        BT.printFont(this.font, new Vector2i(10, 10), 'Blit-Tech - Primitives Demo', Color32.white());

        // Draw demonstration sections.
        this.renderPixelDemo();
        this.renderLineDemo();
        this.renderRectOutlineDemo();
        this.renderRectFillDemo();
        this.renderClearRectDemo();
        this.renderCombinedDemo();

        // FPS counter.
        BT.printFont(
            this.font,
            new Vector2i(10, 225),
            `FPS: ${BT.fps()} | Ticks: ${BT.ticks()}`,
            new Color32(150, 150, 150),
        );
    }

    // #endregion

    // #region Rendering Helpers

    /**
     * Renders the pixel drawing demonstration.
     * Shows animated rainbow-colored pixels in a pattern.
     */
    private renderPixelDemo(): void {
        if (!this.font) {
            return;
        }

        BT.printFont(this.font, new Vector2i(10, 30), 'Pixels:', new Color32(255, 200, 100));

        // Draw pseudo-random pixels with rainbow colors.
        for (let i = 0; i < 50; i++) {
            const x = 10 + ((i * 13) % 60);
            const y = 45 + ((i * 7) % 20);
            const hue = (i * 17 + this.animTicks) % 360;
            const color = Color32.fromHSL(hue, 100, 50);
            BT.drawPixel(new Vector2i(x, y), color);
        }
    }

    /**
     * Renders the line drawing demonstration.
     * Shows horizontal, vertical, diagonal, and rotating lines.
     */
    private renderLineDemo(): void {
        if (!this.font) {
            return;
        }

        BT.printFont(this.font, new Vector2i(10, 75), 'Lines:', new Color32(255, 200, 100));

        // Static lines in different orientations.
        BT.drawLine(new Vector2i(10, 90), new Vector2i(70, 90), new Color32(255, 100, 100)); // Horizontal.
        BT.drawLine(new Vector2i(20, 95), new Vector2i(20, 115), new Color32(100, 255, 100)); // Vertical.
        BT.drawLine(new Vector2i(30, 95), new Vector2i(60, 115), new Color32(100, 100, 255)); // Diagonal.

        // Animated rotating line.
        const angle = (this.animTicks * 2 * Math.PI) / 180;
        const centerX = 50;
        const centerY = 105;
        const radius = 15;
        const endX = centerX + Math.cos(angle) * radius;
        const endY = centerY + Math.sin(angle) * radius;
        BT.drawLine(new Vector2i(centerX, centerY), new Vector2i(Math.floor(endX), Math.floor(endY)), Color32.white());
    }

    /**
     * Renders the rectangle outline demonstration.
     * Shows static rectangles and a pulsing animated rectangle.
     */
    private renderRectOutlineDemo(): void {
        if (!this.font) {
            return;
        }

        BT.printFont(this.font, new Vector2i(90, 30), 'Rect Outlines:', new Color32(255, 200, 100));

        // Static rectangles in different colors.
        BT.drawRect(new Rect2i(90, 45, 40, 25), new Color32(255, 100, 100));
        BT.drawRect(new Rect2i(140, 45, 30, 30), new Color32(100, 255, 100));
        BT.drawRect(new Rect2i(180, 45, 25, 35), new Color32(100, 100, 255));

        // Animated pulsing rectangle.
        const pulse = Math.floor(10 + Math.sin(this.animTicks * 0.1) * 5);
        BT.drawRect(new Rect2i(220, 45, pulse * 2, pulse * 2), new Color32(255, 255, 100));
    }

    /**
     * Renders the filled rectangle demonstration.
     * Shows static filled rectangles and a sliding animated rectangle.
     */
    private renderRectFillDemo(): void {
        if (!this.font) {
            return;
        }

        BT.printFont(this.font, new Vector2i(90, 90), 'Rect Fills:', new Color32(255, 200, 100));

        // Static filled rectangles.
        BT.drawRectFill(new Rect2i(90, 105, 40, 25), new Color32(255, 100, 100));
        BT.drawRectFill(new Rect2i(140, 105, 30, 30), new Color32(100, 255, 100));
        BT.drawRectFill(new Rect2i(180, 105, 25, 35), new Color32(100, 100, 255));

        // Animated sliding rectangle.
        const slideX = 220 + Math.floor(Math.sin(this.animTicks * 0.05) * 20);
        BT.drawRectFill(new Rect2i(slideX, 105, 20, 20), new Color32(255, 255, 100));
    }

    /**
     * Renders the clear rectangle demonstration.
     * Shows a background pattern with a moving cleared region.
     */
    private renderClearRectDemo(): void {
        if (!this.font) {
            return;
        }

        BT.printFont(this.font, new Vector2i(10, 135), 'Clear Rect:', new Color32(255, 200, 100));

        // Draw a background pattern.
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 5; j++) {
                BT.drawRectFill(new Rect2i(10 + i * 10, 150 + j * 10, 8, 8), new Color32(100, 150, 200));
            }
        }

        // Clear a moving rectangular region.
        const clearX = 30 + Math.floor(Math.sin(this.animTicks * 0.03) * 15);
        BT.clearRect(new Color32(20, 30, 50), new Rect2i(clearX, 160, 40, 30));
    }

    /**
     * Renders the combined primitives demonstration.
     * Shows an animated sine wave graph using multiple drawing functions.
     */
    private renderCombinedDemo(): void {
        if (!this.font) {
            return;
        }

        BT.printFont(this.font, new Vector2i(120, 150), 'Combined:', new Color32(255, 200, 100));

        const graphX = 120;
        const graphY = 170;
        const graphW = 180;
        const graphH = 50;

        // Graph background.
        BT.drawRectFill(new Rect2i(graphX, graphY, graphW, graphH), new Color32(10, 15, 25));

        // Graph border.
        BT.drawRect(new Rect2i(graphX, graphY, graphW, graphH), new Color32(100, 100, 100));

        // Draw animated sine wave.
        for (let x = 0; x < graphW - 1; x++) {
            const y1 = Math.floor(graphH / 2 + Math.sin((x + this.animTicks) * 0.1) * (graphH / 3));
            const y2 = Math.floor(graphH / 2 + Math.sin((x + 1 + this.animTicks) * 0.1) * (graphH / 3));

            BT.drawLine(
                new Vector2i(graphX + x, graphY + y1),
                new Vector2i(graphX + x + 1, graphY + y2),
                new Color32(100, 255, 255),
            );
        }
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Bootstrap the game with default settings.
bootstrap(PrimitivesDemo);

// #endregion
