/**
 * The report tail shared by the sync scripts (`sync-cursor-commands`, `sync-maintainer-agents`):
 * after each has planned its files and (outside check mode) written them, this prints what
 * drifted and picks the exit code.
 *
 * @param {object} options
 * @param {string[]} options.drifted Entries that were out of date (and, outside check mode, are now rewritten).
 * @param {number} options.total How many files the script manages.
 * @param {boolean} options.isCheck Report drift without having written anything.
 * @param {string} options.noun What the files are called in messages, as `<noun>(s)`, e.g. `cursor command`.
 * @param {string} options.syncScript The package.json script that fixes drift, e.g. `sync:cursor-commands`.
 * @returns {number} Process exit code: 1 when `isCheck` found drift, else 0.
 */
export function reportSyncDrift({ drifted, total, isCheck, noun, syncScript }) {
    if (isCheck) {
        if (drifted.length > 0) {
            console.error(`\n${drifted.length} ${noun}(s) out of date:`);

            for (const entry of drifted) {
                console.error(`  ${entry}`);
            }

            console.error(`\nRun \`pnpm run ${syncScript}\` to update them.`);
            return 1;
        }

        console.log(`All ${total} ${noun}(s) up to date.`);

        return 0;
    }

    if (drifted.length === 0) {
        console.log(`All ${total} ${noun}(s) already up to date.`);

        return 0;
    }

    for (const entry of drifted) {
        console.log(`updated ${entry}`);
    }

    console.log(`\n${drifted.length} of ${total} ${noun}(s) updated.`);

    return 0;
}
