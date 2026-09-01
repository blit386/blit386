import { Fragment } from 'react';
import type { AppContext } from 'fumapress';
import { FEDIVERSE_HANDLE } from '../data/site';

type MetaPage = AppContext['$context']['page'];

/** Dimensions of the hand-rolled `/blog.webp` OG image (press.config.tsx); must match the
 * `width`/`height` passed to its `ImageResponse` call, the same coupling `takumiPlugin` keeps
 * internally for every content-loader page. */
export const BLOG_INDEX_OG_IMAGE_WIDTH = 1200;
export const BLOG_INDEX_OG_IMAGE_HEIGHT = 630;

/**
 * Reconstructs fumapress's internal `renderPageMeta` (`title`, `og:title`/`og:description`,
 * the site's `meta.page()` block from `press.config.tsx`, and every `ctx.data['core:page-meta']`
 * hook – notably `takumiPlugin`'s `og:image`/`width`/`height`). That function
 * itself is not part of fumapress's public API, only exercised internally by the framework's own
 * `docsPageLayout` and stock blog layout – `BlogPage` replaces the latter with a hand-rolled
 * component (for the docs-style TOC sidebar, see its own doc comment) and lost this call in the
 * process. `getPressContext()`'s public `AppContext` type exposes both pieces (`metaConfig` and
 * `data`) needed to rebuild it without reaching into fumapress internals.
 */
export function renderBlogPostMeta(page: MetaPage, ctx: AppContext) {
    return (
        <>
            <title>{page.data.title}</title>
            <meta property="og:title" content={page.data.title} />
            {page.data.description && <meta property="og:description" content={page.data.description} />}
            {ctx.metaConfig?.page?.call(ctx, page)}
            {ctx.data['core:page-meta']?.map((hook, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: hooks come from the static plugin chain (press.config.tsx .plugins(...)), never reordered at runtime
                <Fragment key={i}>{hook(page)}</Fragment>
            ))}
        </>
    );
}

interface ListingMetaOptions {
    /** Only `/blog` itself carries this: `takumiPlugin` generates an OG image per content-loader
     * page (`packages/blit386/docs/...`, `content/blog/...`), and every route this file covers –
     * the index, the tags listing, and each tag – is a plugin-created route rather than one of
     * those. `/blog` gets a hand-rolled equivalent (`press.config.tsx`, `/blog.webp`); the tags
     * routes do not, since no template exists for what a per-tag card should show. */
    ogImage?: { width: number; height: number };
    /** Only `/blog` carries a JSON-LD `Blog` block; the tags listing and per-tag pages are
     * navigational, not content the site wants indexed as structured data. */
    jsonLd?: boolean;
}

/**
 * Shared by `renderBlogIndexMeta`, `renderBlogTagsMeta`, and `renderBlogTagMeta` below: none of
 * `/blog`, `/blog/tags`, or `/blog/tags/<tag>` key off a single `Page`, so fumapress's own
 * `renderPageMeta` (see `renderBlogPostMeta`'s doc comment) has nothing to call for any of them –
 * `createBlogIndexPage()`/`createBlogTagsPage()`/`createBlogTagPage()` never call it either, which
 * left all three shipping with no `<title>` at all.
 */
function renderListingMeta(
    ctx: AppContext,
    path: string,
    title: string,
    description: string,
    options: ListingMetaOptions = {},
) {
    const url = ctx.siteConfig.baseUrl ? `${ctx.siteConfig.baseUrl}${path}` : path;

    // Escape </ so a field value containing "</script>" cannot terminate the tag, mirroring
    // press.config.tsx's meta.page(). \/ is a valid JSON escape, so parsers handle it correctly.
    const jsonLd = options.jsonLd
        ? JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Blog',
              name: title,
              description,
              url,
          }).replaceAll('</', '<\\/')
        : undefined;

    return (
        <>
            <title>{title}</title>
            <meta name="description" content={description} />

            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={url} />
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content={ctx.siteConfig.name} />

            {options.ogImage && (
                <>
                    <meta
                        property="og:image"
                        content={
                            ctx.siteConfig.baseUrl
                                ? new URL(`${path}.webp`, ctx.siteConfig.baseUrl).href
                                : `${path}.webp`
                        }
                    />
                    <meta property="og:image:width" content={String(options.ogImage.width)} />
                    <meta property="og:image:height" content={String(options.ogImage.height)} />
                    <meta property="twitter:card" content="summary_large_image" />
                </>
            )}

            <meta name="fediverse:creator" content={FEDIVERSE_HANDLE} />

            <link rel="canonical" href={url} />

            {jsonLd && (
                // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw script content; data is static site copy, not user input
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
            )}
        </>
    );
}

/** `/blog` – see `renderListingMeta`'s doc comment for why this doesn't call fumapress's own
 * `renderPageMeta`. Carries the JSON-LD `Blog` block and, now that `/blog.webp` exists
 * (`press.config.tsx`), the same `og:image`/`width`/`height`/`twitter:card` set `takumiPlugin`
 * emits for a real content-loader page. */
export function renderBlogIndexMeta(ctx: AppContext, indexPath: string, title: string, description: string) {
    return renderListingMeta(ctx, indexPath, title, description, {
        jsonLd: true,
        ogImage: { width: BLOG_INDEX_OG_IMAGE_WIDTH, height: BLOG_INDEX_OG_IMAGE_HEIGHT },
    });
}

/** `/blog/tags` – see `renderListingMeta`'s doc comment. No OG image: out of scope, no template
 * exists for what a tags-listing card should show. */
export function renderBlogTagsMeta(ctx: AppContext, tagsPath: string, title: string, description: string) {
    return renderListingMeta(ctx, tagsPath, title, description);
}

/** `/blog/tags/<tag>` – see `renderListingMeta`'s doc comment. `title`/`description` are synthetic
 * (there is no `Page` backing a tag), and, like `renderBlogTagsMeta`, there is no OG image. */
export function renderBlogTagMeta(ctx: AppContext, tagsPath: string, tag: string) {
    const title = `Tag "${tag}"`;
    const description = `Blog posts tagged "${tag}" on ${ctx.siteConfig.name}.`;

    return renderListingMeta(ctx, `${tagsPath}/${tag}`, title, description);
}
