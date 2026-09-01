import type { ComponentProps } from 'react';
import { getPressContext } from 'fumapress';
import { getBlogContext } from 'fumapress/plugins/blog';
import { createBlogTagPage, createBlogTagsPage } from 'fumapress/layouts/blog.tags';
import { SITE_NAME } from '../data/site';
import { renderBlogTagMeta, renderBlogTagsMeta } from './blog-page-meta';
import styles from './blog-layout.module.css';

const DefaultBlogTagsPage = createBlogTagsPage();
const DefaultBlogTagPage = createBlogTagPage();

const TAGS_TITLE = 'All Tags';
const TAGS_DESCRIPTION = `Browse all tags used on the ${SITE_NAME} blog.`;

/**
 * Thin wrappers around fumapress's default tags pages. `BlogLayout` no longer assigns
 * `[grid-area:main]` itself (the post page needs its content and its table-of-contents sidebar
 * in separate grid areas), so every other page rendered inside it – including these – now claims
 * its own placement.
 *
 * Also the only place these pages get a `<title>`/OG/canonical block at all: fumapress's stock
 * `createBlogTagsPage()`/`createBlogTagPage()` never call `renderPageMeta` (see
 * `blog-page-meta.tsx`'s `renderListingMeta` doc comment).
 */
export function BlogTagsPage(props: ComponentProps<typeof DefaultBlogTagsPage>) {
    const ctx = getPressContext();
    const { tagsPath } = getBlogContext();

    return (
        <div className={styles.main}>
            {tagsPath !== false && renderBlogTagsMeta(ctx, tagsPath, TAGS_TITLE, TAGS_DESCRIPTION)}
            <DefaultBlogTagsPage {...props} />
        </div>
    );
}

export function BlogTagPage(props: ComponentProps<typeof DefaultBlogTagPage>) {
    const ctx = getPressContext();
    const { tagsPath } = getBlogContext();

    return (
        <div className={styles.main}>
            {tagsPath !== false && renderBlogTagMeta(ctx, tagsPath, props.tag)}
            <DefaultBlogTagPage {...props} />
        </div>
    );
}
