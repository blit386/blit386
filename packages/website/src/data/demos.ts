/** Represents a demo entry for the showcase. */
export type DemoEntry = {
    /** The title of the demo. */
    title: string;

    /** The description of the demo. */
    description: string;

    /** Path to a local thumbnail screenshot under `public/`. */
    thumbnail: string;

    /** Full URL to the hosted demo at demos.blit386.dev. */
    href: string;
};

/** The list of flagship demos to showcase. */
export const flagshipDemos: readonly DemoEntry[] = [
    {
        title: 'Hello World',
        description: 'The smallest possible BLIT386 program: one line of text, nothing else on screen.',
        thumbnail: '/demos/thumb-hello-world.webp',
        href: 'https://demos.blit386.dev/hello-world',
    },
    {
        title: 'Basics',
        description:
            'Your first BLIT386 program: the engine lifecycle, a bouncing sprite, a palette, and text on the canvas.',
        thumbnail: '/demos/thumb-basics.webp',
        href: 'https://demos.blit386.dev/basics',
    },
    {
        title: 'Patterns',
        description: 'Animated mathematical art from primitives alone: spirals, Lissajous curves, waves, and a tunnel.',
        thumbnail: '/demos/thumb-patterns.webp',
        href: 'https://demos.blit386.dev/patterns',
    },
    {
        title: 'Sprite Effects',
        description:
            'Palette offsets as game effects: damage flash, silhouette, ghost fade, team colors, and day or night.',
        thumbnail: '/demos/thumb-sprite-effects.webp',
        href: 'https://demos.blit386.dev/sprite-effects',
    },
    {
        title: 'Starfield',
        description: 'Parallax scrolling stars at several speeds, so a flat two-dimensional field reads as real depth.',
        thumbnail: '/demos/thumb-starfield.webp',
        href: 'https://demos.blit386.dev/starfield',
    },
    {
        title: 'Flurry',
        description:
            'A retro screensaver port of the classic macOS Flurry: particle physics driving palette animation.',
        thumbnail: '/demos/thumb-flurry.webp',
        href: 'https://demos.blit386.dev/flurry',
    },
    {
        title: 'Palette Cycling',
        description: 'Animate entire scenes by rotating palette slots at runtime without touching a single pixel.',
        thumbnail: '/demos/thumb-palette-cycling.webp',
        href: 'https://demos.blit386.dev/palette-cycling',
    },
    {
        title: 'Snake Game',
        description: 'A complete playable game: input handling, game-state loop, collision, and score rendering.',
        thumbnail: '/demos/thumb-snake-game.webp',
        href: 'https://demos.blit386.dev/snake-game',
    },
    {
        title: 'Hypercube',
        description:
            'A Fez-style rotating tesseract: watch a four-dimensional cube turn on a 256x256 PICO-8 sized canvas.',
        thumbnail: '/demos/thumb-hypercube.webp',
        href: 'https://demos.blit386.dev/hypercube',
    },
    {
        title: 'Coordinate Patterns',
        description:
            'An endless world computed from hash1i, hash2i, and hash3i that stores no tiles, yet never changes.',
        thumbnail: '/demos/thumb-coordinate-patterns.webp',
        href: 'https://demos.blit386.dev/coordinate-patterns',
    },
    {
        title: 'Noise',
        description: 'Value, Perlin, and Simplex noise at matched settings, with an octaves slider and a terrain ramp.',
        thumbnail: '/demos/thumb-noise.webp',
        href: 'https://demos.blit386.dev/noise',
    },
    {
        title: 'Palette Exposure Fade',
        description:
            'The plain palette fade and the camera-style exposure fade side by side, running on one shared palette.',
        thumbnail: '/demos/thumb-palette-exposure-fade.webp',
        href: 'https://demos.blit386.dev/palette-exposure-fade',
    },
] as const;
