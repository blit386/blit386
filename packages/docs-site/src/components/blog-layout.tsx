import { getPressContext } from 'fumapress';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { SidebarSocials } from './sidebar-socials';
import type { ReactNode } from 'react';

export async function BlogLayout({ lang, children }: { lang?: string; children: ReactNode }) {
    const ctx = getPressContext();
    const source = await ctx.getLoader();
    const inherited = await ctx.layouts.defaultProps?.call(ctx, { lang });

    return (
        <DocsLayout tree={source.getPageTree(lang)} {...inherited} sidebar={{ footer: <SidebarSocials /> }}>
            <div className="[grid-area:main] flex flex-col min-w-0 px-4 py-6">{children}</div>
        </DocsLayout>
    );
}
