import { defineConfig } from 'fumapress';
import { fumadocsMdx } from 'fumapress/adapters/mdx';
import { flexsearchPlugin } from 'fumapress/plugins/flexsearch';
import { llmsPlugin } from 'fumapress/plugins/llms.txt';
import { sitemapPlugin } from 'fumapress/plugins/sitemap';
import { takumiPlugin } from 'fumapress/plugins/takumi';
import { mcpServerPlugin } from './src/mcp-server';
import defaultMdxComponents, { createRelativeLink } from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { GithubInfo } from 'fumadocs-ui/components/github-info';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { docs } from './.source/server';

export default defineConfig({
    content: docs.toFumadocsSource(),
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
    .plugins(flexsearchPlugin(), llmsPlugin(), sitemapPlugin(), mcpServerPlugin(), takumiPlugin())
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
                };
            },
        }),
    );
