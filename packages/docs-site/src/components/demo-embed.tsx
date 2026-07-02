import styles from './demo-embed.module.css';

interface DemoEmbedProps {
    demo: string;
    title: string;
    /** Renders as a decorative, click-through background filling its positioned parent instead of a 4:3 block. */
    fill?: boolean;
    className?: string;
}

// The demos site isn't running in production during `waku dev`, so local development
// targets the demos repo's own dev server (`cd blit386-demos && pnpm run dev`) instead.
const DEMO_SRC = import.meta.env.DEV
    ? (demo: string) => `http://localhost:5173/demos/${demo}.html?embed`
    : (demo: string) => `https://demos.blit386.dev/${demo}?embed`;

export function DemoEmbed({ demo, title, fill = false, className }: DemoEmbedProps) {
    return (
        <div
            className={`not-prose ${fill ? styles.embedFill : styles.embed} ${className ?? ''}`}
            aria-hidden={fill || undefined}
        >
            <iframe
                src={DEMO_SRC(demo)}
                title={title}
                loading="lazy"
                tabIndex={fill ? -1 : undefined}
                className={styles.frame}
            />
        </div>
    );
}
