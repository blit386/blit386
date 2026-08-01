import type { AuthorEntry } from '../data/authors';
import { getAuthor } from '../data/authors';
import styles from './author-byline.module.css';

interface AuthorBylineProps {
    author: string | AuthorEntry;
}

const PLATFORM_LABELS: Record<string, string> = {
    github: 'GitHub',
    mastodon: 'Mastodon',
    bluesky: 'Bluesky',
    website: 'Website',
    x: 'X',
    linkedin: 'LinkedIn',
};

export function AuthorByline({ author }: AuthorBylineProps) {
    const entry: AuthorEntry | undefined = typeof author === 'string' ? getAuthor(author) : author;

    if (!entry) {
        return null;
    }

    return (
        <div className={`not-prose ${styles.container}`}>
            {entry.avatar && (
                <img
                    src={entry.avatar}
                    alt={entry.name}
                    width={32}
                    height={32}
                    className={styles.avatar}
                    loading="lazy"
                    decoding="async"
                />
            )}

            <span>
                {'By '}
                {entry.url ? (
                    <a href={entry.url} className={styles.nameLink} target="_blank" rel="noopener noreferrer">
                        {entry.name}
                    </a>
                ) : (
                    <span className={styles.name}>{entry.name}</span>
                )}
            </span>

            {entry.socials && entry.socials.length > 0 && (
                <span className={styles.socials}>
                    {entry.socials.map((social) => (
                        <a
                            key={`${social.platform}:${social.url}`}
                            href={social.url}
                            className={styles.socialLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${entry.name} on ${PLATFORM_LABELS[social.platform] ?? social.platform}`}
                        >
                            {social.label ?? PLATFORM_LABELS[social.platform] ?? social.platform}
                        </a>
                    ))}
                </span>
            )}
        </div>
    );
}
