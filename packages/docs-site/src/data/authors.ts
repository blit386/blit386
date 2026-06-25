export type SocialPlatform = 'github' | 'mastodon' | 'bluesky' | 'website';

export type SocialDestination = {
    platform: SocialPlatform;
    url: string;
    label?: string;
};

export type AuthorEntry = {
    name: string;
    url?: string;
    avatar?: string;
    socials?: SocialDestination[];
};

export const authors: Record<string, AuthorEntry> = {
    vancura: {
        name: 'Vaclav Vancura',
        url: 'https://vancura.dev',
        socials: [
            {
                platform: 'github',
                url: 'https://github.com/vancura',
                label: 'vancura',
            },
        ],
    },
};

export function getAuthor(slug: string): AuthorEntry | undefined {
    return authors[slug];
}
