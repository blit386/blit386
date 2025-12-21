/**
 * Animation & Timing Demo
 *
 * Demonstrates tick-based animation and timing mechanics in Blit-Tech.
 * Shows how to use BT.ticks() for frame-based game logic including:
 * - Sprite animation with frame cycling
 * - Animation state machines
 * - Cooldown timers and event scheduling
 * - Deterministic frame-based logic
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

// #region Types

/**
 * Animation states for the character.
 */
enum AnimState {
    Idle = 'Idle',
    Walking = 'Walking',
    Jumping = 'Jumping',
}

/**
 * Character animation data.
 */
interface CharacterAnimation {
    /** Current animation state. */
    state: AnimState;

    /** Current frame index in the animation. */
    frameIndex: number;

    /** Ticks per a frame for animation speed. */
    frameDuration: number;

    /** Tick when the last frame change occurred. */
    lastFrameChangeTick: number;
}

/**
 * Particle effect data.
 */
interface Particle {
    /** Particle position. */
    pos: Vector2i;

    /** Tick when particle was spawned. */
    spawnTick: number;
}

// #endregion

// #region Game Class

/**
 * Demonstrates tick-based animation timing and state management.
 * Shows sprite sheet animation, state machines, cooldowns, and periodic events.
 */
class AnimationDemo implements IBlitTechGame {
    // #region Module State

    /** Bitmap font for UI text. */
    private font: BitmapFont | null = null;

    /** Sprite sheet for animated character. */
    private spriteSheet: SpriteSheet | null = null;

    /** Character animation state. */
    private animation: CharacterAnimation = {
        state: AnimState.Idle,
        frameIndex: 0,
        frameDuration: 8, // 8 ticks per frame
        lastFrameChangeTick: 0,
    };

    /** Character position. */
    private charPos: Vector2i = new Vector2i(80, 100);

    /** Ability cooldown timer (in ticks). */
    private abilityCooldownTicks: number = 0;

    /** Ability cooldown duration (2 seconds at 60 FPS). */
    private readonly abilityCooldownDuration: number = 120;

    /** Spawn timer for periodic events. */
    private lastSpawnTick: number = 0;

    /** Spawn interval (3 seconds at 60 FPS). */
    private readonly spawnInterval: number = 180;

    /** Particle effects spawned periodically. */
    private particles: Particle[] = [];

    /** Jump animation start tick. */
    private jumpStartTick: number = 0;

    /** Jump animation duration (1 second at 60 FPS). */
    private readonly jumpDuration: number = 60;

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
     * Loads font and creates an animated sprite sheet.
     *
     * @returns Promise resolving to true when initialization succeeds.
     */
    async initialize(): Promise<boolean> {
        console.log('[AnimationDemo] Initializing...');

        // Load font.
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');

            console.log(`[AnimationDemo] Loaded font: ${this.font.name}`);
        } catch (error: unknown) {
            console.error('[AnimationDemo] Failed to load font:', error);

            return false;
        }

        // Create a sprite sheet for character animation.
        this.spriteSheet = await this.createAnimatedSpriteSheet();
        console.log('[AnimationDemo] Created sprite sheet');
        console.log('[AnimationDemo] Initialization complete!');

        return true;
    }

    /**
     * Updates the animation state each tick.
     * Handles frame-based logic including animation, cooldowns, and periodic spawning.
     */
    update(): void {
        const currentTick = BT.ticks();

        // Update character animation frame.
        this.updateAnimation(currentTick);

        // Update ability cooldown.
        if (this.abilityCooldownTicks > 0) {
            this.abilityCooldownTicks--;
        }

        // Periodic particle spawning.
        if (currentTick - this.lastSpawnTick >= this.spawnInterval) {
            this.spawnParticle();
            this.lastSpawnTick = currentTick;
        }

        // Remove old particles (after 3 seconds).
        this.particles = this.particles.filter((p) => currentTick - p.spawnTick < 180);

        // Auto-cycle animation states for demonstration.
        this.autoCycleStates(currentTick);
    }

    /**
     * Renders animated character, particles and UI.
     * Shows character animation with current state and timing information.
     */
    render(): void {
        // Clear screen.
        BT.clear(new Color32(30, 20, 40));

        if (!this.font || !this.spriteSheet) {
            BT.print(new Vector2i(10, 10), Color32.white(), 'Loading...');
            return;
        }

        // Draw ground.
        BT.drawRectFill(new Rect2i(0, 150, 320, 90), new Color32(40, 60, 40));

        // Draw animated character.
        this.renderCharacter();

        // Draw particles.
        this.renderParticles();

        // Draw UI.
        this.renderUI();
    }

    // #endregion

    // #region Animation Logic

    /**
     * Updates animation frame based on tick counter.
     * Advances frame when enough ticks have passed based on frameDuration.
     *
     * @param currentTick - Current game tick.
     */
    private updateAnimation(currentTick: number): void {
        // Check if it is time to advance the frame.
        if (currentTick - this.animation.lastFrameChangeTick >= this.animation.frameDuration) {
            this.animation.frameIndex = (this.animation.frameIndex + 1) % this.getFrameCount(this.animation.state);
            this.animation.lastFrameChangeTick = currentTick;
        }

        // Update jump animation offset.
        if (this.animation.state === AnimState.Jumping) {
            const jumpProgress = (currentTick - this.jumpStartTick) / this.jumpDuration;

            if (jumpProgress >= 1.0) {
                this.changeState(AnimState.Idle);
            }
        }
    }

    /**
     * Changes animation state and resets frame index.
     *
     * @param newState - New animation state to transition to.
     */
    private changeState(newState: AnimState): void {
        if (this.animation.state !== newState) {
            this.animation.state = newState;
            this.animation.frameIndex = 0;
            this.animation.lastFrameChangeTick = BT.ticks();

            if (newState === AnimState.Jumping) {
                this.jumpStartTick = BT.ticks();
            }
        }
    }

    /**
     * Auto-cycles through animation states for demonstration purposes.
     * Cycles: Idle (2s) → Walking (2s) → Jumping (2s).
     *
     * @param currentTick - Current game tick.
     */
    private autoCycleStates(currentTick: number): void {
        const cycleTime = (currentTick % 360) / 60; // 6-second cycle

        if (cycleTime < 2) {
            if (this.animation.state !== AnimState.Idle) {
                this.changeState(AnimState.Idle);
            }
        } else if (cycleTime < 4) {
            if (this.animation.state !== AnimState.Walking) {
                this.changeState(AnimState.Walking);
            }
        } else {
            if (this.animation.state !== AnimState.Jumping) {
                this.changeState(AnimState.Jumping);
                // Trigger ability cooldown when jumping.
                if (this.abilityCooldownTicks === 0) {
                    this.abilityCooldownTicks = this.abilityCooldownDuration;
                }
            }
        }
    }

    /**
     * Gets the number of frames for an animation state.
     *
     * @param state - Animation state.
     * @returns Number of frames in the animation.
     */
    private getFrameCount(state: AnimState): number {
        switch (state) {
            case AnimState.Idle:
                return 4;
            case AnimState.Walking:
                return 6;
            case AnimState.Jumping:
                return 4;
        }
    }

    /**
     * Gets the sprite sheet row for an animation state.
     *
     * @param state - Animation state.
     * @returns Row index in the sprite sheet.
     */
    private getStateRow(state: AnimState): number {
        switch (state) {
            case AnimState.Idle:
                return 0;
            case AnimState.Walking:
                return 1;
            case AnimState.Jumping:
                return 2;
        }
    }

    // #endregion

    // #region Rendering

    /**
     * Renders the animated character with the current frame and jump offset.
     */
    private renderCharacter(): void {
        if (!this.spriteSheet) {
            return;
        }

        // Calculate sprite position in the sheet.
        const stateRow = this.getStateRow(this.animation.state);
        const spriteSize = 32;
        const srcRect = new Rect2i(
            this.animation.frameIndex * spriteSize,
            stateRow * spriteSize,
            spriteSize,
            spriteSize,
        );

        // Calculate Y offset for jump animation.
        let yOffset = 0;

        if (this.animation.state === AnimState.Jumping) {
            const jumpProgress = (BT.ticks() - this.jumpStartTick) / this.jumpDuration;
            yOffset = -Math.abs(Math.sin(jumpProgress * Math.PI) * 30);
        }

        // Draw character sprite.
        const drawPos = new Vector2i(this.charPos.x, this.charPos.y + yOffset);

        BT.drawSprite(this.spriteSheet, srcRect, drawPos, Color32.white());

        // Draw shadow.
        const shadowColor = new Color32(0, 0, 0, 100);
        const shadowY = this.charPos.y + spriteSize - 4;

        BT.drawRectFill(new Rect2i(this.charPos.x + 8, shadowY, 16, 4), shadowColor);
    }

    /**
     * Spawns a particle at a random position.
     */
    private spawnParticle(): void {
        const x = Math.floor(Math.random() * 300) + 10;
        const y = Math.floor(Math.random() * 100) + 30;

        this.particles.push({
            pos: new Vector2i(x, y),
            spawnTick: BT.ticks(),
        });
    }

    /**
     * Renders particles with a fade-out effect based on age.
     */
    private renderParticles(): void {
        const currentTick = BT.ticks();

        for (const particle of this.particles) {
            const age = currentTick - particle.spawnTick;
            const lifetime = 180;
            const alpha = Math.floor(255 * (1 - age / lifetime));

            // Rainbow color based on spawn time.
            const hue = (particle.spawnTick * 3) % 360;
            const color = Color32.fromHSL(hue, 100, 60);

            color.a = alpha;

            BT.drawRectFill(new Rect2i(particle.pos.x - 2, particle.pos.y - 2, 4, 4), color);
        }
    }

    /**
     * Renders UI showing timing information, animation state, and cooldowns.
     */
    private renderUI(): void {
        if (!this.font) {
            return;
        }

        // Title.
        BT.printFont(this.font, new Vector2i(10, 10), 'ANIMATION & TIMING DEMO', Color32.white());

        // Current state.
        BT.printFont(this.font, new Vector2i(10, 30), `State: ${this.animation.state}`, new Color32(100, 200, 255));

        // Frame index.
        BT.printFont(
            this.font,
            new Vector2i(10, 45),
            `Frame: ${this.animation.frameIndex + 1}/${this.getFrameCount(this.animation.state)}`,
            new Color32(150, 150, 150),
        );

        // Tick counter.
        BT.printFont(this.font, new Vector2i(10, 60), `Ticks: ${BT.ticks()}`, new Color32(150, 150, 150));

        // Render cooldown info.
        this.renderCooldownUI();

        // Render spawn timer.
        this.renderSpawnTimerUI();

        // Render info box.
        this.renderInfoBox();

        // FPS counter.
        BT.printFont(this.font, new Vector2i(250, 225), `FPS: ${BT.fps()}`, new Color32(100, 100, 100));
    }

    /**
     * Renders cooldown timer and progress bar.
     */
    private renderCooldownUI(): void {
        if (!this.font) {
            return;
        }

        const cooldownPercent = Math.max(0, this.abilityCooldownTicks / this.abilityCooldownDuration);
        const cooldownColor = cooldownPercent > 0 ? new Color32(255, 100, 100) : new Color32(100, 255, 100);

        BT.printFont(
            this.font,
            new Vector2i(10, 75),
            `Cooldown: ${Math.ceil(this.abilityCooldownTicks / 60)}s`,
            cooldownColor,
        );

        // Cooldown progress bar.
        const barWidth = 100;
        const barHeight = 8;
        const barX = 10;
        const barY = 92;

        // Bar background.
        BT.drawRectFill(new Rect2i(barX, barY, barWidth, barHeight), new Color32(40, 40, 40));

        // Bar fill.
        if (cooldownPercent > 0) {
            const fillWidth = Math.floor(barWidth * cooldownPercent);
            BT.drawRectFill(new Rect2i(barX, barY, fillWidth, barHeight), new Color32(255, 100, 100));
        }

        // Bar outline.
        BT.drawRect(new Rect2i(barX, barY, barWidth, barHeight), new Color32(150, 150, 150));
    }

    /**
     * Renders spawn timer information.
     */
    private renderSpawnTimerUI(): void {
        if (!this.font) {
            return;
        }

        // Next spawn timer.
        const ticksUntilSpawn = this.spawnInterval - (BT.ticks() - this.lastSpawnTick);

        BT.printFont(
            this.font,
            new Vector2i(10, 110),
            `Next spawn: ${Math.ceil(ticksUntilSpawn / 60)}s`,
            new Color32(200, 200, 100),
        );

        // Active particles.
        BT.printFont(
            this.font,
            new Vector2i(10, 125),
            `Particles: ${this.particles.length}`,
            new Color32(150, 150, 150),
        );
    }

    /**
     * Renders information box explaining tick-based animation.
     */
    private renderInfoBox(): void {
        if (!this.font) {
            return;
        }

        BT.printFont(this.font, new Vector2i(10, 165), 'Tick-based Animation:', new Color32(255, 200, 100));
        BT.printFont(this.font, new Vector2i(10, 180), '- Deterministic frame timing', new Color32(180, 180, 180));
        BT.printFont(this.font, new Vector2i(10, 195), '- Cooldown & event scheduling', new Color32(180, 180, 180));
        BT.printFont(this.font, new Vector2i(10, 210), '- State machine transitions', new Color32(180, 180, 180));
    }

    // #endregion

    // #region Sprite Sheet Creation

    /**
     * Creates a sprite sheet with animated character frames.
     * In production, you would load from an image file instead.
     *
     * @returns Promise resolving to the created SpriteSheet.
     */
    private async createAnimatedSpriteSheet(): Promise<SpriteSheet> {
        const canvas = document.createElement('canvas');
        const spriteSize = 32;
        const cols = 6; // Max frames per row.
        const rows = 3; // Number of animation states.

        canvas.width = cols * spriteSize;
        canvas.height = rows * spriteSize;

        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('[AnimationDemo] Failed to acquire 2D canvas context');
        }

        // Clear background.
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';

        // Row 0: Idle animation (4 frames).
        for (let i = 0; i < 4; i++) {
            this.drawIdleFrame(ctx, i * spriteSize, 0, spriteSize, i);
        }

        // Row 1: Walking animation (6 frames).
        for (let i = 0; i < 6; i++) {
            this.drawWalkFrame(ctx, i * spriteSize, spriteSize, spriteSize, i);
        }

        // Row 2: Jumping animation (4 frames).
        for (let i = 0; i < 4; i++) {
            this.drawJumpFrame(ctx, i * spriteSize, spriteSize * 2, spriteSize, i);
        }

        // Convert to image.
        const dataUrl = canvas.toDataURL();
        const image = new Image();

        await new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.src = dataUrl;
        });

        return new SpriteSheet(image);
    }

    /**
     * Draws an idle animation frame with subtle bobbing.
     *
     * @param ctx - Canvas 2D rendering context.
     * @param x - Frame X position in the sprite sheet.
     * @param y - Frame Y position in the sprite sheet.
     * @param _size - Frame size (unused but kept for consistency).
     * @param frame - Frame index in animation.
     */
    private drawIdleFrame(ctx: CanvasRenderingContext2D, x: number, y: number, _size: number, frame: number): void {
        // Simple bobbing animation.
        const bobOffset = Math.sin(frame * 0.5) * 2;

        // Body.
        ctx.fillRect(x + 12, y + 12 + bobOffset, 8, 12);

        // Head.
        ctx.fillRect(x + 10, y + 8 + bobOffset, 12, 8);

        // Arms.
        ctx.fillRect(x + 8, y + 14 + bobOffset, 4, 6);
        ctx.fillRect(x + 20, y + 14 + bobOffset, 4, 6);

        // Legs.
        ctx.fillRect(x + 11, y + 24, 4, 6);
        ctx.fillRect(x + 17, y + 24, 4, 6);
    }

    /**
     * Draws a walking animation frame with alternating legs.
     *
     * @param ctx - Canvas 2D rendering context.
     * @param x - Frame X position in the sprite sheet.
     * @param y - Frame Y position in the sprite sheet.
     * @param _size - Frame size (unused but kept for consistency).
     * @param frame - Frame index in animation.
     */
    private drawWalkFrame(ctx: CanvasRenderingContext2D, x: number, y: number, _size: number, frame: number): void {
        // Leg positions alternate.
        const leg1Y = 24 + (frame % 2 === 0 ? 2 : 0);
        const leg2Y = 24 + (frame % 2 === 1 ? 2 : 0);

        // Body.
        ctx.fillRect(x + 12, y + 12, 8, 12);

        // Head.
        ctx.fillRect(x + 10, y + 8, 12, 8);

        // Arms (swinging).
        const armOffset = frame % 2 === 0 ? 1 : -1;

        ctx.fillRect(x + 8, y + 14 + armOffset, 4, 6);
        ctx.fillRect(x + 20, y + 14 - armOffset, 4, 6);

        // Legs (walking).
        ctx.fillRect(x + 11, y + leg1Y, 4, 6);
        ctx.fillRect(x + 17, y + leg2Y, 4, 6);
    }

    /**
     * Draws a jumping animation frame with raised arms.
     *
     * @param ctx - Canvas 2D rendering context.
     * @param x - Frame X position in the sprite sheet.
     * @param y - Frame Y position in the sprite sheet.
     * @param _size - Frame size (unused but kept for consistency).
     * @param _frame - Frame index (unused but kept for consistency).
     */
    private drawJumpFrame(ctx: CanvasRenderingContext2D, x: number, y: number, _size: number, _frame: number): void {
        // Body.
        ctx.fillRect(x + 12, y + 12, 8, 12);

        // Head.
        ctx.fillRect(x + 10, y + 8, 12, 8);

        // Arms (raised).
        ctx.fillRect(x + 8, y + 10, 4, 6);
        ctx.fillRect(x + 20, y + 10, 4, 6);

        // Legs (together).
        ctx.fillRect(x + 12, y + 24, 8, 6);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Bootstrap the game with default settings.
bootstrap(AnimationDemo);

// #endregion
