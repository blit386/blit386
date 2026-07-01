import { flagshipDemos } from '../data/demos';
import styles from './demo-showcase.module.css';

export function DemoShowcase() {
    return (
        <div className={`not-prose ${styles.showcase}`}>
            <h2 className={styles.heading}>Featured demos</h2>

            <div className={styles.grid}>
                {flagshipDemos.map((demo) => (
                    <a
                        key={demo.href}
                        href={demo.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`group ${styles.card}`}
                    >
                        {/*
                        <div className={styles.thumbnail}>
                            <img
                                src={demo.thumbnail}
                                alt={demo.title}
                                width={320}
                                height={180}
                                className={styles.thumbnailImage}
                            />
                        </div>
                        */}

                        <div className={styles.info}>
                            <span className={styles.cardTitle}>{demo.title}</span>
                            <span className={styles.cardDescription}>{demo.description}</span>
                        </div>
                    </a>
                ))}
            </div>

            {/*
            <div className={styles.footer}>
                <a
                    href="https://demos.blit386.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.viewAllButton}
                >
                    View all demos
                </a>
            </div>
            */}
        </div>
    );
}
