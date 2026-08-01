export type DemoEntry = {
    title: string;
    description: string;
    /**
     * Path to a local thumbnail image under `public/`.
     * TODO: replace each SVG placeholder with a real screenshot before launch.
     */
    thumbnail: string;
    /** Full URL to the hosted demo at demos.blit386.dev. */
    href: string;
};

export const flagshipDemos: readonly DemoEntry[] = [
    {
        title: 'Pixel Art',
        description:
            'Draw sprites and shapes through a shared 256-entry indexed palette for pixel-perfect 2D rendering.',
        thumbnail: '/demos/thumb-005-pixel-art.svg',
        href: 'https://demos.blit386.dev/005-pixel-art',
    },
    {
        title: 'Starfield',
        description: 'Classic parallax starfield built with per-frame palette color cycling and integer vector math.',
        thumbnail: '/demos/thumb-011-starfield.svg',
        href: 'https://demos.blit386.dev/011-starfield',
    },
    {
        title: 'Palette Cycling',
        description: 'Animate entire scenes by rotating palette slots at runtime without touching a single pixel.',
        thumbnail: '/demos/thumb-019-palette-cycling.svg',
        href: 'https://demos.blit386.dev/019-palette-cycling',
    },
    {
        title: 'CRT Pip-Boy',
        description: 'Full-screen CRT scanline and phosphor post-process pass running on the WebGPU backend.',
        thumbnail: '/demos/thumb-023-crt-pipboy.svg',
        href: 'https://demos.blit386.dev/023-crt-pipboy',
    },
    {
        title: 'Snake Game',
        description: 'A complete playable game: input handling, game-state loop, collision, and score rendering.',
        thumbnail: '/demos/thumb-029-snake-game.svg',
        href: 'https://demos.blit386.dev/029-snake-game',
    },
    {
        title: 'Basics Enhanced',
        description: 'Primitives, text, and sprites side-by-side — a quick tour of the core drawing API.',
        thumbnail: '/demos/thumb-033-basics-enhanced.svg',
        href: 'https://demos.blit386.dev/033-basics-enhanced',
    },
] as const;
