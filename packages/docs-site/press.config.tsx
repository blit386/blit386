import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'fumapress';
import { fumadocsMdx } from 'fumapress/adapters/mdx';
import { flexsearchPlugin } from 'fumapress/plugins/flexsearch';
import { linkValidationPlugin } from 'fumapress/plugins/link-validation';
import { llmsPlugin } from 'fumapress/plugins/llms.txt';
import { sitemapPlugin } from 'fumapress/plugins/sitemap';
import { takumiPlugin } from 'fumapress/plugins/takumi';
import { markdownNegotiationPlugin } from './src/markdown-negotiation';
import { mcpServerPlugin } from './src/mcp-server';
import defaultMdxComponents, { createRelativeLink } from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { GithubInfo } from 'fumadocs-ui/components/github-info';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Popup, PopupContent, PopupTrigger } from 'fumadocs-twoslash/ui';
import { docs } from './.source/server';

let _departureMono: Buffer | undefined;
const getDepartureMono = () =>
    (_departureMono ??= readFileSync(join(process.cwd(), 'public/fonts/DepartureMono-Regular.otf')));

let _ogLogo: string | undefined;
const getOgLogoDataUrl = () => {
    if (_ogLogo) return _ogLogo;
    const data = readFileSync(join(process.cwd(), 'public/og-logo.png'));
    _ogLogo = `data:image/png;base64,${data.toString('base64')}`;
    return _ogLogo;
};

export default defineConfig({
    content: docs.toFumadocsSource(),

    // Build a fully static site. On Cloudflare Workers the dynamic FlexSearch
    // endpoint rebuilt the entire index per cold isolate, exceeding the Worker
    // resource limits (error 1102) and intermittently 503-ing /api/search - so
    // search only ever worked on localhost. In static mode the index is built
    // at build time, shipped as a static asset, and queried client-side.
    mode: 'static',

    site: {
        name: 'BLIT386',
        baseUrl: 'https://blit386.dev',
    },

    meta: {
        root: () => (
            <>
                <script async={true} src="https://plausible.io/js/pa-T01y19zS6cj7d9y8uQnqw.js" />
                <script>
                    {
                        'window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()'
                    }
                </script>
                <script defer={true} src="/webmcp.js" />
            </>
        ),
    },
})
    // markdownNegotiationPlugin runs before llmsPlugin so canonical doc URLs return a
    // direct `text/markdown` 200 (with x-markdown-tokens); autoRedirect is disabled to
    // avoid the llms middleware issuing a 302 to the `.md` file instead.
    .plugins(
        flexsearchPlugin(),

        markdownNegotiationPlugin(),

        llmsPlugin({ autoRedirect: false }),

        sitemapPlugin({
            getEntry(page) {
                const url = page.url;
                let priority = 0.7;
                let changefreq: 'weekly' | 'monthly' = 'monthly';

                if (url === '/') {
                    priority = 1.0;
                    changefreq = 'weekly';
                } else if (url === '/docs/getting-started') {
                    priority = 0.9;
                } else if (url.startsWith('/docs') && !url.includes('/api/')) {
                    priority = 0.8;
                }

                return { loc: `${this.siteConfig.baseUrl}${url}`, priority, changefreq };
            },
        }),

        mcpServerPlugin(),

        takumiPlugin({
            generate(page) {
                return {
                    options: {
                        fonts: [{ name: 'DepartureMono', data: getDepartureMono() }],
                    },
                    node: (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                padding: '60px 72px',
                                width: '100%',
                                height: '100%',
                                background: '#c2c3c7',
                                fontFamily: 'DepartureMono',
                            }}
                        >
                            <img
                                src={getOgLogoDataUrl()}
                                width={180}
                                height={156}
                                style={{ display: 'flex', marginTop: '10px' }}
                                alt="BLIT386 Logo"
                            />

                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div
                                    style={{
                                        fontSize: 64,
                                        color: '#000000',
                                        lineHeight: 1.1,
                                        marginBottom: 24,
                                    }}
                                >
                                    {page.data.title}
                                </div>

                                {page.data.description && (
                                    <div
                                        style={{
                                            fontSize: 22,
                                            color: '#555',
                                            lineHeight: 1.4,
                                            textWrap: 'balance',
                                            marginLeft: '-2px',
                                        }}
                                    >
                                        {page.data.description}
                                    </div>
                                )}
                            </div>
                        </div>
                    ),
                };
            },
        }),

        linkValidationPlugin(),
    )

    .adapters(
        // Extend the default MDX component map so the engine docs can use the full
        // Fumadocs component set (Steps, Tabs, Accordions, Files, TypeTable,
        // GithubInfo, InlineTOC). Callout, Card/Cards, and code blocks already ship
        // in `defaultMdxComponents`. The relative-link override mirrors the adapter
        // default so in-page links keep resolving.
        fumadocsMdx({
            async getMdxComponents(page) {
                return {
                    ...defaultMdxComponents,
                    a: createRelativeLink(await this.getLoader(), page),
                    Accordion,
                    Accordions,
                    File,
                    Files,
                    Folder,
                    GithubInfo,
                    InlineTOC,
                    Step,
                    Steps,
                    Tab,
                    Tabs,
                    TypeTable,
                    Popup,
                    PopupContent,
                    PopupTrigger,
                };
            },
        }),
    );
