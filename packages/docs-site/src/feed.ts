import type { AppContext, ConfigContext } from 'fumapress';
import type { ServerPlugin } from 'fumapress';

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
 * by blogPlugin). Dates are retrieved via the core:get-creation-date adapter, which reads
 * the `date` frontmatter field from blog MDX files. Items are sorted newest-first.
 *
 * The built feed is cached per loader instance (same WeakMap pattern as mcp-server.ts),
 * so it is generated once per Worker isolate and reused across requests.
 */
export function feedPlugin<C extends ConfigContext = ConfigContext>(): ServerPlugin<C> {
    return {
        name: 'feed',
        createMiddlewares(this: AppContext<C>) {
            const feedCache = new WeakMap<object, Promise<string>>();

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

                    const items = await Promise.all(
                        blogPages.map(async (page) => {
                            let date: Date | undefined;

                            for (const adapter of this.adapters) {
                                const d = await adapter['core:get-creation-date']?.call(this, page);

                                if (d instanceof Date) {
                                    date = d;
                                    break;
                                }
                            }

                            return {
                                title: page.data.title ?? '',
                                description: page.data.description ?? '',
                                link: `${baseUrl}${page.url}`,
                                date: date ?? new Date(0),
                            };
                        }),
                    );

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
