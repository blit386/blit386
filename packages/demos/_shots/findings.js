/**
 * Review findings for the /shots page: flagged tiles and free-text notes, kept in
 * localStorage so a reload keeps them, exported as markdown for a ticket or a chat message.
 */

const STORAGE_KEY = 'blit386-shots-findings';

/**
 * Keep only the parts of a stored value that have the expected shape: a wrong-shaped entry
 * (an older format, a hand edit) falls back to empty rather than breaking every later call.
 *
 * @param {unknown} parsed
 * @returns {{ flagged: string[], notes: Record<string, string[]> }}
 */
function sanitize(parsed) {
    const stored = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const flagged = Array.isArray(stored.flagged) ? stored.flagged.filter((key) => typeof key === 'string') : [];
    const notes = {};

    if (stored.notes && typeof stored.notes === 'object' && !Array.isArray(stored.notes)) {
        for (const [key, list] of Object.entries(stored.notes)) {
            if (Array.isArray(list)) {
                notes[key] = list.filter((note) => typeof note === 'string');
            }
        }
    }

    return { flagged, notes };
}

/**
 * @param {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} storage
 */
function createFindings(storage) {
    /** @type {{ flagged: string[], notes: Record<string, string[]> }} */
    let state = { flagged: [], notes: {} };

    try {
        const raw = storage.getItem(STORAGE_KEY);

        if (raw) {
            state = sanitize(JSON.parse(raw));
        }
    } catch {
        // A corrupt entry is not worth a crash; start empty and overwrite on the next change.
    }

    function persist() {
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // Quota or private mode: keep the findings in memory for this page load rather than fail the key press.
        }
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
