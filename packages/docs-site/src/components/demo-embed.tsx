import styles from './demo-embed.module.css';

interface DemoEmbedProps {
    demo: string;
    title: string;
    className?: string;
}

// The demos site isn't running in production during `waku dev`, so local development
// targets the demos repo's own dev server (`cd blit386-demos && pnpm run dev`) instead.
const DEMO_SRC = import.meta.env.DEV
    ? (demo: string) => `http://localhost:5173/demos/${demo}.html?embed`
    : (demo: string) => `https://demos.blit386.dev/${demo}?embed`;

export function DemoEmbed({ demo, title, className }: DemoEmbedProps) {
    return (
        <div className={`not-prose ${styles.embed} ${className ?? ''}`}>
            <iframe src={DEMO_SRC(demo)} title={title} loading="lazy" className={styles.frame} />
        </div>
    );
}
