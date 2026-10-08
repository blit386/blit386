import type { AppContext, ConfigContext, ServerPlugin } from 'fumapress';

const MCP_PROTOCOL_VERSION = '2025-11-25';
const MCP_SERVER_NAME = 'blit386-docs';
const MCP_SERVER_VERSION = '1.0.0';

// Query terms shorter than this match only whole words, so `ui` finds "UI" but not "uint" (BT-585).
const MIN_PREFIX_LENGTH = 3;
// A word character for startsWord and endsWord. No `g` flag, so `.test()` keeps no state between calls.
const ALPHANUMERIC = /[A-Za-z0-9]/;
// Function words agents put in natural-language queries. They occur as whole words on every page.
const STOPWORDS = new Set(
    (
        'a i an as at be by do if in is it me my no of on or so to up we ' +
        'about all and any are but can could does for from had has have how into its need not should ' +
        'some than that the then there these this those use using want was were what when where which ' +
        'who why will with would you your'
    ).split(' '),
);
// Cap returned hits so the response stays compact for an LLM context window.
const MAX_RESULTS = 10;
// Characters of context to show on each side of the first matched term.
const EXCERPT_RADIUS = 80;
// The production host. get_doc_page accepts absolute URLs on this host as well as on the
// request's own origin, so a link copied from blit386.dev still resolves against a preview
// deployment or a local dev server.
const CANONICAL_ORIGIN = 'https://blit386.dev';

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

// One extracted, search-ready record per documentation page. Building this is the
// expensive part (markdown extraction via the get-text adapter), so it is cached
// per loader instance and reused across requests within the same Worker isolate.
interface CorpusEntry {
    title: string;
    url: string;
    description: string;
    // `${title} ${description}`, scored as one field.
    heading: string;
    // `heading` lowercased, pre-computed for scoring.
    headingLower: string;
    // Original-case body text, used to build excerpts.
    body: string;
    // `body` lowercased, pre-computed for scoring.
    bodyLower: string;
}

// Cloudflare Static Assets binding (declared as `ASSETS` in dist/server/wrangler.json).
// Waku forwards the Worker `env` into the Hono app, so it is reachable via `c.env`.
// Mirrors the same shape used by `markdown-negotiation.ts`.
interface AssetsBinding {
    fetch: (request: Request) => Promise<Response>;
}

const MCP_TOOLS = [
    {
        name: 'search_docs',
        // public/webmcp.js repeats this description for its search_documentation tool; keep the two in step.
        description:
            'Keyword search across the BLIT386 documentation. Returns matching page titles, URLs, and excerpts. Use short keywords, not a sentence: "sprite", "keyboard input", "palette animation".',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'A few keywords, e.g. "palette animation"' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_doc_page',
        description:
            'Return the full markdown of one BLIT386 documentation page. Pass a URL from search_docs or get_docs_summary, or a site path such as "/docs/guides/input".',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Page URL or site path, e.g. "/docs/guides/input"' },
            },
            required: ['url'],
        },
    },
    {
        name: 'get_docs_summary',
        description: 'Return the llms.txt summary of the BLIT386 documentation site.',
        inputSchema: { type: 'object', properties: {} },
    },
] as const;

function isRpcRequest(v: unknown): v is RpcRequest {
    return (
        typeof v === 'object' && v !== null && 'method' in v && typeof (v as { method: unknown }).method === 'string'
    );
}

function isToolCallParams(v: unknown): v is ToolCallParams {
    return typeof v === 'object' && v !== null && 'name' in v && typeof (v as { name: unknown }).name === 'string';
}

// Distinct alphanumeric query terms worth matching: no stopwords.
// A camelCase identifier stays one term, so `drawSprite` finds that API rather than "draw" and "sprite".
function toTerms(query: string): string[] {
    const words = query.toLowerCase().split(/[^a-z0-9]+/);
    return [...new Set(words)].filter((word) => word !== '' && !STOPWORDS.has(word));
}

// Whether `text[index]` begins a word: the start of the text, the first character after a
// non-alphanumeric one, or a camelCase hump (the `S` in `drawSprite`).
function startsWord(text: string, index: number): boolean {
    const before = text.charAt(index - 1);
    return index === 0 || !ALPHANUMERIC.test(before) || (/[a-z0-9]/.test(before) && /[A-Z]/.test(text.charAt(index)));
}

// Whether `text[index]` ends the word before it: the end of the text, a non-alphanumeric
// character, or a camelCase hump (`ui` ends at the `B` in `uiButton`).
function endsWord(text: string, index: number): boolean {
    return !ALPHANUMERIC.test(text.charAt(index)) || startsWord(text, index);
}

// Every index where `term` begins a word in `text`, so `sprite` matches `sprites` and `drawSprite`
// while `put` skips `input`. A term under MIN_PREFIX_LENGTH must also end the word. `lower` is
// `text` lowercased, which keeps the indices aligned. Scoring and excerpts both match through
// this, so an excerpt always shows a hit that was scored.
function wordStarts(text: string, lower: string, term: string): number[] {
    const found: number[] = [];
    const wholeWord = term.length < MIN_PREFIX_LENGTH;
    for (let index = lower.indexOf(term); index !== -1; index = lower.indexOf(term, index + term.length)) {
        if (startsWord(text, index) && (!wholeWord || endsWord(text, index + term.length))) {
            found.push(index);
        }
    }
    return found;
}

// A window of the body around the earliest scored hit, or the start of the body when the
// terms only hit the title or description.
function buildExcerpt(body: string, bodyLower: string, terms: readonly string[]): string {
    const firstHits = terms.flatMap((term) => wordStarts(body, bodyLower, term).slice(0, 1));
    if (firstHits.length === 0) {
        return body.trim().slice(0, EXCERPT_RADIUS * 2);
    }

    const first = Math.min(...firstHits);
    const start = Math.max(0, first - EXCERPT_RADIUS);
    const end = first + EXCERPT_RADIUS;
    // Mark a cut only where it drops text, not where it drops leading or trailing whitespace.
    const prefix = body.slice(0, start).trim() ? '...' : '';
    const suffix = body.slice(end).trim() ? '...' : '';
    return `${prefix}${body.slice(start, end).trim()}${suffix}`;
}

// Reduce a get_doc_page argument to the site path the corpus is keyed by, or undefined when it
// points anywhere but this site. Accepts a bare path or an absolute URL on the request origin or
// the canonical host; drops the query, fragment, a trailing slash, and the `.md` suffix that the
// markdown routes use. This is a lookup key, never a URL to fetch.
function toSitePath(input: string, requestOrigin: string): string | undefined {
    let url: URL;
    try {
        url = new URL(input.trim(), requestOrigin);
    } catch {
        return undefined;
    }

    if (url.origin !== requestOrigin && url.origin !== CANONICAL_ORIGIN) {
        return undefined;
    }

    const path = url.pathname.replace(/\.md$/, '').replace(/\/+$/, '');
    return path === '' ? '/' : path;
}

// Make every site-relative link in llms.txt absolute, so a client with no base URL can fetch it.
// llms.txt is a generated index of links with no code blocks, so a plain substitution is exact.
// Page bodies are not rewritten: parsing markdown here to spare code samples is a CommonMark
// implementation's job, and get_doc_page accepts their site paths as they stand.
function absolutizeLinks(markdown: string, origin: string): string {
    return markdown.replace(/\]\(\//g, `](${origin}/`);
}

// Tells a client how to follow the site-relative links in a page body returned verbatim.
const PAGE_LINK_NOTE = (origin: string): string =>
    `Links starting with "/" are on ${origin} and can be passed to get_doc_page as written.`;

// Longest slice of a caller's get_doc_page argument echoed back in an error message.
const MAX_ECHOED_INPUT = 200;

/**
 * Fumapress ServerPlugin exposing a JSON-RPC 2.0 MCP endpoint at POST /mcp.
 *
 * search_docs scans the loader pages in-process, scoring word-prefix matches against a
 * corpus that is extracted once per loader and cached for the isolate. It deliberately
 * does NOT build a FlexSearch index: in static mode that index ships as a multi-megabyte
 * asset and rebuilding it per cold Worker isolate exceeds the Worker CPU limit (Cloudflare
 * error 1102) - the same reason the site itself moved search client-side (see
 * press.config.tsx). A linear scan of every page stays well within the Worker budget;
 * re-measure the first search on a cold isolate if the corpus grows by an order of magnitude.
 *
 * get_doc_page returns one page's full markdown from the same cached corpus. It is a lookup
 * by site path, not a proxy: anything that does not resolve to a known page is rejected.
 * Pages come back whole, with no cap or truncation: the longest, the changelog, is about
 * 34 KB, well inside any client's context window, and a truncated page would send the agent
 * hunting for the rest. Revisit with a visible truncation notice if a page outgrows that.
 *
 * get_docs_summary returns /llms.txt via the ASSETS binding rather than fetching the
 * public origin: a Worker fetching its own zone hostname times out (Cloudflare 522),
 * and that 522 page was previously being wrapped as a "successful" result.
 *
 * Every URL the server itself hands out (search results, a page's Source line, llms.txt
 * links) is absolute, resolved against the request's own origin rather than pinned to
 * blit386.dev: a preview deployment (next.blit386.dev) or a local dev server then links to its
 * own pages, which are the ones its corpus actually holds. Page bodies are returned verbatim;
 * their site-relative links go straight back into get_doc_page.
 */
export function mcpServerPlugin<C extends ConfigContext = ConfigContext>(): ServerPlugin<C> {
    return {
        name: 'mcp-server',
        createMiddlewares(this: AppContext<C>) {
            // Cache the extracted corpus per loader instance. Markdown extraction
            // never changes for a given loader, so this runs once per isolate; a new
            // loader (for example after a content edit in dev) gets a fresh corpus.
            // The promise is cached so concurrent first requests share one extraction.
            const corpusCache = new WeakMap<object, Promise<CorpusEntry[]>>();

            const getCorpus = async (): Promise<CorpusEntry[]> => {
                const loader = await this.getLoader();
                let corpus = corpusCache.get(loader);
                if (!corpus) {
                    corpus = Promise.all(
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

                            const heading = `${title} ${description}`;
                            return {
                                title,
                                url: page.url,
                                description,
                                heading,
                                headingLower: heading.toLowerCase(),
                                body,
                                bodyLower: body.toLowerCase(),
                            };
                        }),
                    );

                    // Evict on failure, the same way feed.ts does. Caching the promise is what
                    // lets concurrent first requests share one extraction, but it also means a
                    // rejected promise would otherwise stay cached and poison search_docs for
                    // the rest of the isolate's life.
                    corpus.catch(() => {
                        corpusCache.delete(loader);
                    });

                    corpusCache.set(loader, corpus);
                }
                return corpus;
            };

            const searchDocs = async (query: string, origin: string): Promise<SearchResult[]> => {
                const terms = toTerms(query);
                if (terms.length === 0) {
                    return [];
                }

                // Per request, only the cheap word matching and scoring run;
                // the corpus extraction above is amortized across the isolate.
                const corpus = await getCorpus();
                return corpus
                    .map((entry) => {
                        // Ranked in this order, each a tiebreaker for the one before: how many query
                        // terms the page matches at all, how many hit its title or description, then
                        // the body counts. Those are log-damped per term and summed, so a long page
                        // repeating one term cannot outrank one covering every term evenly.
                        let termsMatched = 0;
                        let termsInHeading = 0;
                        let dampedBodyHits = 0;
                        for (const term of terms) {
                            const inHeading = wordStarts(entry.heading, entry.headingLower, term).length;
                            const inBody = wordStarts(entry.body, entry.bodyLower, term).length;
                            termsMatched += inHeading + inBody > 0 ? 1 : 0;
                            termsInHeading += inHeading > 0 ? 1 : 0;
                            dampedBodyHits += Math.log1p(inBody);
                        }
                        return { entry, termsMatched, termsInHeading, dampedBodyHits };
                    })
                    .filter((scored) => scored.termsMatched > 0)
                    .sort(
                        (a, b) =>
                            b.termsMatched - a.termsMatched ||
                            b.termsInHeading - a.termsInHeading ||
                            b.dampedBodyHits - a.dampedBodyHits,
                    )
                    .slice(0, MAX_RESULTS)
                    .map(({ entry }) => ({
                        title: entry.title,
                        url: new URL(entry.url, origin).href,
                        excerpt: buildExcerpt(entry.body, entry.bodyLower, terms),
                    }));
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
                        const origin = new URL(c.req.url).origin;

                        if (name === 'search_docs') {
                            const query = args.query;
                            if (typeof query !== 'string' || query.length === 0) {
                                return c.json({
                                    jsonrpc: '2.0',
                                    id,
                                    error: { code: -32602, message: 'Invalid params' },
                                });
                            }
                            try {
                                const results = await searchDocs(query, origin);
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

                        if (name === 'get_doc_page') {
                            const input = args.url;
                            if (typeof input !== 'string' || input.trim().length === 0) {
                                return c.json({
                                    jsonrpc: '2.0',
                                    id,
                                    error: { code: -32602, message: 'Invalid params' },
                                });
                            }
                            const notFound = () =>
                                c.json({
                                    jsonrpc: '2.0',
                                    id,
                                    error: {
                                        code: -32602,
                                        message: `No BLIT386 documentation page at "${input.length > MAX_ECHOED_INPUT ? `${input.slice(0, MAX_ECHOED_INPUT)}...` : input}". Use search_docs or get_docs_summary to find a page URL.`,
                                    },
                                });
                            // Reject a malformed or foreign URL before touching the corpus, so it
                            // always answers -32602 and never triggers an extraction.
                            const sitePath = toSitePath(input, origin);
                            if (sitePath === undefined) {
                                return notFound();
                            }
                            let corpus: CorpusEntry[];
                            try {
                                corpus = await getCorpus();
                            } catch {
                                return c.json({
                                    jsonrpc: '2.0',
                                    id,
                                    error: { code: -32603, message: 'Internal error: pages unavailable' },
                                });
                            }
                            // A linear scan of ~100 entries per call costs nothing next to the
                            // extraction the corpus cache already amortizes.
                            const entry = corpus.find((page) => page.url === sitePath);
                            if (!entry) {
                                return notFound();
                            }
                            return c.json({
                                jsonrpc: '2.0',
                                id,
                                result: {
                                    content: [
                                        {
                                            type: 'text',
                                            text: `# ${entry.title}\n\nSource: ${new URL(entry.url, origin).href}. ${PAGE_LINK_NOTE(origin)}\n\n${entry.body}`,
                                        },
                                    ],
                                },
                            });
                        }

                        if (name === 'get_docs_summary') {
                            const assets = (c.env as { ASSETS?: AssetsBinding } | undefined)?.ASSETS;
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
                                const res = await assets.fetch(new Request(`${origin}/llms.txt`));
                                if (!res.ok) {
                                    return c.json({
                                        jsonrpc: '2.0',
                                        id,
                                        error: { code: -32603, message: 'Internal error: summary unavailable' },
                                    });
                                }
                                const text = absolutizeLinks(await res.text(), origin);
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
