/**
 * Covers the WebMCP bridge script served at `/webmcp.js`.
 *
 * It is a browser-side IIFE with no exports and is deliberately outside `tsconfig.json`'s
 * `include` – it targets `document.modelContext` / `navigator.modelContext`, an experimental
 * WebMCP API with no `lib.dom.d.ts` types, and typechecking it would mean either widening the
 * ambient globals or sprinkling `any`. Statically or dynamically `import`-ing it from a test would
 * pull it back into the TypeScript program (and TS refuses anyway – a script with no
 * `import`/`export` statements of its own is not a module); `press.config.tsx` also loads it as a
 * plain `<script defer src="/webmcp.js">`, not `type="module"`, so an ESM import would not even
 * match how the browser runs it. Each test instead reads the file as text once (`WEBMCP_SOURCE`,
 * from a hardcoded relative path to this repo's own file – never interpolated with external
 * input) and runs it with `vm.runInThisContext`, Node's primitive for evaluating trusted source
 * against the current global scope, so it sees that test's stubbed `document` / `navigator` /
 * `window` / `fetch` exactly as a real `<script>` load would.
 *
 * The `navigate` tool's origin check is the one regression guard worth calling out. Checking
 * `path.startsWith('//')` alone does not stop every protocol-relative bypass: the URL spec's
 * parser treats a backslash the same as a forward slash for the `https:` scheme, so
 * `new URL('/\\evil.com', 'https://blit386.dev')` resolves to `https://evil.com` even though the
 * string never contains `//`. The `resolved.origin !== window.location.origin` check after
 * resolution is what actually blocks it – the "backslash bypass" case below exercises that string
 * to prove the origin check, not the prefix check, is carrying the guarantee.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ToolCallOptions = { signal: AbortSignal };

interface ToolDefinition {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute: (args?: Record<string, unknown>) => Promise<unknown>;
    annotations?: { readOnlyHint?: boolean };
}

interface FetchResponse {
    ok: boolean;
    status: number;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
}

const WEBMCP_PATH = fileURLToPath(new URL('../public/webmcp.js', import.meta.url));
const WEBMCP_SOURCE = readFileSync(WEBMCP_PATH, 'utf8');

function expectDefined<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new Error(message);
    return value;
}

function createRegisterToolMock() {
    return vi.fn(async (_tool: ToolDefinition, _opts: ToolCallOptions) => {});
}

function createAddEventListenerMock() {
    return vi.fn((_type: string, _listener: () => void, _options?: { once?: boolean }) => {});
}

function createAssignMock() {
    return vi.fn((_url: URL) => {});
}

function createFetchMock() {
    return vi.fn(async (_input: string, _init?: RequestInit): Promise<FetchResponse> => ({ ok: true, status: 200 }));
}

function stubBrowserGlobals(
    options: {
        modelContext?: { registerTool: ReturnType<typeof createRegisterToolMock> };
        navigatorModelContext?: { registerTool: ReturnType<typeof createRegisterToolMock> };
    } = {},
) {
    const addEventListener = createAddEventListenerMock();
    const assign = createAssignMock();
    const location = { origin: 'https://blit386.dev', assign };
    const fetchMock = createFetchMock();

    vi.stubGlobal('document', { modelContext: options.modelContext });
    vi.stubGlobal('navigator', { modelContext: options.navigatorModelContext });
    vi.stubGlobal('window', { addEventListener, location });
    vi.stubGlobal('fetch', fetchMock);

    return { addEventListener, assign, location, fetchMock };
}

function loadWebmcp(): void {
    // The `filename` here is what lets @vitest/coverage-v8 attribute execution back to the real
    // source file – without it, V8 reports coverage against an anonymous "evalmachine" script and
    // `public/webmcp.js` shows 0% despite every test exercising it.
    runInThisContext(WEBMCP_SOURCE, { filename: WEBMCP_PATH });
}

async function registerAndGetTools(registerTool: ReturnType<typeof createRegisterToolMock>): Promise<ToolDefinition[]> {
    loadWebmcp();
    await vi.waitFor(() => expect(registerTool).toHaveBeenCalledTimes(3));
    return registerTool.mock.calls.map(([tool]) => tool);
}

function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
    return expectDefined(
        tools.find((candidate) => candidate.name === name),
        `${name} tool was not registered`,
    );
}

describe('webmcp.js', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('bootstrapping', () => {
        it('does nothing when neither document nor navigator expose modelContext', () => {
            const { addEventListener } = stubBrowserGlobals();

            loadWebmcp();

            expect(addEventListener).not.toHaveBeenCalled();
        });

        it('prefers document.modelContext over navigator.modelContext', async () => {
            const documentRegisterTool = createRegisterToolMock();
            const navigatorRegisterTool = createRegisterToolMock();
            stubBrowserGlobals({
                modelContext: { registerTool: documentRegisterTool },
                navigatorModelContext: { registerTool: navigatorRegisterTool },
            });

            loadWebmcp();
            await vi.waitFor(() => expect(documentRegisterTool).toHaveBeenCalledTimes(3));

            expect(navigatorRegisterTool).not.toHaveBeenCalled();
        });

        it('falls back to navigator.modelContext when document has none', async () => {
            const navigatorRegisterTool = createRegisterToolMock();
            stubBrowserGlobals({ navigatorModelContext: { registerTool: navigatorRegisterTool } });

            loadWebmcp();

            await vi.waitFor(() => expect(navigatorRegisterTool).toHaveBeenCalledTimes(3));
        });

        it('registers all three tools under one AbortSignal, and aborts it on unload', async () => {
            const registerTool = createRegisterToolMock();
            const { addEventListener } = stubBrowserGlobals({ modelContext: { registerTool } });

            loadWebmcp();
            await vi.waitFor(() => expect(registerTool).toHaveBeenCalledTimes(3));

            const names = registerTool.mock.calls.map(([tool]) => tool.name);
            expect(names).toEqual(['navigate', 'search_documentation', 'get_documentation_summary']);

            const signals = registerTool.mock.calls.map(([, opts]) => opts.signal);
            expect(new Set(signals).size).toBe(1);
            const [firstSignal] = signals;
            const signal = expectDefined(firstSignal, 'expected at least one registerTool call');
            expect(signal.aborted).toBe(false);

            expect(addEventListener).toHaveBeenCalledWith('unload', expect.any(Function), { once: true });
            const firstCall = expectDefined(
                addEventListener.mock.calls[0],
                'expected addEventListener to have been called',
            );
            const [, onUnload] = firstCall;
            onUnload();

            expect(signal.aborted).toBe(true);
        });
    });

    describe('navigate', () => {
        let assign: ReturnType<typeof createAssignMock>;
        let tools: ToolDefinition[];

        beforeEach(async () => {
            const registerTool = createRegisterToolMock();
            const stubs = stubBrowserGlobals({ modelContext: { registerTool } });
            assign = stubs.assign;
            tools = await registerAndGetTools(registerTool);
        });

        it('resolves a site-relative path and navigates to it', async () => {
            const result = await findTool(tools, 'navigate').execute({ path: '/docs/getting-started' });

            expect(result).toEqual({ navigating: true, path: '/docs/getting-started' });
            expect(assign).toHaveBeenCalledTimes(1);
            const firstCall = expectDefined(
                assign.mock.calls[0],
                'expected window.location.assign to have been called',
            );
            const [resolvedUrl] = firstCall;
            expect(String(resolvedUrl)).toBe('https://blit386.dev/docs/getting-started');
        });

        it.each<[string, unknown]>([
            ['a non-string path', 42],
            ['a path with no leading slash', 'docs/getting-started'],
            ['a literal protocol-relative path', '//evil.com'],
            ['a backslash bypass of the // check', '/\\evil.com'],
        ])('rejects %s without navigating', async (_label, path) => {
            const result = await findTool(tools, 'navigate').execute({ path });

            expect(result).toEqual({ error: 'Invalid path: must be a site-relative path starting with /' });
            expect(assign).not.toHaveBeenCalled();
        });

        it('rejects a path the URL constructor cannot parse', async () => {
            class ThrowingUrl {
                constructor() {
                    throw new TypeError('invalid URL');
                }
            }
            vi.stubGlobal('URL', ThrowingUrl);

            const result = await findTool(tools, 'navigate').execute({ path: '/anything' });

            expect(result).toEqual({ error: 'Invalid path: must be a site-relative path starting with /' });
            expect(assign).not.toHaveBeenCalled();
        });
    });

    describe('search_documentation', () => {
        let fetchMock: ReturnType<typeof createFetchMock>;
        let tools: ToolDefinition[];

        beforeEach(async () => {
            const registerTool = createRegisterToolMock();
            const stubs = stubBrowserGlobals({ modelContext: { registerTool } });
            fetchMock = stubs.fetchMock;
            tools = await registerAndGetTools(registerTool);
        });

        it('is read-only', () => {
            expect(findTool(tools, 'search_documentation').annotations?.readOnlyHint).toBe(true);
        });

        it('calls the /mcp search_docs tool and returns the parsed results', async () => {
            const results = [{ title: 'Palette', url: '/docs/api/palette', excerpt: '...' }];
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: { content: [{ type: 'text', text: JSON.stringify(results) }] },
                }),
            });

            const result = await findTool(tools, 'search_documentation').execute({ query: 'palette & animation' });

            expect(fetchMock).toHaveBeenCalledWith('/mcp', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: { name: 'search_docs', arguments: { query: 'palette & animation' } },
                }),
            });
            expect(result).toEqual(results);
        });

        it('reports the status without parsing the body when the request fails', async () => {
            const json = vi.fn();
            fetchMock.mockResolvedValue({ ok: false, status: 500, json });

            const result = await findTool(tools, 'search_documentation').execute({ query: 'anything' });

            expect(result).toEqual({ error: 'Search request failed: 500' });
            expect(json).not.toHaveBeenCalled();
        });

        it('reports the JSON-RPC error message when the tool call fails', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    error: { code: -32602, message: 'Invalid params' },
                }),
            });

            const result = await findTool(tools, 'search_documentation').execute({ query: 'anything' });

            expect(result).toEqual({ error: 'Invalid params' });
        });
    });

    describe('get_documentation_summary', () => {
        let fetchMock: ReturnType<typeof createFetchMock>;
        let tools: ToolDefinition[];

        beforeEach(async () => {
            const registerTool = createRegisterToolMock();
            const stubs = stubBrowserGlobals({ modelContext: { registerTool } });
            fetchMock = stubs.fetchMock;
            tools = await registerAndGetTools(registerTool);
        });

        it('is read-only', () => {
            expect(findTool(tools, 'get_documentation_summary').annotations?.readOnlyHint).toBe(true);
        });

        it('fetches /llms.txt and wraps the body as content', async () => {
            fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '# BLIT386 docs' });

            const result = await findTool(tools, 'get_documentation_summary').execute();

            expect(fetchMock).toHaveBeenCalledWith('/llms.txt');
            expect(result).toEqual({ content: '# BLIT386 docs' });
        });

        it('reports the status when the fetch fails', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 404 });

            const result = await findTool(tools, 'get_documentation_summary').execute();

            expect(result).toEqual({ error: 'Failed to fetch documentation summary: 404' });
        });
    });
});
