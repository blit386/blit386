import { getSymbol } from '../data/api-history';
import styles from './since-badge.module.css';

interface SinceProps {
    symbol: string;
}

/**
 * Compact inline pill showing when a documented API symbol was introduced, or its status
 * if it is unreleased or deprecated. Renders nothing if `symbol` is not found in the
 * generated API history - a missing or misspelled symbol name silently omits the badge
 * rather than failing the docs build.
 */
export function Since({ symbol }: SinceProps) {
    const entry = getSymbol(symbol);

    if (!entry) {
        return null;
    }

    if (entry.status === 'unreleased') {
        return (
            <span className={`not-prose ${styles.badge} ${styles.unreleased}`} title={symbol}>
                Unreleased
            </span>
        );
    }

    if (entry.status === 'deprecated') {
        const deprecatedVersion = entry.deprecated?.version ?? entry.since;

        return (
            <span className={`not-prose ${styles.badge} ${styles.deprecated}`} title={symbol}>
                Deprecated {deprecatedVersion}
            </span>
        );
    }

    return (
        <span className={`not-prose ${styles.badge} ${styles.stable}`} title={symbol}>
            Since {entry.since}
        </span>
    );
}
