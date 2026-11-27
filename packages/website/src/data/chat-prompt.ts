import promptText from '../../public/prompt.txt?raw';

/**
 * The idea line in `public/prompt.txt` that the homepage swaps for the visitor's idea (see `CLAUDE.md`, Chat prompt).
 * Manual-sync hazard: the prompt file is plain text and cannot import this, so rewording that line there means
 * changing these two constants; `splitPrompt` throws at build time when they no longer match.
 */
const IDEA_LINE_PREFIX = 'My game idea: ';
const IDEA_PLACEHOLDER = '[describe your game in a sentence or two]';

/** The prompt cut around its idea line, so the page can show an editable field in that line's place. */
export interface ChatPrompt {
    /** Everything before the idea line, ending with its newline. */
    head: string;

    /** `My game idea: `, shown in front of the editable field. */
    ideaPrefix: string;

    /** The text the prompt file itself puts after the prefix. */
    ideaPlaceholder: string;

    /** Everything after the idea line, starting with its newline. */
    tail: string;

    /** How many lines `tail` holds after the idea line, for the "+N more lines" toggle. */
    tailLineCount: number;
}

/**
 * Splits a prompt around its one idea line.
 *
 * @throws When the idea line is missing or appears more than once - the page cannot know which line to edit.
 */
export function splitPrompt(text: string): ChatPrompt {
    const line = `${IDEA_LINE_PREFIX}${IDEA_PLACEHOLDER}`;
    const lines = text.split('\n');
    const index = lines.indexOf(line);

    if (index === -1 || lines.lastIndexOf(line) !== index) {
        throw new Error(`[chat-prompt] public/prompt.txt must contain the line "${line}" exactly once`);
    }

    const tailLines = lines.slice(index + 1);

    return {
        head: lines
            .slice(0, index)
            .map((entry) => `${entry}\n`)
            .join(''),
        ideaPrefix: IDEA_LINE_PREFIX,
        ideaPlaceholder: IDEA_PLACEHOLDER,
        tail: tailLines.map((entry) => `\n${entry}`).join(''),

        // A trailing newline at the end of the file leaves one empty entry that is not a line of its own.
        tailLineCount: tailLines.at(-1) === '' ? tailLines.length - 1 : tailLines.length,
    };
}

/** The full prompt with `idea` on the idea line, or the file's own placeholder when `idea` is blank. */
export function withIdea(prompt: ChatPrompt, idea: string): string {
    const trimmed = idea.trim();

    return `${prompt.head}${prompt.ideaPrefix}${trimmed === '' ? prompt.ideaPlaceholder : trimmed}${prompt.tail}`;
}

/** `public/prompt.txt`, the single source of the homepage's shown, copied and markdown prompt text. */
export const CHAT_PROMPT_TEXT = promptText;

export const CHAT_PROMPT = splitPrompt(promptText);
