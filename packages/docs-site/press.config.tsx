import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import type { Page, PageData } from 'fumadocs-core/source';
import { defineConfig } from 'fumapress';
import type { ConfigContext } from 'fumapress';
import { fumadocsMdx } from 'fumapress/adapters/mdx';
import { flexsearchPlugin } from 'fumapress/plugins/flexsearch';
import { linkValidationPlugin } from 'fumapress/plugins/link-validation';
import { llmsPlugin } from 'fumapress/plugins/llms.txt';
import { sitemapPlugin } from 'fumapress/plugins/sitemap';
import { blogPlugin } from 'fumapress/plugins/blog';
import { takumiPlugin } from 'fumapress/plugins/takumi';
import { createRootLayout } from 'fumapress/layouts/root';
import { createDocsLayoutPage } from 'fumapress/layouts/docs';
import { EditOnGitHub } from 'fumadocs-ui/layouts/docs/page';
import { feedPlugin } from './src/feed';
import { markdownNegotiationPlugin } from './src/markdown-negotiation';
import { mcpServerPlugin } from './src/mcp-server';
import { AuthorByline } from './src/components/author-byline';
import { BlogIndexPage } from './src/components/blog-index';
import { BlogLayout } from './src/components/blog-layout';
import { BlogPage } from './src/components/blog-page';
import { BlogTagPage, BlogTagsPage } from './src/components/blog-tags-page';
import { SidebarSocials } from './src/components/sidebar-socials';
import { SidebarLogo } from './src/components/sidebar-logo';
import { CommunityConnect } from './src/components/community-connect';
import { DemoEmbed } from './src/components/demo-embed';
import { DemoShowcase } from './src/components/demo-showcase';
import { HomeHero } from './src/components/home-hero';
import { ApiAvailability } from './src/components/api-availability';
import { PageChangelog } from './src/components/page-changelog';
import { Since } from './src/components/since-badge';
import { SITE_NAME } from './src/data/site';
import defaultMdxComponents, { createRelativeLink } from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Popup, PopupContent, PopupTrigger } from 'fumadocs-twoslash/ui';
import { blog, docs } from './.source/server';

const SITE_BASE_URL = 'https://blit386.dev';

// Reads and caches the Departure Mono font file used for Open Graph image generation
// (`takumiPlugin` below), so disk access happens once per Worker isolate rather than per request.
const getDepartureMono = (() => {
    let cache: Buffer | undefined;
    return () => (cache ??= readFileSync(join(process.cwd(), 'public/fonts/DepartureMono-Regular.otf')));
})();

// Reads and caches the Open Graph logo as a base64 data URL, for the same reason as
// `getDepartureMono` above - Takumi needs it inline, not as a file path.
const getOgLogoDataUrl = (() => {
    let cache: string | undefined;
    return () => {
        if (!cache) {
            const data = readFileSync(join(process.cwd(), 'public/logo/og.png'));
            cache = `data:image/png;base64,${data.toString('base64')}`;
        }
        return cache;
    };
})();

const rootLayout = createRootLayout({
    providerProps: {
        theme: { defaultTheme: 'system' },
    },
});

/**
 * Page-data shape carried by the `docs` collection's schema `.extend()` in `source.config.ts`:
 * `lastModified` and `editUrl` are injected into every synced page's frontmatter by
 * `scripts/sync-docs-from-engine.mjs`. `createDocsLayoutPage` is generic over `ConfigContext`
 * but defaults to a bare `PageData`, so this narrows `page.data` for the `render()` callback
 * below without threading the full multi-source (`docs` + `blog`) content type through it.
 */
interface DocsPageData extends PageData {
    lastModified?: Date;
    editUrl?: string;
}

interface DocsLayoutContext extends ConfigContext {
    page: Page<string | undefined, DocsPageData>;
}

const docsPageLayout = createDocsLayoutPage<DocsLayoutContext>({
    /**
     * Renders the doc body ourselves (instead of leaving it to the default `render-body`
     * fallback) so an "Edit on GitHub" link can be appended after it.
     *
     * `getGitHubFileUrl` (the framework's built-in edit-link resolver) is intentionally not
     * used: it needs `siteConfig.git`, which is unset here, and even if set it would compute a
     * URL into this repo's generated MDX rather than the true source in the sibling `blit386`
     * engine repo. `editUrl` is injected into each page's frontmatter by `sync-docs-from-engine.mjs`
     * instead (see `CLAUDE.md`, Documentation mirror), so it is read directly from `page.data`.
     */
    async render(page) {
        let body: ReactNode;

        for (const adapter of this.adapters) {
            const rendered = await adapter['core:render-body']?.call(this, page);

            if (rendered !== undefined) {
                body = rendered;
                break;
            }
        }

        if (body === undefined) {
            throw new Error('[press.config] docsPageLayout: no adapter could render this page body');
        }

        const editUrl = page.data.editUrl;

        return {
            // The framework's own `getLastModifiedDate()` resolves this via each adapter's
            // `core:get-modified-date` hook, but for `async: true` doc collections (this site's
            // `docs` source) that hook awaits `page.data.load()` - which resolves the compiled
            // body/toc, not the frontmatter - so `lastModified` is never found there. Frontmatter
            // fields (including `lastModified`) are already flattened onto `page.data` directly,
            // so it is read from there instead of relying on the built-in resolution.
            lastModified: page.data.lastModified,
            layoutProps: {
                nav: { title: <SidebarLogo /> },
                sidebar: {
                    collapsible: false,
                    footer: <SidebarSocials />,
                },
            },
            body: (
                <>
                    {body}
                    {editUrl && <EditOnGitHub href={editUrl} />}
                </>
            ),
        };
    },
});

/**
 * Global head.
 *
 * Font preloads, analytics, and feed link injected into every page's <head>.
 */
const GLOBAL_HEAD = (
    <>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

        <link rel="preconnect" href="https://fonts.vancura.dev" crossOrigin="" />
        <link rel="dns-prefetch" href="https://fonts.vancura.dev" />
        <link
            rel="preload"
            href="https://fonts.vancura.dev/PragmataPro-R.woff2"
            as="font"
            type="font/woff2"
            crossOrigin=""
        />
        <link
            rel="preload"
            href="https://fonts.vancura.dev/DegularText-Regular.woff2"
            as="font"
            type="font/woff2"
            crossOrigin=""
        />
        <link
            rel="preload"
            href="https://fonts.vancura.dev/DegularText-Semibold.woff2"
            as="font"
            type="font/woff2"
            crossOrigin=""
        />

        <link rel="preload" href="/fonts/DepartureMono-Regular.woff2" as="font" type="font/woff2" crossOrigin="" />

        <script async={true} src="https://plausible.io/js/pa-T01y19zS6cj7d9y8uQnqw.js" />
        <script>
            {
                'window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()'
            }
        </script>

        <script defer={true} src="/webmcp.js" />
        <link rel="alternate" type="application/rss+xml" title="BLIT386 Blog" href="/feed.xml" />
    </>
);

/**
 * Builds the Open Graph image content rendered by `takumiPlugin` below.
 *
 * Takumi renders this tree through a Satori-like layout engine, not a browser, so only inline
 * styles work here - Tailwind classes and `src/app.css` do not apply.
 */
function buildOgNode(title: string | undefined, description: string | undefined) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '60px 72px',
                width: '100%',
                height: '100%',
                background: '#c2c3c7',
                fontFamily: 'DepartureMono',
            }}
        >
            <img
                src={getOgLogoDataUrl()}
                width={180}
                height={156}
                style={{ display: 'flex', marginTop: '10px' }}
                alt="BLIT386 Logo"
            />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                    style={{
                        fontSize: 64,
                        color: '#000000',
                        lineHeight: 1.1,
                        marginBottom: 24,
                        textWrap: 'balance',
                    }}
                >
                    {title ?? 'BLIT386'}
                </div>

                {description && (
                    <div
                        style={{
                            fontSize: 22,
                            color: '#555',
                            lineHeight: 1.4,
                            textWrap: 'balance',
                            marginLeft: '-2px',
                        }}
                    >
                        {description}
                    </div>
                )}
            </div>
        </div>
    );
}

// Top-level Fumapress config: content sources, build mode, and SEO meta here; plugins,
// MDX adapters, and layouts are chained on below via `.plugins()`, `.adapters()`, `.layouts()`.
export default defineConfig({
    content: {
        docs: docs.toFumadocsSource(),
        blog: blog.toFumadocsSource({ baseDir: 'blog' }),
    },

    /**
     * Build a fully static site. On Cloudflare Workers the dynamic FlexSearch
     * endpoint rebuilt the entire index per cold isolate, exceeding the Worker
     * resource limits (error 1102) and intermittently 503-ing /api/search - so
     * search only ever worked on localhost. In static mode the index is built
     * at build time, shipped as a static asset, and queried client-side.
     */
    mode: 'static',

    site: {
        name: SITE_NAME,
        baseUrl: SITE_BASE_URL,
    },

    meta: {
        root: () => GLOBAL_HEAD,

        page(page) {
            const title = page.data.title;
            const description = page.data.description ?? '';
            const url = `${SITE_BASE_URL}${page.url}`;
            const ogType = page.url === '/' ? 'website' : 'article';
            const prefixedTitle = ogType === 'website' ? title : `${SITE_NAME} - ${title}`;

            // Escape </ so a field value containing "</script>" cannot terminate the tag.
            // `\/` is a valid JSON escape, so parsers handle the output correctly.
            const jsonLd = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': ogType === 'website' ? 'WebSite' : 'TechArticle',
                name: ogType === 'website' ? SITE_NAME : undefined,
                headline: ogType === 'website' ? undefined : prefixedTitle,
                ...(description && { description }),
                url,
                ...(ogType === 'article' && {
                    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_BASE_URL },
                }),
            }).replaceAll('</', '<\\/');

            return (
                <>
                    {/* og:title and og:description are generated by the framework from page.data;
                        og:title is prefixed post-build by scripts/patch-html-title.mjs */}
                    {description && <meta name="description" content={description} />}

                    <meta property="og:url" content={url} />
                    <meta property="og:type" content={ogType} />
                    <meta property="og:site_name" content={SITE_NAME} />

                    <meta name="twitter:title" content={prefixedTitle} />
                    {description && <meta name="twitter:description" content={description} />}

                    <link rel="canonical" href={url} />

                    {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw script content; data is constructed from trusted CMS fields */}
                    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
                </>
            );
        },
    },
})
    // markdownNegotiationPlugin runs before llmsPlugin so canonical doc URLs return a
    // direct `text/markdown` 200 (with x-markdown-tokens); autoRedirect is disabled to
    // avoid the llms middleware issuing a 302 to the `.md` file instead.

    .plugins(
        flexsearchPlugin(),

        blogPlugin({
            paths: { tags: '/blog/tags' },
            layouts: {
                layout: BlogLayout,
                index: BlogIndexPage,
                page: BlogPage,
                tags: BlogTagsPage,
                tag: BlogTagPage,
            },
        }),

        markdownNegotiationPlugin(),

        llmsPlugin({ autoRedirect: false }),

        sitemapPlugin({
            getEntry(page) {
                const url = page.url;
                let priority = 0.7;
                let changefreq: 'weekly' | 'monthly' = 'monthly';

                if (url === '/') {
                    priority = 1.0;
                    changefreq = 'weekly';
                } else if (url === '/docs/getting-started') {
                    priority = 0.9;
                } else if (url.startsWith('/docs') && !url.includes('/api/')) {
                    priority = 0.8;
                } else if (url.startsWith('/community')) {
                    priority = 0.6;
                    changefreq = 'monthly';
                } else if (url.startsWith('/blog')) {
                    priority = 0.7;
                    changefreq = 'monthly';
                }

                return { loc: `${SITE_BASE_URL}${url}`, priority, changefreq };
            },
        }),

        mcpServerPlugin(),

        feedPlugin(),

        takumiPlugin({
            generate(page) {
                return {
                    options: {
                        fonts: [{ name: 'DepartureMono', data: getDepartureMono() }],
                    },
                    node: buildOgNode(page.data.title, page.data.description),
                };
            },
        }),

        linkValidationPlugin(),
    )

    .adapters(
        /**
         * Extend the default MDX component map so the engine docs can use the full
         * Fumadocs component set (Steps, Tabs, Accordions, Files, TypeTable,
         * InlineTOC). Callout, Card/Cards, and code blocks already ship
         * in `defaultMdxComponents`. The relative-link override mirrors the adapter
         * default so in-page links keep resolving.
         */
        fumadocsMdx({
            async getMdxComponents(page) {
                return {
                    ...defaultMdxComponents,
                    a: createRelativeLink(await this.getLoader(), page),
                    Accordion,
                    Accordions,
                    File,
                    Files,
                    Folder,
                    InlineTOC,
                    Step,
                    Steps,
                    Tab,
                    Tabs,
                    TypeTable,
                    Popup,
                    PopupContent,
                    PopupTrigger,
                    AuthorByline,
                    CommunityConnect,
                    DemoEmbed,
                    DemoShowcase,
                    HomeHero,
                    ApiAvailability,
                    PageChangelog,
                    Since,
                };
            },
        }),
    )

    .layouts({
        root({ lang, children }) {
            return rootLayout({ lang, children });
        },

        defaultProps() {
            return {
                themeSwitch: { enabled: false },
                sidebar: { collapsible: false },
            };
        },

        page: async ({ lang, slugs, page }) => {
            return docsPageLayout({ lang, slugs, page });
        },
    });
