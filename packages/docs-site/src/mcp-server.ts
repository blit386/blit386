import type { AppContext, ConfigContext } from 'fumapress';
import type { ServerPlugin } from 'fumapress';

// #region Constants

const MCP_PROTOCOL_VERSION = '2025-11-25';
const MCP_SERVER_NAME = 'blit386-docs';
const MCP_SERVER_VERSION = '1.0.0';

// Matches in the title/description count for more than matches in the body.
const TITLE_WEIGHT = 10;
// Cap returned hits so the response stays compact for an LLM context window.
const MAX_RESULTS = 10;
// Characters of context to show on each side of the first matched term.
const EXCERPT_RADIUS = 80;

// #endregion

// #region Types

interface RpcRequest {
    id?: string | number | null;
    method: string;
    params?: unknown;
}

interface ToolCallParams {
    name: string;
    arguments?: Record<string, unknown>;
}

interface SearchResult {
    title: string;
    url: string;
    excerpt: string;
}

// Cloudflare Static Assets binding (declared as `ASSETS` in dist/server/wrangler.json).
// Waku forwards the Worker `env` into the Hono app, so it is reachable via `c.env`.
// Mirrors the same shape used by `markdown-negotiation.ts`.
interface AssetsBinding {
    fetch: (request: Request) => Promise<Response>;
}

// #endregion

// #region Tool definitions

const MCP_TOOLS = [
    {
        name: 'search_docs',
        description:
            'Full-text search across the BLIT386 documentation. Returns matching page titles, URLs, and excerpts.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query, e.g. "palette animation"' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_docs_summary',
        description: 'Return the llms.txt summary of the BLIT386 documentation site.',
        inputSchema: { type: 'object', properties: {} },
    },
] as const;

// #endregion

// #region Guards and helpers

function isRpcRequest(v: unknown): v is RpcRequest {
    return (
        typeof v === 'object' && v !== null && 'method' in v && typeof (v as { method: unknown }).method === 'string'
    );
}

function isToolCallParams(v: unknown): v is ToolCallParams {
    return typeof v === 'object' && v !== null && 'name' in v && typeof (v as { name: unknown }).name === 'string';
}

function countMatches(haystack: string, needle: string): number {
    if (needle.length === 0) {
        return 0;
    }
    let count = 0;
    let from = haystack.indexOf(needle);
    while (from !== -1) {
        count += 1;
        from = haystack.indexOf(needle, from + needle.length);
    }
    return count;
}

// Build a short excerpt centred on the earliest matched term so results show
// where the query was found rather than just the start of the page.
function buildExcerpt(text: string, terms: readonly string[]): string {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return '';
    }

    const lower = trimmed.toLowerCase();
    let first = -1;
    for (const term of terms) {
        const idx = lower.indexOf(term);
        if (idx !== -1 && (first === -1 || idx < first)) {
            first = idx;
        }
    }

    if (first === -1) {
        return trimmed.slice(0, EXCERPT_RADIUS * 2);
    }

    const start = Math.max(0, first - EXCERPT_RADIUS);
    const end = Math.min(trimmed.length, first + EXCERPT_RADIUS);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < trimmed.length ? '...' : '';
    return `${prefix}${trimmed.slice(start, end).trim()}${suffix}`;
}

// #endregion

/**
 * Fumapress ServerPlugin exposing a JSON-RPC 2.0 MCP endpoint at POST /mcp.
 *
 * search_docs scans the loader pages in-process. It deliberately does NOT build a
 * FlexSearch index: in static mode that index ships as an 8.4 MB asset and rebuilding
 * it per cold Worker isolate exceeds the Worker CPU limit (Cloudflare error 1102) -
 * the same reason the site itself moved search client-side (see press.config.tsx).
 * For ~30 pages a substring scan is well within the Worker budget.
 *
 * get_docs_summary returns /llms.txt via the ASSETS binding rather than fetching the
 * public origin: a Worker fetching its own zone hostname times out (Cloudflare 522),
 * and that 522 page was previously being wrapped as a "successful" result.
 */
export function mcpServerPlugin<C extends ConfigContext = ConfigContext>(): ServerPlugin<C> {
    return {
        name: 'mcp-server',
        createMiddlewares(this: AppContext<C>) {
            const searchDocs = async (query: string): Promise<SearchResult[]> => {
                const terms = query
                    .toLowerCase()
                    .split(/\s+/)
                    .filter((term) => term.length > 0);
                if (terms.length === 0) {
                    return [];
                }

                const loader = await this.getLoader();
                const scored = await Promise.all(
                    loader.getPages().map(async (page) => {
                        const title = page.data.title ?? '';
                        const description = page.data.description ?? '';

                        // Reuse the same runtime markdown extraction the markdown
                        // negotiation plugin relies on, so the body text matches the
                        // pages agents actually receive.
                        let body = '';
                        for (const adapter of this.adapters) {
                            const text = await adapter['core:get-text']?.call(this, page);
                            if (text !== undefined) {
                                body = text;
                                break;
                            }
                        }

                        const heading = `${title} ${description}`.toLowerCase();
                        const bodyLower = body.toLowerCase();
                        let score = 0;
                        for (const term of terms) {
                            score += countMatches(heading, term) * TITLE_WEIGHT;
                            score += countMatches(bodyLower, term);
                        }

                        return {
                            title,
                            url: page.url,
                            excerpt: buildExcerpt(body, terms) || description,
                            score,
                        };
                    }),
                );

                return scored
                    .filter((entry) => entry.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, MAX_RESULTS)
                    .map((entry) => ({ title: entry.title, url: entry.url, excerpt: entry.excerpt }));
            };

            return [
                async (c, next) => {
                    if (c.req.path !== '/mcp' || c.req.method !== 'POST') {
                        return next();
                    }

                    let body: unknown;
                    try {
                        body = await c.req.json<unknown>();
                    } catch {
                        return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
                    }

                    if (!isRpcRequest(body)) {
                        return c.json({
                            jsonrpc: '2.0',
                            id: null,
                            error: { code: -32600, message: 'Invalid Request' },
                        });
                    }

                    const { id, method, params } = body;

                    if (method === 'initialize') {
                        return c.json({
                            jsonrpc: '2.0',
                            id,
                            result: {
                                protocolVersion: MCP_PROTOCOL_VERSION,
                                capabilities: { tools: {} },
                                serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
                            },
                        });
                    }

                    if (method === 'notifications/initialized') {
                        return new Response(null, { status: 204 });
                    }

                    if (method === 'tools/list') {
                        return c.json({ jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } });
                    }

                    if (method === 'tools/call') {
                        if (!isToolCallParams(params)) {
                            return c.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params' } });
                        }

                        const { name, arguments: args = {} } = params;

                        if (name === 'search_docs') {
                            const queryValue = args.query;
                            const query = typeof queryValue === 'string' ? queryValue : '';
                            try {
                                const results = await searchDocs(query);
                                return c.json({
                                    jsonrpc: '2.0',
                                    id,
                                    result: { content: [{ type: 'text', text: JSON.stringify(results) }] },
                                });
                            } catch {
                                return c.json({
                                    jsonrpc: '2.0',
                                    id,
                                    error: { code: -32603, message: 'Internal error: search unavailable' },
                                });
                            }
                        }

                        if (name === 'get_docs_summary') {
                            const assets = (c.env as { ASSETS?: AssetsBinding }).ASSETS;
                            if (!assets) {
                                return c.json({
                                    jsonrpc: '2.0',
                                    id,
                                    error: { code: -32603, message: 'Internal error: summary unavailable' },
                                });
                            }
                            try {
                                // Resolve against the incoming request origin and serve from the
                                // ASSETS binding - never fetch the public hostname from inside the
                                // Worker (self-zone subrequests time out with Cloudflare 522).
                                const assetUrl = new URL('/llms.txt', c.req.url);
                                const res = await assets.fetch(new Request(assetUrl.href));
                                if (!res.ok) {
                                    return c.json({
                                        jsonrpc: '2.0',
                                        id,
                                        error: { code: -32603, message: 'Internal error: summary unavailable' },
                                    });
                                }
                                const text = await res.text();
                                return c.json({
                                    jsonrpc: '2.0',
                                    id,
                                    result: { content: [{ type: 'text', text }] },
                                });
                            } catch {
                                return c.json({
                                    jsonrpc: '2.0',
                                    id,
                                    error: { code: -32603, message: 'Internal error: summary unavailable' },
                                });
                            }
                        }

                        return c.json({
                            jsonrpc: '2.0',
                            id,
                            error: { code: -32601, message: `Unknown tool: ${name}` },
                        });
                    }

                    return c.json({
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Method not found: ${method}` },
                    });
                },
            ];
        },
    };
}
