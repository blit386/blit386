/**
 * Review findings for the /shots page: flagged tiles and free-text notes, kept in
 * localStorage so a reload keeps them, exported as markdown for a ticket or a chat message.
 */

const STORAGE_KEY = 'blit386-shots-findings';

/**
 * @param {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} storage
 */
function createFindings(storage) {
    /** @type {{ flagged: string[], notes: Record<string, string[]> }} */
    let state = { flagged: [], notes: {} };

    try {
        const raw = storage.getItem(STORAGE_KEY);

        if (raw) {
            state = { ...state, ...JSON.parse(raw) };
        }
    } catch {
        // A corrupt entry is not worth a crash; start empty and overwrite on the next change.
    }

    function persist() {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    const label = (key) => key.replace('/', ' / ');

    return {
        toggleFlag(key) {
            state.flagged = state.flagged.includes(key)
                ? state.flagged.filter((item) => item !== key)
                : [...state.flagged, key];
            persist();
        },
        addNote(key, text) {
            const trimmed = text.trim();

            if (!trimmed) {
                return;
            }

            state.notes = { ...state.notes, [key]: [...(state.notes[key] ?? []), trimmed] };
            persist();
        },
        notesFor: (key) => state.notes[key] ?? [],
        flaggedKeys: () => [...state.flagged],
        toMarkdown() {
            const keys = [...new Set([...state.flagged, ...Object.keys(state.notes)])].sort();

            return keys
                .map((key) => {
                    const notes = state.notes[key] ?? [];

                    return notes.length > 0
                        ? notes.map((note) => `- ${label(key)}: ${note}`).join('\n')
                        : `- ${label(key)}: flagged`;
                })
                .join('\n')
                .concat('\n');
        },
        clear() {
            state = { flagged: [], notes: {} };
            persist();
        },
    };
}

export { createFindings };
