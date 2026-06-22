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
                return { content: await res.text() };
            },
            annotations: { readOnlyHint: true },
        },
        opts,
    );
})();
