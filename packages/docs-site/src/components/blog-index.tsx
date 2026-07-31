import { getPressContext } from 'fumapress';
import { getBlogContext } from 'fumapress/plugins/blog';
import Link from 'fumadocs-core/link';
import { getPostDate } from '../blog-post-date';
import styles from './blog-index.module.css';
import layoutStyles from './blog-layout.module.css';

interface BlogIndexPageProps {
    lang?: string;
}

interface BlogPostSummary {
    url: string;
    title: string;
    description?: string;
    date?: Date;
}

/**
 * Blog index listing every post newest-first. Posts with a missing or invalid `date`
 * (see `getPostDate`) sort to the end, alongside any other undated posts.
 */
export async function BlogIndexPage({ lang }: BlogIndexPageProps) {
    const ctx = getPressContext();
    const { isBlog } = getBlogContext();
    const source = await ctx.getLoader();
    const pages = source.getPages(lang).filter((page) => isBlog.call(ctx, page));

    const posts: BlogPostSummary[] = pages.map((page) => ({
        url: page.url,
        title: page.data.title ?? '',
        description: page.data.description,
        date: getPostDate(page),
    }));

    posts.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

    return (
        <div className={`not-prose ${layoutStyles.main} ${styles.index}`}>
            <div className={styles.header}>
                <h1 className={styles.heading}>Blog</h1>

                {/*{tagsPath !== false && (
                    <Link href={tagsPath} className={styles.tagsLink}>
                        All Tags
                    </Link>
                )}*/}
            </div>

            <div className={styles.grid}>
                {posts.map((post) => (
                    <Link key={post.url} href={post.url} className={`group ${styles.card}`}>
                        <div className={styles.info}>
                            <span className={styles.cardTitle}>{post.title}</span>
                            {post.description && <span className={styles.cardDescription}>{post.description}</span>}
                        </div>

                        {post.date && <span className={styles.cardDate}>{post.date.toDateString()}</span>}
                    </Link>
                ))}
            </div>
        </div>
    );
}
