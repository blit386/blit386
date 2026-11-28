/**
 * The Plausible custom event the homepage's "Copy the prompt" button sends (BT-860). The event name is also the goal
 * name to add in Plausible's site settings; renaming it here starts a new, empty goal there.
 */
export const PROMPT_COPY_EVENT = 'Copy Prompt';

/** `idea` property values: the visitor typed their own idea, kept the example's, or (no examples) the placeholder. */
export const IDEA_EDITED = 'edited';
export const IDEA_EXAMPLE = 'example';
export const IDEA_PLACEHOLDER = 'placeholder';

export type IdeaSource = typeof IDEA_EDITED | typeof IDEA_EXAMPLE | typeof IDEA_PLACEHOLDER;

type PlausibleFunction = (event: string, options?: { props?: Record<string, string> }) => void;

declare global {
    interface Window {
        /** Defined by the inline stub in `press.config.tsx`; missing when a blocker strips it. */
        plausible?: PlausibleFunction;
    }
}

/** Where the copied prompt's idea line comes from: the visitor's text, the shown example's idea, or neither. */
export function ideaSource(idea: string, exampleIdea: string | undefined): IdeaSource {
    if (idea.trim() !== '') {
        return IDEA_EDITED;
    }

    return exampleIdea === undefined ? IDEA_PLACEHOLDER : IDEA_EXAMPLE;
}

/** Records one prompt copy in Plausible; a missing or broken Plausible never throws to the caller. */
export function trackPromptCopy(source: IdeaSource): void {
    // The copy already worked: a broken analytics script must not turn it into a failure for the visitor.
    try {
        window.plausible?.(PROMPT_COPY_EVENT, { props: { idea: source } });
    } catch (error) {
        console.warn('[prompt-copy] Plausible event failed', error);
    }
}

/**
 * Writes the prompt to the clipboard, then records the copy in Plausible.
 *
 * @throws When the clipboard write fails; nothing is recorded then.
 */
export async function copyPrompt(text: string, source: IdeaSource): Promise<void> {
    await navigator.clipboard.writeText(text);
    trackPromptCopy(source);
}
