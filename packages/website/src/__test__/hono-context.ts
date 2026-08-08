/**
 * Hono request/response doubles for the Fumapress `ServerPlugin`s in `src/`.
 *
 * `hono` is not a dependency of this package – it reaches us only as a transitive type through
 * `fumapress`, whose declaration files resolve it from their own pnpm directory. Every Hono type
 * below is therefore recovered structurally from `ServerPlugin['createMiddlewares']` rather than
 * imported. `Context` is a class, so no object literal can ever be structurally assignable to it;
 * the single cast that bridges that is confined to `run()`.
 *
 * The plugins under test touch a small, fixed slice of the context: `c.req.path`, `c.req.method`,
 * `c.req.raw`, `c.req.url`, `c.req.json()`, `c.env`, `c.res.headers`, and `c.json()`.
 */

import type { AppContext, ServerPlugin } from 'fumapress';

type CreateMiddlewares = NonNullable<ServerPlugin['createMiddlewares']>;

/** `{ app: Hono }` – the argument Fumapress hands to `createMiddlewares`. */
type MiddlewareEnv = Parameters<CreateMiddlewares>[0];

/** Hono's `MiddlewareHandler`, recovered without importing `hono`. */
export type PluginMiddleware = NonNullable<Awaited<ReturnType<CreateMiddlewares>>>[number];

/** Hono's `Context`, recovered without importing `hono`. */
type HonoContext = Parameters<PluginMiddleware>[0];

/** The slice of Hono's `Context` the plugins in `src/` actually read or write. */
interface MockContext {
    req: {
        raw: Request;
        url: string;
        method: string;
        path: string;
        json: <T>() => Promise<T>;
    };
    env: Record<string, unknown> | undefined;
    res: Response;
    json: (value: unknown) => Response;
}

export interface MockContextOptions {
    /** Full request URL; `c.req.url`, `c.req.path`, and `c.req.raw` all derive from it. */
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    /** Raw request body. Pass malformed JSON to exercise a real parse failure. */
    body?: string;
    /** Worker bindings surfaced as `c.env`. Omit to model a request with no env at all. */
    env?: Record<string, unknown>;
    /**
     * Response the fake `next()` installs as `c.res`, standing in for a downstream handler.
     * Defaults to an HTML response with mutable headers.
     */
    downstream?: Response;
}

export interface MockContextHarness {
    context: MockContext;
    /** How many times the middleware under test called `next()`. */
    readonly nextCalls: number;
    /** Runs `middleware`; resolves to its Response, or `undefined` when it delegated. */
    run: (middleware: PluginMiddleware) => Promise<Response | undefined>;
}

/** Builds a fake Hono context plus the `next()` that records delegation. */
export function createMockContext(options: MockContextOptions = {}): MockContextHarness {
    const { url = 'https://blit386.dev/', method = 'GET', headers, body, env, downstream } = options;
    const request = new Request(url, { method, headers, body });
    const downstreamResponse =
        downstream ?? new Response('<!doctype html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });

    let nextCalls = 0;

    const context: MockContext = {
        req: {
            raw: request,
            url: request.url,
            method: request.method,
            path: new URL(request.url).pathname,
            json: <T>(): Promise<T> => request.json() as Promise<T>,
        },
        env,
        // Hono starts a request with a placeholder it has not yet finalized; a middleware that
        // mutates `c.res.headers` only ever sees the response `next()` installs.
        res: new Response(null, { status: 404 }),
        json: (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }),
    };

    const next = async (): Promise<void> => {
        nextCalls += 1;
        context.res = downstreamResponse;
    };

    return {
        context,

        get nextCalls() {
            return nextCalls;
        },

        async run(middleware) {
            const result = await middleware(context as unknown as HonoContext, next);
            return result instanceof Response ? result : undefined;
        },
    };
}

/**
 * Fumapress passes `{ app }` into `createMiddlewares`. None of the plugins in `src/` read it and a
 * real `Hono` is not constructible here, so a stub stands in – legal without `unknown`, since
 * `Hono` is assignable to `{}`.
 */
const MIDDLEWARE_ENV = { app: {} } as MiddlewareEnv;

/**
 * Builds the single middleware a plugin contributes, bound to `context` as `this`.
 *
 * Call this once per test where caching matters: `feed.ts` and `mcp-server.ts` both keep their
 * cache in the `createMiddlewares` closure, so a fresh call is a fresh cache.
 */
export async function createPluginMiddleware(plugin: ServerPlugin, context: AppContext): Promise<PluginMiddleware> {
    const factory = plugin.createMiddlewares;
    const name = plugin.name ?? '<unnamed>';

    if (factory === undefined) {
        throw new Error(`plugin "${name}" contributes no middlewares`);
    }

    const middlewares = (await factory.call(context, MIDDLEWARE_ENV)) ?? [];
    const [middleware, ...rest] = middlewares;

    if (middleware === undefined || rest.length > 0) {
        throw new Error(`expected exactly one middleware from "${name}", got ${middlewares.length}`);
    }

    return middleware;
}

/** Cloudflare `ASSETS` binding double that records every forwarded request. */
export interface FakeAssets {
    fetch: (request: Request) => Promise<Response>;
    readonly requests: Request[];
}

export function createFakeAssets(handler: (request: Request) => Response | Promise<Response>): FakeAssets {
    const requests: Request[] = [];

    return {
        requests,

        async fetch(request) {
            requests.push(request);
            return handler(request);
        },
    };
}
