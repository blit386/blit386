'use client';

import { useEffect, useRef, useState } from 'react';
import { CHAT_PROMPT, withIdea } from '../data/chat-prompt';
import { useHomeStart } from './home-start-client';
import styles from './home-start.module.css';

const COPIED_LABEL_MS = 4000;

type CopyState = 'idle' | 'copied' | 'manual';

const COPY_LABEL: Record<CopyState, string> = {
    idle: 'Copy the prompt',
    copied: 'Copied - now paste it into your AI',
    manual: 'Press Ctrl+C / Cmd+C to copy',
};

/** The prompt box and its "Copy the prompt" button (design doc 4.3), from `public/prompt.txt`. */
export function PromptBoxClient() {
    const { example, idea, touched, ideaFocused, setIdea, setIdeaFocused } = useHomeStart();
    const [expanded, setExpanded] = useState(false);
    const [copyState, setCopyState] = useState<CopyState>('idle');
    const manualRef = useRef<HTMLTextAreaElement>(null);

    // Copying without typing keeps the example's idea, so the paste still makes a game.
    const text = withIdea(CHAT_PROMPT, idea.trim() === '' ? (example?.idea ?? '') : idea);
    const fieldValue = ideaFocused || touched ? idea : (example?.idea ?? '');

    useEffect(() => {
        if (copyState === 'copied') {
            const timer = setTimeout(() => setCopyState('idle'), COPIED_LABEL_MS);
            return () => clearTimeout(timer);
        }

        if (copyState === 'manual') {
            manualRef.current?.select();
        }

        return undefined;
    }, [copyState]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyState('copied');
        } catch {
            // No Clipboard API, or the browser refused: hand the visitor selected text instead of failing silently.
            setCopyState('manual');

            // Already shown after an earlier refusal: the state does not change, so the effect will not select it.
            manualRef.current?.select();
        }
    };

    return (
        <div className={styles.prompt}>
            <div className={styles.box}>
                <div className={styles.promptText}>
                    {CHAT_PROMPT.head}
                    {CHAT_PROMPT.ideaPrefix}
                    <input
                        type="text"
                        className={styles.idea}
                        value={fieldValue}
                        placeholder={example?.idea ?? CHAT_PROMPT.ideaPlaceholder}
                        aria-label="Your game idea"
                        onChange={(event) => setIdea(event.target.value)}
                        onFocus={() => setIdeaFocused(true)}
                        onBlur={() => setIdeaFocused(false)}
                    />
                    {expanded && CHAT_PROMPT.tail}
                </div>

                <button
                    type="button"
                    className={styles.more}
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                >
                    {expanded ? 'Show less' : `+${CHAT_PROMPT.tailLineCount} more lines`}
                </button>

                <p className={styles.hint}>Click the idea to write your own.</p>

                {copyState === 'manual' && (
                    <textarea ref={manualRef} className={styles.manual} value={text} readOnly aria-label="The prompt" />
                )}
            </div>

            {/* After the box in the DOM, so tab and reading order are type, then copy; the grid places it visually. */}
            <button type="button" className={styles.copy} onClick={copy} aria-live="polite">
                {COPY_LABEL[copyState]}
            </button>
        </div>
    );
}
