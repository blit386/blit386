import { flagshipDemos } from '../data/demos';

export function DemoShowcase() {
    return (
        <div className="not-prose my-8">
            <h2 className="mb-6 text-2xl font-bold tracking-tight text-fd-foreground">Featured demos</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {flagshipDemos.map((demo) => (
                    <a
                        key={demo.href}
                        href={demo.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col overflow-hidden rounded-lg border border-fd-border bg-fd-card transition-colors hover:bg-fd-accent"
                    >
                        <div className="aspect-video w-full overflow-hidden bg-fd-muted">
                            <img
                                src={demo.thumbnail}
                                alt={demo.title}
                                width={320}
                                height={180}
                                className="h-full w-full object-cover"
                            />
                        </div>

                        <div className="flex flex-col gap-1 p-4">
                            <span className="text-sm font-semibold text-fd-foreground group-hover:text-fd-primary">
                                {demo.title}
                            </span>
                            <span className="text-xs text-fd-muted-foreground">{demo.description}</span>
                        </div>
                    </a>
                ))}
            </div>

            <div className="mt-6 text-center">
                <a
                    href="https://demos.blit386.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-fd-border bg-fd-background px-5 py-2.5 text-sm font-semibold text-fd-foreground transition-colors hover:bg-fd-accent"
                >
                    View all demos
                </a>
            </div>
        </div>
    );
}
