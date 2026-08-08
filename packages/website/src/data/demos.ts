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
        title: 'Pixel Art',
        description:
            'Draw sprites and shapes through a shared 256-entry indexed palette for pixel-perfect 2D rendering.',
        thumbnail: '/demos/thumb-005-pixel-art.webp',
        href: 'https://demos.blit386.dev/005-pixel-art',
    },
    {
        title: 'Starfield',
        description: 'Classic parallax starfield built with per-frame palette color cycling and integer vector math.',
        thumbnail: '/demos/thumb-011-starfield.webp',
        href: 'https://demos.blit386.dev/011-starfield',
    },
    {
        title: 'Palette Cycling',
        description: 'Animate entire scenes by rotating palette slots at runtime without touching a single pixel.',
        thumbnail: '/demos/thumb-019-palette-cycling.webp',
        href: 'https://demos.blit386.dev/019-palette-cycling',
    },
    {
        title: 'CRT Pip-Boy',
        description: 'Full-screen CRT scanline and phosphor post-process pass running on the WebGPU backend.',
        thumbnail: '/demos/thumb-023-crt-pipboy.webp',
        href: 'https://demos.blit386.dev/023-crt-pipboy',
    },
    {
        title: 'Snake Game',
        description: 'A complete playable game: input handling, game-state loop, collision, and score rendering.',
        thumbnail: '/demos/thumb-029-snake-game.webp',
        href: 'https://demos.blit386.dev/029-snake-game',
    },
    {
        title: 'Basics Enhanced',
        description: 'Primitives, text, and sprites side-by-side – a quick tour of the core drawing API.',
        thumbnail: '/demos/thumb-033-basics-enhanced.webp',
        href: 'https://demos.blit386.dev/033-basics-enhanced',
    },
] as const;
