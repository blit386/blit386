import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumapress/adapters/mdx/schema';
import { transformerTwoslash } from 'fumadocs-twoslash';

// Twoslash spins up a TypeScript language service that loads blit386.d.ts plus
// WebGPU types for every MDX file. With 18 files the cumulative heap exceeds
// Node's default 4 GB limit and the dev server OOMs. Skip it in dev; production
// builds are single-shot and tolerate the memory spike.
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
    mdxOptions: {
        rehypeCodeOptions: {
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: false,
            langs: ['js', 'jsx', 'ts', 'tsx'],
            transformers: isProduction ? [transformerTwoslash({ throws: false })] : [],
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
