import { getPressContext } from 'fumapress';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { SidebarSocials } from './sidebar-socials';
import { SidebarLogo } from './sidebar-logo';
import type { ReactNode } from 'react';

export async function BlogLayout({ lang, children }: { lang?: string; children: ReactNode }) {
    const ctx = getPressContext();
    const source = await ctx.getLoader();
    const inherited = await ctx.layouts.defaultProps?.call(ctx, { lang });

    return (
        <DocsLayout
            tree={source.getPageTree(lang)}
            {...inherited}
            nav={{ title: <SidebarLogo /> }}
            sidebar={{ collapsible: false, footer: <SidebarSocials /> }}
        >
            {children}
        </DocsLayout>
    );
}
