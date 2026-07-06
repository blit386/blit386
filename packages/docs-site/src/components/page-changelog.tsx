import { apiHistory, compareVersions, getPageSymbols, getSymbol } from '../data/api-history';
import styles from './page-changelog.module.css';

interface PageChangelogProps {
    page: string;
}

type ChangeCategory = 'Added' | 'Changed' | 'Deprecated';

interface ChangeEvent {
    version: string;
    category: ChangeCategory;
    symbol: string;
    note: string;
}

/**
 * Collects every version event across a page's documented symbols: a symbol's `since`
 * becomes an "Added" event, each `changes[]` entry becomes a "Changed" event, and a
 * non-null `deprecated` becomes a "Deprecated" event. Events with no resolved version
 * (falsy `since`/`deprecated`, e.g. a legacy date-only deprecation) are skipped rather
 * than rendered as a broken row.
 */
function collectEvents(page: string): ChangeEvent[] {
    const events: ChangeEvent[] = [];

    for (const name of getPageSymbols(page)) {
        const entry = getSymbol(name);

        if (!entry) {
            continue;
        }

        if (entry.since) {
            events.push({ version: entry.since, category: 'Added', symbol: name, note: '' });
        }

        for (const change of entry.changes) {
            if (change.version) {
                events.push({ version: change.version, category: 'Changed', symbol: name, note: change.note });
            }
        }

        if (entry.deprecated) {
            events.push({ version: entry.deprecated, category: 'Deprecated', symbol: name, note: '' });
        }
    }

    return events;
}

/** Groups events by version, sorted descending by numeric semver (not string order). */
function groupByVersion(events: ChangeEvent[]): [string, ChangeEvent[]][] {
    const byVersion = new Map<string, ChangeEvent[]>();

    for (const event of events) {
        const bucket = byVersion.get(event.version) ?? [];
        bucket.push(event);
        byVersion.set(event.version, bucket);
    }

    return [...byVersion.entries()].sort(([a], [b]) => compareVersions(b, a));
}

/** Formats a version's release date for display, or `null` if it is missing or invalid. */
function formatVersionDate(iso: string | null | undefined): string | null {
    if (!iso) {
        return null;
    }

    const date = new Date(iso);

    return Number.isNaN(date.getTime()) ? null : date.toDateString();
}

/**
 * Renders a Keep-a-Changelog-style history of every documented API symbol on a page,
 * grouped by version (newest first). Within each version, events are listed in the order
 * they were collected: additions, then changes, then deprecations, per symbol.
 */
export function PageChangelog({ page }: PageChangelogProps) {
    const versions = groupByVersion(collectEvents(page));

    if (versions.length === 0) {
        return null;
    }

    return (
        <div className={`not-prose ${styles.changelog}`}>
            {versions.map(([version, events]) => {
                const date = formatVersionDate(apiHistory.versions[version]);

                return (
                    <section key={version} className={styles.version}>
                        <h3 className={styles.versionHeading}>
                            {version}
                            {date && <span className={styles.versionDate}> – {date}</span>}
                        </h3>

                        <ul className={styles.eventList}>
                            {events.map((event) => (
                                <li key={`${event.symbol}:${event.category}:${event.note}`} className={styles.event}>
                                    <span className={`${styles.category} ${styles[event.category.toLowerCase()]}`}>
                                        {event.category}
                                    </span>
                                    <code className={styles.symbol}>{event.symbol}</code>
                                    {event.note && <span className={styles.note}>{event.note}</span>}
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
