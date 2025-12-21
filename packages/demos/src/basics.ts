/**
 * Basic Blit-Tech Example
 *
 * Demonstrates the minimal setup required for a Blit-Tech game.
 * This example creates a simple moving square, bounding around the screen.
 * Note: Keyboard input (WASD, Arrow Keys) is planned but not yet implemented.
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
 * A minimal game demonstrating core Blit-Tech features.
 * Shows hardware configuration, game loop, and basic rendering.
 * Note: Input handling is planned but not yet implemented in Phase 1.
 */
class BasicGame implements IBlitTechGame {
    // #region Module State

    /** Player position in world coordinates. */
    private playerPos: Vector2i = new Vector2i(160, 120);

    /** Player velocity in pixels per frame. */
    private playerVel: Vector2i = new Vector2i(2, 1);

    /** Player size in pixels. */
    private playerSize: Vector2i = new Vector2i(16, 16);

    /** Background color. */
    private bgColor: Color32 = new Color32(50, 100, 150);

    /** Player color. */
    private playerColor: Color32 = Color32.white();

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
            displaySize: new Vector2i(320, 240), // Internal rendering resolution.
            canvasDisplaySize: new Vector2i(640, 480), // CSS display size (2× upscale).
            targetFPS: 60,
        };
    }

    /**
     * Initializes game state after the engine is ready.
     * Centers the player on screen and loads bitmap font.
     *
     * @returns Promise resolving to true when initialization succeeds.
     */
    async initialize(): Promise<boolean> {
        console.log('[BasicGame] Initializing...');

        // Load bitmap font from .btfont file.
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');

            console.log(`[BasicGame] Loaded font: ${this.font.name} (${this.font.glyphCount} glyphs)`);
        } catch (error) {
            console.warn('[BasicGame] Failed to load font, will use fallback:', error);
        }

        // Center player on screen.
        const displaySize = BT.displaySize();

        this.playerPos = new Vector2i(
            Math.floor(displaySize.x / 2 - this.playerSize.x / 2),
            Math.floor(displaySize.y / 2 - this.playerSize.y / 2),
        );

        console.log('[BasicGame] Initialization complete!');

        return true;
    }

    /**
     * Updates game logic each tick.
     * Automatically moves the square and bounces off-screen edges.
     * Note: Keyboard input (WASD, Arrow Keys) is planned but not yet implemented.
     */
    update(): void {
        // Update position.
        this.playerPos = this.playerPos.add(this.playerVel);

        // Bounce off screen edges.
        const displaySize = BT.displaySize();

        // Handle horizontal bounds.
        if (this.playerPos.x <= 0 || this.playerPos.x >= displaySize.x - this.playerSize.x) {
            this.playerVel.x = -this.playerVel.x;
            this.playerPos.x = Math.max(0, Math.min(displaySize.x - this.playerSize.x, this.playerPos.x));
        }

        // Handle vertical bounds.
        if (this.playerPos.y <= 0 || this.playerPos.y >= displaySize.y - this.playerSize.y) {
            this.playerVel.y = -this.playerVel.y;
            this.playerPos.y = Math.max(0, Math.min(displaySize.y - this.playerSize.y, this.playerPos.y));
        }
    }

    /**
     * Renders game graphics each frame.
     * Clears the screen, draws player square, and displays UI text using bitmap font.
     */
    render(): void {
        // Clear screen.
        BT.clear(this.bgColor);

        // Draw player.
        const playerRect = new Rect2i(this.playerPos.x, this.playerPos.y, this.playerSize.x, this.playerSize.y);

        BT.drawRectFill(playerRect, this.playerColor);

        // Draw UI.
        this.renderUI();
    }

    // #endregion

    // #region Rendering Helpers

    /**
     * Renders the UI overlay with FPS and position information.
     * Uses bitmap font if loaded, otherwise falls back to basic print.
     */
    private renderUI(): void {
        if (this.font) {
            BT.printFont(this.font, new Vector2i(10, 10), `FPS: ${BT.fps()}`, Color32.white());

            BT.printFont(
                this.font,
                new Vector2i(10, 26),
                `Position: ${this.playerPos.x}, ${this.playerPos.y}`,
                Color32.white(),
            );

            BT.printFont(
                this.font,
                new Vector2i(10, 42),
                'Auto-bouncing (input not yet implemented)',
                new Color32(180, 180, 180),
            );
        } else {
            // Fallback to basic print if font not loaded.
            BT.print(new Vector2i(10, 10), Color32.white(), 'Font not loaded');
        }
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Bootstrap the game with default settings.
bootstrap(BasicGame);

// #endregion
