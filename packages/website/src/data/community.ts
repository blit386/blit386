export type CommunityPlatform = 'github' | 'discord' | 'bluesky' | 'mastodon';

export type CommunityDestination = {
    label: string;
    platform: CommunityPlatform;
    url: string;
    external?: boolean;
    comingSoon?: boolean;
};

export const communityDestinations: CommunityDestination[] = [
    {
        label: 'Discord',
        platform: 'discord',
        url: 'https://discord.gg/tC2wGt88Uj',
        external: true,
    },
    {
        label: 'Mastodon',
        platform: 'mastodon',
        url: 'https://mastodon.gamedev.place/@blit386',
        external: true,
    },
    {
        label: 'Bluesky',
        platform: 'bluesky',
        url: 'https://bsky.app/profile/blit386.bsky.social',
        external: true,
    },
    {
        label: 'GitHub Releases',
        platform: 'github',
        url: 'https://github.com/blit386/blit386/releases',
        external: true,
    },
    {
        label: 'GitHub Discussions',
        platform: 'github',
        url: 'https://github.com/blit386/blit386/discussions',
        external: true,
    },
    {
        label: 'GitHub Issues',
        platform: 'github',
        url: 'https://github.com/blit386/blit386/issues',
        external: true,
    },
];
