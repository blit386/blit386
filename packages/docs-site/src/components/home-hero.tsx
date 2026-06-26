export function HomeHero() {
    return (
        <div className="not-prose flex flex-col items-center gap-6 py-16 text-center">
            <h1 className="text-6xl font-bold tracking-tight text-fd-foreground">BLIT386</h1>

            <p className="max-w-xl text-lg text-fd-muted-foreground">
                A palette-first WebGPU retro engine for TypeScript, with automatic Canvas 2D fallback.
            </p>

            <div className="flex flex-wrap justify-center gap-3">
                <a
                    href="/docs/getting-started"
                    className="inline-flex items-center rounded-md bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground transition-opacity hover:opacity-90"
                >
                    Get started
                </a>

                <a
                    href="/docs"
                    className="inline-flex items-center rounded-md border border-fd-border bg-fd-background px-5 py-2.5 text-sm font-semibold text-fd-foreground transition-colors hover:bg-fd-accent"
                >
                    Docs
                </a>

                <a
                    href="https://demos.blit386.dev"
                    className="inline-flex items-center rounded-md border border-fd-border bg-fd-background px-5 py-2.5 text-sm font-semibold text-fd-foreground transition-colors hover:bg-fd-accent"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Demos
                </a>
            </div>
        </div>
    );
}
