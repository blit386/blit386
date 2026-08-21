import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { blogMetaSchema, blogPageSchema, metaSchema, pageSchema } from 'fumapress/adapters/mdx/schema';
import { transformerTwoslash } from 'fumadocs-twoslash';
import { z } from 'zod';
import { isTwoslashEnabled, TWOSLASH_COMPILER_OPTIONS } from './scripts/twoslash-config.mjs';

// Gated in scripts/twoslash-config.mjs: on for CLOUDFLARE or WORKERS_CI (Waku's own
// adapter-selection vars, so this tracks "is this a Cloudflare build"), with
// BLIT386_TWOSLASH overriding either way. Keep the check there rather than inlining an
// env read here: covering only CLOUDFLARE is what let a WORKERS_CI build ship every
// popup missing and silent (BT-188).
//
// Dev is opt-in (`pnpm run dev:twoslash`) because the annotated page payload is huge,
// not because the language service is: one shared service handles all 155 blocks in
// ~320 MB, but a twoslashed page renders ~6.8 MB of HTML against ~0.6 MB plain, and the
// dev server retains roughly 2 GB per distinct page visited. Measurements and the
// resulting usage limits: CLAUDE.md, Twoslash.
const twoslashEnabled = isTwoslashEnabled();

export default defineConfig({
    mdxOptions: {
        rehypeCodeOptions: {
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: false,
            langs: ['js', 'jsx', 'ts', 'tsx'],
            transformers: twoslashEnabled
                ? [
                      transformerTwoslash({
                          throws: false,
                          twoslashOptions: { compilerOptions: TWOSLASH_COMPILER_OPTIONS },
                      }),
                  ]
                : [],
        },
    },
});

export const docs = defineDocs({
    dir: 'content',

    docs: {
        async: true,
        schema: pageSchema.extend({ lastModified: z.coerce.date().optional(), editUrl: z.string().optional() }),
        postprocess: {
            includeProcessedMarkdown: true,
        },

        // Explicit include list so content/blog/** is owned solely by the blog
        // collection. Negation patterns don't work in this codegen (normalizeViteGlobPath
        // prepends "./" before "!", turning "!blog/**" into "./!blog/**" which is a
        // literal path match instead of a negation).
        files: ['*.{mdx,md}', 'docs/**/*.{mdx,md}'],
    },

    meta: {
        schema: metaSchema,
        files: ['*.{json,yaml}', 'docs/**/*.{json,yaml}'],
    },
});

export const blog = defineDocs({
    dir: 'content/blog',

    docs: {
        async: true,
        schema: blogPageSchema.extend({ author: z.string().optional(), date: z.coerce.date().optional() }),
        postprocess: {
            includeProcessedMarkdown: true,
        },
    },

    meta: {
        schema: blogMetaSchema,
    },
});
