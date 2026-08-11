import { Fragment } from 'react';
import type { AppContext } from 'fumapress';
import { FEDIVERSE_HANDLE, TWITTER_HANDLE } from '../data/site';

type MetaPage = AppContext['$context']['page'];

/**
 * Reconstructs fumapress's internal `renderPageMeta` (`title`, `og:title`/`og:description`,
 * the site's `meta.page()` block from `press.config.tsx`, and every `ctx.data['core:page-meta']`
 * hook – notably `takumiPlugin`'s `og:image`/`width`/`height`/`twitter:card`). That function
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

/**
 * Same gap as `renderBlogPostMeta` above, but for the `/blog` index: fumapress's own stock
 * `createBlogIndexPage()` never calls `renderPageMeta` either (there is no single `Page` to key it
 * off), so this is not a parity fix so much as filling a real gap – the index shipped with no
 * `<title>` at all. Deliberately excludes `ctx.data['core:page-meta']`: `takumiPlugin` only
 * generates an OG image per content-loader page (`packages/blit386/docs/...`, `content/blog/...`),
 * and the index is a plugin-created route rather than one of those, so calling that hook here
 * would emit an `og:image` pointing at a URL that 404s.
 */
export function renderBlogIndexMeta(ctx: AppContext, indexPath: string, title: string, description: string) {
    const url = ctx.siteConfig.baseUrl ? `${ctx.siteConfig.baseUrl}${indexPath}` : indexPath;
    const twitterTitle = `${ctx.siteConfig.name} – ${title}`;

    // Escape </ so a field value containing "</script>" cannot terminate the tag, mirroring
    // press.config.tsx's meta.page(). \/ is a valid JSON escape, so parsers handle it correctly.
    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: title,
        description,
        url,
    }).replaceAll('</', '<\\/');

    return (
        <>
            <title>{title}</title>
            <meta name="description" content={description} />

            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={url} />
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content={ctx.siteConfig.name} />

            <meta name="twitter:title" content={twitterTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:site" content={TWITTER_HANDLE} />
            <meta name="twitter:creator" content={TWITTER_HANDLE} />

            <meta name="fediverse:creator" content={FEDIVERSE_HANDLE} />

            <link rel="canonical" href={url} />

            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw script content; data is static site copy, not user input */}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        </>
    );
}
