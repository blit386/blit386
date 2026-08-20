(async () => {
    const ctx = document.modelContext ?? navigator?.modelContext;
    if (!ctx) return;

    const controller = new AbortController();
    window.addEventListener('unload', () => controller.abort(), { once: true });
    const opts = { signal: controller.signal };

    await ctx.registerTool(
        {
            name: 'navigate',
            title: 'Navigate to page',
            description: 'Navigate to a page on blit386.dev by site-relative path.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Site-relative path, e.g. /docs/getting-started',
                    },
                },
                required: ['path'],
            },
            execute: async ({ path }) => {
                const invalid = { error: 'Invalid path: must be a site-relative path starting with /' };

                if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
                    return invalid;
                }

                let resolved;
                try {
                    resolved = new URL(path, window.location.origin);
                } catch {
                    return invalid;
                }

                if (resolved.origin !== window.location.origin) {
                    return invalid;
                }

                window.location.assign(resolved);
                return { navigating: true, path };
            },
        },
        opts,
    );

    await ctx.registerTool(
        {
            name: 'search_documentation',
            title: 'Search documentation',
            description:
                'Full-text search across the BLIT386 documentation. Returns matching page titles, URLs, and excerpts.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query, e.g. "palette animation" or "WebGPU renderer"',
                    },
                },
                required: ['query'],
            },
            execute: async ({ query }) => {
                const res = await fetch('/mcp', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'tools/call',
                        params: { name: 'search_docs', arguments: { query } },
                    }),
                });
                if (!res.ok) return { error: `Search request failed: ${res.status}` };

                const body = await res.json();
                if (body.error) return { error: body.error.message };

                return JSON.parse(body.result.content[0].text);
            },
            annotations: { readOnlyHint: true },
        },
        opts,
    );

    await ctx.registerTool(
        {
            name: 'get_documentation_summary',
            title: 'Get documentation summary',
            description:
                'Return the llms.txt summary of the BLIT386 documentation site: available sections, key pages, and links.',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
                const res = await fetch('/llms.txt');
                if (!res.ok) return { error: `Failed to fetch documentation summary: ${res.status}` };
                return { content: await res.text() };
            },
            annotations: { readOnlyHint: true },
        },
        opts,
    );
})();
