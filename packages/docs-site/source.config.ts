import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumapress/adapters/mdx/schema';
import { transformerTwoslash } from 'fumadocs-twoslash';

// Twoslash spins up a TypeScript language service that loads blit386.d.ts plus
// WebGPU types for every MDX file. With 18 files the cumulative heap exceeds
// Node's default 4 GB limit and the dev server OOMs. Skip it during `waku dev`;
// production builds set CLOUDFLARE=1 (single-shot, survives the memory spike).
// NODE_ENV is not a reliable signal here: source.config.ts is evaluated by the
// fumadocs-mdx Vite plugin before Vite writes NODE_ENV=production into the env.
const isProductionBuild = !!process.env.CLOUDFLARE;

export default defineConfig({
    mdxOptions: {
        rehypeCodeOptions: {
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: false,
            langs: ['js', 'jsx', 'ts', 'tsx'],
            transformers: isProductionBuild ? [transformerTwoslash({ throws: false })] : [],
        },
    },
});

export const docs = defineDocs({
    dir: 'content',
    docs: {
        async: true,
        schema: pageSchema,
        postprocess: {
            includeProcessedMarkdown: true,
        },
    },
    meta: {
        schema: metaSchema,
    },
});
