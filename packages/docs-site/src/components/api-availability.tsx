import type { SymbolHistory } from '../data/api-history';
import { compareVersions, getPageSymbols, getSymbol } from '../data/api-history';
import styles from './api-availability.module.css';

interface ApiAvailabilityProps {
    page: string;
}

interface AvailabilityRow {
    name: string;
    entry: SymbolHistory;
}

/**
 * Returns the highest version among a symbol's recorded changes, or an en dash when the
 * symbol has never changed since its introduction.
 */
function lastChangedVersion(entry: SymbolHistory): string {
    if (entry.changes.length === 0) {
        return '–';
    }

    return entry.changes
        .map((change) => change.version)
        .reduce((max, version) => (compareVersions(version, max) > 0 ? version : max));
}

/**
 * Renders a table of every documented API symbol on a page: its name, the version it has
 * been available since, the highest version it last changed in, and its current lifecycle
 * status. Rows are sorted alphabetically by symbol name; symbols listed on the page but
 * missing from the generated API history are skipped.
 */
export function ApiAvailability({ page }: ApiAvailabilityProps) {
    const rows: AvailabilityRow[] = getPageSymbols(page)
        .map((name) => {
            const entry = getSymbol(name);
            return entry ? { name, entry } : undefined;
        })
        .filter((row): row is AvailabilityRow => row !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name));

    if (rows.length === 0) {
        return null;
    }

    return (
        <div className="not-prose">
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.headerCell}>Symbol</th>
                        <th className={styles.headerCell}>Since</th>
                        <th className={styles.headerCell}>Last changed</th>
                        <th className={styles.headerCell}>Status</th>
                    </tr>
                </thead>

                <tbody>
                    {rows.map(({ name, entry }) => (
                        <tr key={name} className={styles.row}>
                            <td className={styles.cell}>
                                <code>{name}</code>
                            </td>
                            <td className={styles.cell}>{entry.since}</td>
                            <td className={styles.cell}>{lastChangedVersion(entry)}</td>
                            <td className={styles.cell}>{entry.status}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
