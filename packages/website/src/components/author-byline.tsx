import { getAuthor } from '../data/authors';
import styles from './author-byline.module.css';

interface AuthorBylineProps {
    author: string;
}

export function AuthorByline({ author }: AuthorBylineProps) {
    const entry = getAuthor(author);

    if (!entry) {
        return null;
    }

    return (
        <div className={`not-prose mb-0! pb-0! ${styles.container}`}>
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
        </div>
    );
}
