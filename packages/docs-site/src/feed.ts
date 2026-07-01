import type { AppContext, ConfigContext, ServerPlugin } from 'fumapress';
import { getPostDate } from './blog-post-date';

const FEED_URL = '/feed.xml';
const CHANNEL_TITLE = 'BLIT386 Blog';
const CHANNEL_DESCRIPTION = 'Updates and articles from the BLIT386 blog.';

function escapeXml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// RFC-822 date: "Wed, 25 Jun 2026 00:00:00 +0000"
// Date.toUTCString() returns "Wed, 25 Jun 2026 00:00:00 GMT"; replace the timezone token.
function toRfc822(date: Date): string {
    return date.toUTCString().replace('GMT', '+0000');
}

/**
 * Fumapress ServerPlugin serving an RSS 2.0 feed at GET /feed.xml.
 *
 * Blog pages are identified by page.type === 'blog' (the default isBlog predicate used
 * by blogPlugin). Dates come from the `date` frontmatter field via `getPostDate`. Items are
 * sorted newest-first.
 *
 * The built feed is cached per loader instance (same WeakMap pattern as mcp-server.ts),
 * so it is generated once per Worker isolate and reused across requests.
 */
export function feedPlugin<C extends ConfigContext = ConfigContext>(): ServerPlugin<C> {
    return {
        name: 'feed',
        createMiddlewares(this: AppContext<C>) {
            const feedCache = new WeakMap<object, Promise<string>>();

            /**
             * Generates an RSS feed in XML format.
             *
             * This asynchronous function constructs an RSS feed based on the blog pages
             * retrieved from the loader. If a cached version exists for the loader, it is
             * returned instead of generating a new feed. The RSS feed includes metadata about
             * the channel and individual blog items formatted in the RSS 2.0 specification.
             *
             * The generated feed includes the following for each blog post:
             * - Title
             * - Description
             * - Link to the post
             * - Publication date formatted in RFC 822
             *
             * The generated feed is cached to optimize performance and avoid redundant computations.
             * If any error occurs during the generation process, the cache is invalidated for the
             * current loader.
             *
             * @returns {Promise<string>} A promise that resolves to the generated RSS feed as a string in XML format.
             */
            const buildFeed = async (): Promise<string> => {
                const loader = await this.getLoader();
                const cached = feedCache.get(loader);

                if (cached) {
                    return cached;
                }

                const promise = (async (): Promise<string> => {
                    const baseUrl = this.siteConfig.baseUrl ?? 'https://blit386.dev';
                    const feedLink = `${baseUrl}${FEED_URL}`;
                    const channelLink = `${baseUrl}/blog`;

                    const blogPages = loader.getPages().filter((page) => page.type === 'blog');

                    const items = blogPages.map((page) => {
                        const date = getPostDate(page);

                        if (!date) {
                            console.warn(
                                `feed: missing or invalid date for blog post "${page.data.title}" (${page.url})`,
                            );
                        }

                        return {
                            title: page.data.title ?? '',
                            description: page.data.description ?? '',
                            link: `${baseUrl}${page.url}`,
                            date: date ?? new Date(0),
                        };
                    });

                    items.sort((a, b) => b.date.getTime() - a.date.getTime());

                    const itemsXml = items
                        .map(({ title, description, link, date }) => {
                            const pubDate = toRfc822(date);
                            return [
                                '    <item>',
                                `      <title>${escapeXml(title)}</title>`,
                                `      <link>${escapeXml(link)}</link>`,
                                `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
                                `      <pubDate>${pubDate}</pubDate>`,
                                ...(description ? [`      <description>${escapeXml(description)}</description>`] : []),
                                '    </item>',
                            ].join('\n');
                        })
                        .join('\n');

                    return [
                        '<?xml version="1.0" encoding="UTF-8"?>',
                        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
                        '  <channel>',
                        `    <title>${escapeXml(CHANNEL_TITLE)}</title>`,
                        `    <link>${escapeXml(channelLink)}</link>`,
                        `    <description>${escapeXml(CHANNEL_DESCRIPTION)}</description>`,
                        `    <atom:link href="${escapeXml(feedLink)}" rel="self" type="application/rss+xml"/>`,
                        itemsXml,
                        '  </channel>',
                        '</rss>',
                    ].join('\n');
                })();

                promise.catch(() => {
                    feedCache.delete(loader);
                });

                feedCache.set(loader, promise);

                return promise;
            };

            return [
                async (c, next) => {
                    if (c.req.path !== FEED_URL || (c.req.method !== 'GET' && c.req.method !== 'HEAD')) {
                        return next();
                    }

                    const xml = await buildFeed();

                    return new Response(c.req.method === 'HEAD' ? null : xml, {
                        headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
                    });
                },
            ];
        },
    };
}
