import type { ReactNode } from 'react';
import { getPressContext } from 'fumapress';
import type { AppContext } from 'fumapress';
import { getBlogContext } from 'fumapress/plugins/blog';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import type { TOCItemType } from 'fumadocs-core/toc';
import Link from 'fumadocs-core/link';
import styles from './blog-page.module.css';

type BlogPost = AppContext['$context']['page'];

interface BlogPageProps {
    lang?: string;
    slugs: string[];
    page: BlogPost;
}

/**
 * Calls each adapter's hook in order and returns the first defined result (mirrors fumapress's
 * own `renderBody`/`renderToc`, which are not part of the public API - `ctx.adapters` is).
 */
async function callFirstAdapter<T>(
    ctx: AppContext,
    page: BlogPost,
    hook: (
        adapter: AppContext['adapters'][number],
    ) => ((this: AppContext, page: BlogPost) => T | Promise<T>) | undefined,
): Promise<Awaited<T> | undefined> {
    for (const adapter of ctx.adapters) {
        const result = await hook(adapter)?.call(ctx, page);

        if (result !== undefined) {
            return result;
        }
    }

    return undefined;
}

async function renderBody(ctx: AppContext, page: BlogPost): Promise<ReactNode> {
    const body = await callFirstAdapter(ctx, page, (adapter) => adapter['core:render-body']);

    if (body === undefined) {
        throw new Error('[blog-page] No adapter rendered a body for this post.');
    }

    return body;
}

async function renderToc(ctx: AppContext, page: BlogPost): Promise<TOCItemType[]> {
    const toc = await callFirstAdapter(ctx, page, (adapter) => adapter['core:render-toc']);

    return toc ?? [];
}

/**
 * Blog post page. Uses the same `DocsPage`/`TOC` machinery as the documentation pages so posts
 * get the docs-style "on this page" sidebar (desktop) and popover (mobile) instead of fumapress's
 * default blog post page, which pins a collapsible table-of-contents + share pill to the bottom
 * of the viewport.
 */
export async function BlogPage({ page }: BlogPageProps) {
    const ctx = getPressContext();
    const { indexPath } = getBlogContext();
    const data = page.data as { title: string; description?: string; tags?: string[] };
    const [body, toc] = await Promise.all([renderBody(ctx, page), renderToc(ctx, page)]);

    return (
        <DocsPage toc={toc} breadcrumb={{ enabled: false }} footer={{ enabled: false }}>
            <div className={styles.header}>
                {indexPath !== false && (
                    <Link href={indexPath} className={styles.backLink}>
                        Back to Blog
                    </Link>
                )}

                <DocsTitle>{data.title}</DocsTitle>
                <DocsDescription>{data.description}</DocsDescription>

                {/*{(date || (tags && tags.length > 0)) && (
                    <div className={styles.meta}>
                        {date && <span className={styles.date}>{date.toDateString()}</span>}

                        {tagsPath !== false &&
                            tags?.map((tag) => (
                                <Link key={tag} href={`${tagsPath}/${tag}`} className={styles.tag}>
                                    {tag}
                                </Link>
                            ))}
                    </div>
                )}*/}
            </div>

            <DocsBody>{body}</DocsBody>
        </DocsPage>
    );
}
