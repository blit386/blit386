(async function () {
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
                        description: 'Site-relative path, e.g. /docs/guide/getting-started',
                    },
                },
                required: ['path'],
            },
            execute: async ({ path }) => {
                if (typeof path !== 'string' || !path.startsWith('/') || /^\/\//i.test(path) || /javascript:/i.test(path)) {
                    return { error: 'Invalid path: must be a site-relative path starting with /' };
                }
                window.location.assign(path);
                return { navigating: true, path };
            },
        },
        opts,
    );

    await ctx.registerTool(
        {
            name: 'search_documentation',
            title: 'Search documentation',
            description: 'Full-text search across the BLIT386 documentation. Returns matching page titles, URLs, and excerpts.',
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
                const res = await fetch('/api/search?query=' + encodeURIComponent(query));
                if (!res.ok) return { error: 'Search request failed: ' + res.status };
                return await res.json();
            },
            annotations: { readOnlyHint: true },
        },
        opts,
    );

    await ctx.registerTool(
        {
            name: 'get_documentation_summary',
            title: 'Get documentation summary',
            description: 'Return the llms.txt summary of the BLIT386 documentation site: available sections, key pages, and links.',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
                const res = await fetch('/llms.txt');
                if (!res.ok) return { error: 'Failed to fetch documentation summary: ' + res.status };
                return { content: await res.text() };
            },
            annotations: { readOnlyHint: true },
        },
        opts,
    );
})();
