import type { ComponentProps } from 'react';
import { createBlogTagPage, createBlogTagsPage } from 'fumapress/layouts/blog.tags';
import styles from './blog-layout.module.css';

const DefaultBlogTagsPage = createBlogTagsPage();
const DefaultBlogTagPage = createBlogTagPage();

/**
 * Thin wrappers around fumapress's default tags pages. `BlogLayout` no longer assigns
 * `[grid-area:main]` itself (the post page needs its content and its table-of-contents sidebar
 * in separate grid areas), so every other page rendered inside it - including these - now claims
 * its own placement.
 */
export function BlogTagsPage(props: ComponentProps<typeof DefaultBlogTagsPage>) {
    return (
        <div className={styles.main}>
            <DefaultBlogTagsPage {...props} />
        </div>
    );
}

export function BlogTagPage(props: ComponentProps<typeof DefaultBlogTagPage>) {
    return (
        <div className={styles.main}>
            <DefaultBlogTagPage {...props} />
        </div>
    );
}
