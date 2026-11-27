import { z } from 'zod';
import { CDN_PIN_RE } from '../../../../scripts/lib/cdn-pin.mjs';
import { CHAT_PROMPT_TEXT } from './chat-prompt';

/**
 * The example games the homepage band rolls through (design doc 4.2). Each example is two files in
 * `packages/demos/public/examples/`: `<slug>.html`, the game exactly as the chat app returned it (served untouched at
 * demos.blit386.dev/examples/<slug>), and `<slug>.json`, its metadata in {@link exampleSchema}'s shape. Adding
 * one is a demos deploy plus a website build; no code changes. Only one-shot runs made inside a chat app that passed
 * the live test (BT-859) belong here.
 */
const exampleSchema = z
    .object({
        /** The game's name in the strip. */
        name: z.string().min(1),

        /** The idea line that produced it, prefilled into the prompt box. */
        idea: z.string().min(1),

        /** The chat app, its plan, and the model, as the caption names them: `ChatGPT`, `free plan`, `GPT-5`. */
        app: z.string().min(1),

        plan: z.string().min(1),
        model: z.string().min(1),

        /** When the run happened, `YYYY-MM-DD`. */
        date: z.iso.date(),

        /** The engine version pinned in the prompt the run used; any version but the current pin marks the caption. */
        promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),

        /**
         * The full SHA of a commit whose `public/prompt.txt` is the prompt the run used, so an earlier-prompt caption
         * can link to that exact text. Not a release tag: the first pinned version's tag (1.9.2) predates the file.
         */
        promptCommit: z.string().regex(/^[0-9a-f]{40}$/u),

        /** Band color around the centered game. The host cannot read it from inside the cross-origin iframe. */
        fill: z.string().regex(/^#[0-9a-f]{6}$/iu),
    })
    .strict();

/** One validated example, ready for the band and strip. */
export interface HomeExample extends z.infer<typeof exampleSchema> {
    /** The file name without `.json`, which is also the game page's name on demos.blit386.dev. */
    slug: string;

    /** Whether the run used an older prompt than `public/prompt.txt`, so the caption must say so. */
    earlierPrompt: boolean;

    /** The strip text after the game's name, built from the metadata so it is never typed by hand. */
    caption: string;
}

const SLUG_RE = /([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/u;

/**
 * Validates the metadata files and orders them by file name.
 *
 * @param files Glob result: path to parsed JSON.
 * @param promptVersion The engine version pinned in the current prompt.
 * @throws On a file name that is not a kebab-case slug or metadata that does not match the schema, so a bad example
 *   fails the build instead of shipping a broken band.
 */
export function parseExamples(files: Record<string, unknown>, promptVersion: string): HomeExample[] {
    return Object.keys(files)
        .sort()
        .map((path) => {
            const slug = SLUG_RE.exec(path)?.[1];

            if (slug === undefined || !path.endsWith(`/${slug}.json`)) {
                throw new Error(`[home-examples] ${path}: the file name must be a kebab-case slug`);
            }

            const parsed = exampleSchema.safeParse(files[path]);

            if (!parsed.success) {
                throw new Error(`[home-examples] ${path}: ${z.prettifyError(parsed.error)}`);
            }

            const { app, plan, model } = parsed.data;
            const earlierPrompt = parsed.data.promptVersion !== promptVersion;
            const source = earlierPrompt ? 'an earlier version of the prompt below' : 'the prompt below';

            return {
                ...parsed.data,
                slug,
                earlierPrompt,
                caption: `made in ${app} (${plan}, ${model}) from ${source}, first try, unedited`,
            };
        });
}

function currentPromptVersion(): string {
    const version = CDN_PIN_RE.exec(CHAT_PROMPT_TEXT)?.[2];

    if (version === undefined) {
        throw new Error('[home-examples] public/prompt.txt has no pinned engine URL');
    }

    return version;
}

export const HOME_EXAMPLES = parseExamples(
    import.meta.glob('../../../demos/public/examples/*.json', { eager: true, import: 'default' }),
    currentPromptVersion(),
);
