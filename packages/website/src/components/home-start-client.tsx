'use client';

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import type { HomeExample } from '../data/home-examples';
import styles from './home-start.module.css';

// The demos site isn't running in production during `waku dev`; same switch as `DemoEmbed`. Cloudflare Pages serves
// `<slug>.html` at the extensionless path and redirects the `.html` one, so production asks for that path directly.
const EXAMPLE_SRC = import.meta.env.DEV
    ? (slug: string) => `http://localhost:5173/examples/${slug}.html`
    : (slug: string) => `https://demos.blit386.dev/examples/${slug}`;

/** The exact prompt text a run used, at the commit its metadata records. */
const promptAtCommitUrl = (commit: string) =>
    `https://github.com/blit386/blit386/blob/${commit}/packages/website/public/prompt.txt`;

interface HomeStartState {
    /** The example on show, or `undefined` when there are none yet. */
    example: HomeExample | undefined;

    /** What the visitor typed into the idea field. */
    idea: string;

    /** Whether the visitor has typed at all: from then on the prompt box is theirs and nothing rolls. */
    touched: boolean;

    ideaFocused: boolean;
    setIdea: (idea: string) => void;
    setIdeaFocused: (focused: boolean) => void;
}

const HomeStartContext = createContext<HomeStartState | undefined>(undefined);

/** The shared state of the band and the prompt box. */
export function useHomeStart(): HomeStartState {
    const state = useContext(HomeStartContext);

    if (state === undefined) {
        throw new Error('[home-start] PromptBox must sit inside HomeStart');
    }

    return state;
}

/** The countdown ring: a circle that empties over one example's turn, then advances (`onAnimationEnd`). */
function Ring({ onDone }: { onDone: () => void }) {
    return (
        <svg className={styles.ring} viewBox="0 0 20 20" aria-hidden="true">
            <circle className={styles.ringTrack} cx="10" cy="10" r="8" pathLength="1" />
            <circle className={styles.ringProgress} cx="10" cy="10" r="8" pathLength="1" onAnimationEnd={onDone} />
        </svg>
    );
}

interface HomeStartClientProps {
    examples: HomeExample[];
    children: ReactNode;
}

/**
 * The homepage first screen: the game band and strip (design doc 4.2), then the MDX children - headline, sub-line,
 * `PromptBox` and developer line - laid out by CSS grid areas.
 *
 * Rolling needs no timer: the ring's CSS animation is the clock, and pausing it (hover, keyboard focus, focus in the
 * game or the idea field) or `prefers-reduced-motion` (no animation at all) stops the advance with it.
 *
 * shortcut: the next game is not preloaded before its turn; add a hidden second iframe if the swap feels slow.
 */
export function HomeStartClient({ examples, children }: HomeStartClientProps) {
    const [index, setIndex] = useState(0);
    const [idea, setIdeaState] = useState('');
    const [touched, setTouched] = useState(false);
    const [ideaFocused, setIdeaFocused] = useState(false);
    const [gameFocused, setGameFocused] = useState(false);
    const gameRef = useRef<HTMLIFrameElement>(null);
    const pointerOnGame = useRef(false);

    // A visitor playing the game must not have it swapped away. Focus inside a cross-origin iframe does not match
    // `:focus` or `:focus-within` in this page, so CSS cannot see it; the window losing focus to the iframe can.
    // Firefox still reports `<body>` as the active element during that blur (Mozilla bug 1545573), so a click into the
    // game also counts when the pointer was over it.
    useEffect(() => {
        const onBlur = () =>
            setGameFocused(
                pointerOnGame.current || (gameRef.current !== null && document.activeElement === gameRef.current),
            );
        const onFocus = () => setGameFocused(false);

        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);

        return () => {
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    const example = examples[index];
    const several = examples.length > 1;
    const go = (step: number) => setIndex((current) => (current + step + examples.length) % examples.length);

    const setIdea = (value: string) => {
        setIdeaState(value);
        setTouched(true);
    };

    return (
        <HomeStartContext.Provider value={{ example, idea, touched, ideaFocused, setIdea, setIdeaFocused }}>
            <div className={styles.start} data-full-bleed="">
                {example && (
                    <div className={styles.showcase} data-paused={ideaFocused || gameFocused || undefined}>
                        <div className={styles.band} style={{ backgroundColor: example.fill }}>
                            <iframe
                                key={example.slug}
                                ref={gameRef}
                                src={EXAMPLE_SRC(example.slug)}
                                title={`${example.name}, an example game`}
                                className={styles.game}
                                onPointerEnter={() => {
                                    pointerOnGame.current = true;
                                }}
                                onPointerLeave={() => {
                                    pointerOnGame.current = false;
                                }}
                                // Same sandbox as `DemoEmbed`. The game stays in its own demos.blit386.dev origin, so
                                // it cannot reach this page; with an opaque origin (no `allow-same-origin`) the game
                                // never rendered in testing.
                                sandbox="allow-scripts allow-same-origin"
                            />
                        </div>

                        <div className={styles.strip}>
                            {several && !touched && <Ring key={index} onDone={() => go(1)} />}

                            <p className={styles.caption}>
                                <strong>{example.name}</strong> - {example.caption}
                                {example.earlierPrompt && (
                                    <>
                                        {' '}
                                        (<a href={promptAtCommitUrl(example.promptCommit)}>that prompt</a>)
                                    </>
                                )}
                            </p>

                            {several && (
                                <nav className={styles.pager} aria-label="Example games">
                                    <button type="button" onClick={() => go(-1)} aria-label="Previous example">
                                        &lt;
                                    </button>

                                    {examples.map((entry, entryIndex) => (
                                        <button
                                            key={entry.slug}
                                            type="button"
                                            className={styles.dot}
                                            onClick={() => setIndex(entryIndex)}
                                            aria-label={`Example ${entryIndex + 1} of ${examples.length}: ${entry.name}`}
                                            aria-current={entryIndex === index || undefined}
                                        />
                                    ))}

                                    <button type="button" onClick={() => go(1)} aria-label="Next example">
                                        &gt;
                                    </button>
                                </nav>
                            )}
                        </div>
                    </div>
                )}

                <div className={styles.intro}>{children}</div>
            </div>
        </HomeStartContext.Provider>
    );
}
