import styles from './home-hero.module.css';

export function HomeHero() {
    return (
        <div className={`not-prose ${styles.hero}`}>
            <h1 className={styles.title}>BLIT386</h1>

            <p className={styles.subtitle}>
                A palette-first WebGPU retro engine for TypeScript, with automatic Canvas 2D fallback.
            </p>

            <div className={styles.actions}>
                <a href="/docs/getting-started" className={styles.primaryButton}>
                    Get started
                </a>

                <a href="/docs" className={styles.secondaryButton}>
                    Documentation
                </a>

                {/*
                <a
                    href="https://demos.blit386.dev"
                    className={styles.secondaryButton}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Demos
                </a>
                */}
            </div>
        </div>
    );
}
