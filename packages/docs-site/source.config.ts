import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumapress/adapters/mdx/schema';
import { transformerTwoslash } from 'fumadocs-twoslash';

export default defineConfig({
    mdxOptions: {
        rehypeCodeOptions: {
            langs: ['js', 'jsx', 'ts', 'tsx'],
            transformers: [transformerTwoslash()],
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
