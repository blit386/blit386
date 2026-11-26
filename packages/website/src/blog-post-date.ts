import type { Adapter, ConfigContext } from 'fumapress';

/**
 * Reads a blog post's publish date straight from its `date` frontmatter field.
 *
 * The `core:get-creation-date` adapter (fumapress's own mechanism for this) only sees the
 * eagerly-loaded frontmatter preview, where `date` survives the Vite dev/RSC boundary as a
 * plain ISO string rather than the `Date` instance the adapter checks for - so it always
 * returns undefined for async doc collections. Parsing the frontmatter value directly here
 * sidesteps that. `page.data` is typed `unknown` because the generic `PageData` type
 * (fumadocs-core) does not declare `date` - it is validated by the blog-specific schema
 * extension in `source.config.ts`, which this generic helper does not depend on.
 */
export function getPostDate(page: { data: unknown }): Date | undefined {
    const raw = (page.data as { date?: unknown } | null | undefined)?.date;

    if (raw instanceof Date) {
        return Number.isNaN(raw.getTime()) ? undefined : raw;
    }

    if (typeof raw === 'string' || typeof raw === 'number') {
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    return undefined;
}

/**
 * Supplies `core:get-creation-date` from the same frontmatter reader the blog index and
 * `feedPlugin` use, so fumapress's own blog layouts resolve dates the way this site's components do.
 *
 * Registered ahead of `fumadocsMdx` in `press.config.tsx`. Without it the tag pages
 * (`/blog/tags/<tag>`) rendered today's date on every card: they are fumapress's stock
 * `createBlogTagPage()`, whose `OrderedBlogGrid` resolves each post through `getCreationDate`
 * and substitutes `new Date(Date.now())` whenever no adapter answers - and the mdx adapter's
 * hook answers only for a real `Date` instance, which async doc collections never produce (see
 * `getPostDate` above). The blog index escaped this only because it never asks the adapters.
 *
 * The mdx adapter is left in place behind this one rather than replaced: it also serves
 * `core:render-body`, `core:render-toc`, `core:get-modified-date`, and `blog:get-tags`.
 */
export function blogPostDateAdapter<C extends ConfigContext = ConfigContext>(): Adapter<C> {
    return {
        'core:get-creation-date': (page) => getPostDate(page),
    };
}
