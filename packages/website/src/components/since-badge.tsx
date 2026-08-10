import { getSymbol, symbolAnchorId } from '../data/api-history';
import styles from './since-badge.module.css';

interface SinceProps {
    symbol: string;
}

/**
 * Compact inline pill showing when a documented API symbol was introduced, or its status
 * if it is unreleased or deprecated. Renders nothing if `symbol` is not found in the
 * generated API history – a missing or misspelled symbol name silently omits the badge
 * rather than failing the docs build.
 *
 * Carries `id={symbolAnchorId(symbol)}` so a `{@link Name}` tag elsewhere on the site (see
 * `page-changelog.tsx`'s `renderNote`) can link straight to it instead of just the page.
 */
export function Since({ symbol }: SinceProps) {
    const entry = getSymbol(symbol);
    const id = symbolAnchorId(symbol);

    if (!entry) {
        return null;
    }

    if (entry.status === 'unreleased') {
        return (
            <span id={id} className={`not-prose ${styles.badge} ${styles.unreleased}`} title={symbol}>
                <code className={styles.symbol}>{symbol}</code> Unreleased
            </span>
        );
    }

    if (entry.status === 'deprecated') {
        const deprecatedVersion = entry.deprecated?.version;

        return (
            <span id={id} className={`not-prose ${styles.badge} ${styles.deprecated}`} title={symbol}>
                <code className={styles.symbol}>{symbol}</code> Deprecated
                {deprecatedVersion ? ` ${deprecatedVersion}` : ''}
            </span>
        );
    }

    return (
        <span id={id} className={`not-prose ${styles.badge} ${styles.stable}`} title={symbol}>
            <code className={styles.symbol}>{symbol}</code> Since {entry.since}
        </span>
    );
}
