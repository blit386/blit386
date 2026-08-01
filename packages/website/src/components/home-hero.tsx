import { DemoEmbed } from './demo-embed';
import styles from './home-hero.module.css';

export function HomeHero() {
    return (
        <div className={`not-prose ${styles.hero}`}>
            <DemoEmbed demo="034-logo-lowres" title="BLIT386 basics demo" fill className={styles.embed} />

            <div className="sr-only">
                <h1>BLIT386</h1>

                <p>A palette-first WebGPU retro engine for TypeScript, with automatic Canvas 2D fallback.</p>

                <a href="/docs/getting-started">Get started</a>
                <a href="/docs">Documentation</a>
            </div>
        </div>
    );
}
