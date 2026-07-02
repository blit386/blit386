import { DemoEmbed } from './demo-embed';
import styles from './home-hero.module.css';

export function HomeHero() {
    return (
        <div className={`not-prose ${styles.hero}`}>
            <DemoEmbed demo="034-logo-lowres" title="BLIT386 basics demo" fill className={styles.embed} />
        </div>
    );
}
