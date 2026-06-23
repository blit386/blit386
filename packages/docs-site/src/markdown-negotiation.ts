import type { ConfigContext, ServerPlugin } from 'fumapress';
import { isMarkdownPreferred } from 'fumadocs-core/negotiation';

// Cloudflare Static Assets binding (declared as `ASSETS` in dist/server/wrangler.json).
// Waku forwards the Worker `env` into the Hono app, so it is reachable via `c.env`.
interface AssetsBinding {
    fetch: (request: Request) => Promise<Response>;
}

// Rough token estimate for the `x-markdown-tokens` header. The spec only asks for
// this header "if available", so an approximation (about four characters per token)
// is acceptable and avoids shipping a tokenizer into the Worker.
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Serve `Accept: text/markdown` content negotiation for documentation pages.
 *
 * When an agent requests a canonical page URL (for example `/docs/getting-started`)
 * with `Accept: text/markdown`, this returns the page as markdown directly
 * (`Content-Type: text/markdown`) instead of HTML. Browsers, which do not send that
 * header, keep getting HTML. The markdown is generated the same way the `llms.txt`
 * plugin builds the `.md` variants, so the output matches the existing `*.md` files.
 *
 * Cloudflare serves pre-rendered static assets before the Worker runs, so this plugin
 * only sees requests when `run_worker_first` is enabled. To preserve normal serving it
 * re-implements assets-first: any request it does not negotiate is forwarded to the
 * `ASSETS` binding, and only asset-less paths (RSC, `/mcp`, `/api/search`, ...) fall
 * through to the remaining middlewares.
 */
export function markdownNegotiationPlugin<C extends ConfigContext = ConfigContext>(): ServerPlugin<C> {
    return {
        name: 'markdown-negotiation',
        createMiddlewares() {
            return [
                async (c, next) => {
                    const { method } = c.req;
                    if (method !== 'GET' && method !== 'HEAD') {
                        return next();
                    }

                    // Negotiate markdown for doc pages; never touch the static `.md` routes.
                    if (isMarkdownPreferred(c.req.raw) && !c.req.path.endsWith('.md')) {
                        const slugs = c.req.path.split('/').filter((segment) => segment.length > 0);
                        const loader = await this.getLoader();
                        const page = loader.getPage(slugs);

                        if (page) {
                            let markdown: string | undefined;
                            for (const adapter of this.adapters) {
                                const text = await adapter['core:get-text']?.call(this, page);
                                if (text !== undefined) {
                                    markdown = `# ${page.data.title} (${page.url})\n\n${text}`;
                                    break;
                                }
                            }

                            if (markdown !== undefined) {
                                return new Response(method === 'HEAD' ? null : markdown, {
                                    headers: {
                                        'content-type': 'text/markdown; charset=utf-8',
                                        'x-markdown-tokens': String(estimateTokens(markdown)),
                                        // This URL serves HTML or markdown depending on Accept,
                                        // so shared caches must key on that header.
                                        vary: 'Accept',
                                    },
                                });
                            }
                        }
                    }

                    // Otherwise emulate assets-first: serve the pre-built static asset.
                    const assets = (c.env as { ASSETS?: AssetsBinding }).ASSETS;
                    if (assets) {
                        const response = await assets.fetch(c.req.raw);
                        if (response.status !== 404) {
                            return response;
                        }
                    }

                    // No static asset (RSC, /mcp, /api/search, dynamic) -> next middleware.
                    return next();
                },
            ];
        },
    };
}
