/**
 * Fumapress `AppContext` doubles for the `ServerPlugin`s in `src/`.
 *
 * The plugins reach for exactly three things on `this`: `getLoader()`, `adapters`, and
 * `siteConfig.baseUrl`. Everything they touch is type-checked by the `satisfies` clause in
 * `createMockAppContext`; the single cast there covers only the two members that cannot be
 * constructed honestly.
 */

import type { Adapter, AppContext, Layouts } from 'fumapress';
import type { Page, PageData } from 'fumadocs-core/source';

/** The two loader methods the plugins in `src/` call. */
export interface FakeLoader {
    getPage: (slugs: string[] | undefined) => Page | undefined;
    getPages: () => Page[];
}

export interface FakeLoaderCalls {
    /** Slug arrays handed to `getPage`, in call order. */
    getPage: string[][];
    /** How many times `getPages` ran – the feed and MCP corpus caches must hold this at 1. */
    getPages: number;
}

export function createFakeLoader(pages: Page[]): { loader: FakeLoader; calls: FakeLoaderCalls } {
    const calls: FakeLoaderCalls = { getPage: [], getPages: 0 };

    const loader: FakeLoader = {
        getPage(slugs) {
            const requested = slugs ?? [];
            calls.getPage.push(requested);
            return pages.find((page) => page.slugs.join('/') === requested.join('/'));
        },

        getPages() {
            calls.getPages += 1;
            return pages;
        },
    };

    return { loader, calls };
}

export interface FakePageInput {
    url: string;
    title?: string;
    description?: string;
    /** Content-source name. `feedPlugin` selects on `type === 'blog'`. */
    type?: string;
    /** Extra frontmatter, for example `{ date: '2026-06-25' }`. */
    data?: Record<string, unknown>;
}

export function createFakePage(input: FakePageInput): Page {
    const slugs = input.url.split('/').filter((segment) => segment.length > 0);

    // `PageData` carries no index signature, so blog frontmatter such as `date` is an excess
    // property on a fresh literal typed as `PageData`. Widening the annotation admits it, and the
    // widened type is still assignable to `PageData`.
    const data: PageData & Record<string, unknown> = {
        title: input.title,
        description: input.description,
        ...input.data,
    };

    return {
        path: `${slugs.join('/') || 'index'}.mdx`,
        type: input.type,
        slugs,
        url: input.url,
        data,
    };
}

/** Adapter whose `core:get-text` resolves body text from a url-to-text map. */
export function createTextAdapter(texts: ReadonlyMap<string, string>, onCall?: (url: string) => void): Adapter {
    return {
        // Method shorthand, not an arrow: `core:get-text` declares `this: AppContext<C>`, and a
        // test that asserts the binding needs `this` to be real.
        'core:get-text'(page) {
            onCall?.(page.url);
            return texts.get(page.url);
        },
    };
}

export interface MockAppContextOptions {
    /** Pass a function to hand out a different loader per call, for cache-invalidation tests. */
    loader?: FakeLoader | (() => FakeLoader | Promise<FakeLoader>);
    adapters?: Adapter[];
    siteConfig?: AppContext['siteConfig'];
}

const noopRoot: Layouts['root'] = () => null;
const noopPage: Layouts['page'] = () => null;
const noopNotFound: Layouts['notFound'] = () => null;

/**
 * Builds a fake `AppContext`.
 *
 * Deliberately not generic: `revalidateLoader`'s type is conditional on `C['source']`, and under a
 * deferred `<C extends ConfigContext>` that conditional never collapses, so no function literal
 * would be assignable to it.
 */
export function createMockAppContext(options: MockAppContextOptions = {}): AppContext {
    const {
        loader = createFakeLoader([]).loader,
        adapters = [],
        siteConfig = { name: 'BLIT386', baseUrl: 'https://blit386.dev' },
    } = options;

    const getLoader = typeof loader === 'function' ? loader : (): FakeLoader => loader;

    const context = {
        mode: 'dynamic',
        getLoader,
        plugins: [],
        adapters,
        layouts: { root: noopRoot, page: noopPage, notFound: noopNotFound },
        revalidateLoader: async (): Promise<void> => {},
        invalidateLoader: (): void => {},
        data: {},
        siteConfig,
    } satisfies Omit<AppContext, '$context' | 'getLoader'> & {
        getLoader: () => FakeLoader | Promise<FakeLoader>;
    };

    // Two members cannot be produced honestly, and no plugin in `src/` reads either:
    //   `$context`  - declared as the config context but documented "always `undefined`"; a real
    //                 value would need a real `Page` plus `Meta`.
    //   `getLoader` - declared `() => Awaitable<LoaderOutput<C>>`, and `LoaderOutput` has fourteen
    //                 required members (page tree, param generation, href resolution,
    //                 `serializePageTree`, three `$infer` phantoms). Even a genuine `loader()`
    //                 output is not assignable to `LoaderOutput<ConfigContext>`, because its
    //                 `$infer` lacks `ConfigContext`'s `source` key.
    // Everything the plugins do touch is checked by the `satisfies` clause above.
    return context as unknown as AppContext;
}
