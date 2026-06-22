import type { ConfigContext } from 'fumapress';
import type { ServerPlugin } from 'fumapress';

const MCP_PROTOCOL_VERSION = '2025-11-25';
const MCP_SERVER_NAME = 'blit386-docs';
const MCP_SERVER_VERSION = '1.0.0';
const SITE_ORIGIN = process.env.SITE_ORIGIN ?? 'https://blit386.dev';

interface RpcRequest {
    id?: string | number | null;
    method: string;
    params?: unknown;
}

interface ToolCallParams {
    name: string;
    arguments?: Record<string, unknown>;
}

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

function isRpcRequest(v: unknown): v is RpcRequest {
    return (
        typeof v === 'object' && v !== null && 'method' in v && typeof (v as { method: unknown }).method === 'string'
    );
}

function isToolCallParams(v: unknown): v is ToolCallParams {
    return typeof v === 'object' && v !== null && 'name' in v && typeof (v as { name: unknown }).name === 'string';
}

export function mcpServerPlugin<C extends ConfigContext = ConfigContext>(): ServerPlugin<C> {
    return {
        name: 'mcp-server',
        createMiddlewares() {
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
                            const searchUrl = new URL('/api/search', SITE_ORIGIN);
                            searchUrl.searchParams.set('query', query);
                            try {
                                const res = await fetch(searchUrl.href);
                                const results: unknown = await res.json();
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
                            const summaryUrl = new URL('/llms.txt', SITE_ORIGIN);
                            try {
                                const res = await fetch(summaryUrl.href);
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
