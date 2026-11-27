/** Vite's `?raw` suffix imports a file as its text; `src/data/chat-prompt.ts` reads `public/prompt.txt` this way. */
declare module '*.txt?raw' {
    const text: string;

    export default text;
}
