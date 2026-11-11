export type AuthorEntry = {
    name: string;
    url?: string;
};

const authors: Record<string, AuthorEntry> = {
    vancura: {
        name: 'Vaclav Vancura',
        url: 'https://vancura.dev',
    },
};

/** The author a post's `author` frontmatter names; `hasOwn` keeps `constructor` and friends out. */
export function getAuthor(slug: string): AuthorEntry | undefined {
    return Object.hasOwn(authors, slug) ? authors[slug] : undefined;
}
