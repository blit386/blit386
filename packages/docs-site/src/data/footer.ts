import { SITE_NAME } from './site';

/**
 * Builds the footer copyright line from the shared site name (`./site`).
 *
 * @param year - Four-digit year to stamp into the notice.
 * @returns A plain-text copyright string, e.g. `(c) 2026 BLIT386`.
 */
export function getCopyright(year: number): string {
    return `(c) ${year} ${SITE_NAME}`;
}

export type FooterLink = {
    label: string;
    href: string;

    /** External destinations open in a new tab with a safe `rel` attribute. */
    external?: boolean;
};

export type FooterColumn = {
    title: string;
    links: FooterLink[];
};

/** Primary navigation, grouped into labelled columns. */
export const footerColumns: FooterColumn[] = [
    {
        title: 'Documentation',
        links: [{ label: 'Docs', href: '/docs' }],
    },
    {
        title: 'Blog',
        links: [{ label: 'Blog', href: '/blog' }],
    },
    {
        title: 'Demos',
        links: [{ label: 'Demos', href: 'https://demos.blit386.dev', external: true }],
    },
    {
        title: 'Showcase',
        links: [{ label: 'Showcase', href: '/showcase' }],
    },
    {
        title: 'Community',
        links: [{ label: 'Community', href: '/community' }],
    },
];

/** Machine-readable utility endpoints. */
export const footerUtilityLinks: FooterLink[] = [
    { label: 'llms.txt', href: '/llms.txt' },
    { label: 'sitemap.xml', href: '/sitemap.xml' },
];

/**
 * Footer-scoped social platforms. Intentionally separate from
 * `SocialPlatform` in `./authors` so the footer and author bylines can evolve
 * their supported networks independently.
 */
export type FooterSocialPlatform = 'discord' | 'x' | 'github';

export type FooterSocialDestination = {
    platform: FooterSocialPlatform;
    label: string;

    /**
     * Destination URL, or `null` when the destination is not live yet. A `null`
     * url marks the entry as a TBD placeholder (see `comingSoon`) and must not
     * be rendered as a navigable link.
     */
    url: string | null;

    /** True for not-yet-live destinations rendered as inert placeholders. */
    comingSoon?: boolean;
};

/**
 * Social destinations. Concrete URLs are sourced from
 * `content/community/index.mdx`. Mastodon is flagged `comingSoon` with a `null`
 * url until the account is live.
 */
export const footerSocials: FooterSocialDestination[] = [
    {
        platform: 'discord',
        label: 'Discord',
        url: 'https://discord.gg/tC2wGt88Uj',
    },
    {
        platform: 'x',
        label: 'X',
        url: 'https://x.com/blit386',
    },
    {
        platform: 'github',
        label: 'GitHub',
        url: 'https://github.com/blit386/blit386',
    },
];
