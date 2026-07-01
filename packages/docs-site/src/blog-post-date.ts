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
        return raw;
    }

    if (typeof raw === 'string' || typeof raw === 'number') {
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    return undefined;
}
