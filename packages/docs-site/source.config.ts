import { defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumapress/adapters/mdx/schema';
import { transformerTwoslash } from 'fumadocs-twoslash';

export const docs = defineDocs({
    dir: 'content',
    docs: {
        async: true,
        schema: pageSchema,
        postprocess: {
            includeProcessedMarkdown: true,
        },
        rehypeCodeOptions: {
            langs: ['js', 'jsx', 'ts', 'tsx'],
            transformers: [transformerTwoslash()],
        },
    },
    meta: {
        schema: metaSchema,
    },
});
