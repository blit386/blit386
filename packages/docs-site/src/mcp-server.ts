import type { ConfigContext } from 'fumapress';
import type { ServerPlugin } from 'fumapress';

const MCP_PROTOCOL_VERSION = '2025-03-26';
const MCP_SERVER_NAME = 'blit386-docs';
const MCP_SERVER_VERSION = '1.0.0';

interface RpcRequest {
    id: string | number | null | undefined;
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
                        return c.json(
                            { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
                            400,
                        );
                    }

                    if (!isRpcRequest(body)) {
                        return c.json(
                            { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } },
                            400,
                        );
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
                            return c.json(
                                { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params' } },
                                400,
                            );
                        }

                        const { name, arguments: args = {} } = params;
                        const origin = new URL(c.req.url).origin;

                        if (name === 'search_docs') {
                            const queryValue = args.query;
                            const query = typeof queryValue === 'string' ? queryValue : '';
                            const searchUrl = new URL('/api/search', origin);
                            searchUrl.searchParams.set('query', query);
                            const res = await fetch(searchUrl.href);
                            const results: unknown = await res.json();
                            return c.json({
                                jsonrpc: '2.0',
                                id,
                                result: { content: [{ type: 'text', text: JSON.stringify(results) }] },
                            });
                        }

                        if (name === 'get_docs_summary') {
                            const summaryUrl = new URL('/llms.txt', origin);
                            const res = await fetch(summaryUrl.href);
                            const text = await res.text();
                            return c.json({
                                jsonrpc: '2.0',
                                id,
                                result: { content: [{ type: 'text', text }] },
                            });
                        }

                        return c.json(
                            { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } },
                            404,
                        );
                    }

                    return c.json(
                        { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } },
                        404,
                    );
                },
            ];
        },
    };
}
