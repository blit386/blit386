export type CommunityPlatform = 'github' | 'discord' | 'x' | 'bluesky' | 'mastodon';

export type CommunityDestination = {
    label: string;
    platform: CommunityPlatform;
    url: string;
    description?: string;
    external?: boolean;
    comingSoon?: boolean;
};

export const communityDestinations: CommunityDestination[] = [
    {
        label: 'GitHub Discussions',
        platform: 'github',
        url: 'https://github.com/blit386/blit386/discussions',
        description: 'Long-form questions, ideas, and show-and-tell',
        external: true,
    },
    {
        label: 'Discord',
        platform: 'discord',
        url: 'https://discord.gg/tC2wGt88Uj',
        description: 'Real-time chat, quick questions, sharing work in progress',
        external: true,
    },
    {
        label: 'GitHub Issues',
        platform: 'github',
        url: 'https://github.com/blit386/blit386/issues',
        description: 'Engine bugs, API feedback, feature requests',
        external: true,
    },
    {
        label: 'X',
        platform: 'x',
        url: 'https://x.com/blit386',
        description: 'Releases, new demos, and project news',
        external: true,
    },
    {
        label: 'GitHub Releases',
        platform: 'github',
        url: 'https://github.com/blit386/blit386/releases',
        description: 'Every version bump gets a release note with a changelog',
        external: true,
    },
];
