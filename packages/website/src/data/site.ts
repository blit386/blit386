/**
 * Canonical site name and the single source of truth for it. Consumed by the
 * framework config (`press.config.tsx` `site.name`) and by UI surfaces such as
 * the footer copyright line, so the brand string is never mirrored independently.
 */
export const SITE_NAME = 'BLIT386';

/**
 * Social handles used in per-page meta tags (`press.config.tsx`, `blog-index.tsx`). Kept as
 * separate literals from `src/data/community.ts` because that file's shape
 * (`CommunityDestination[]`) has no field for a bare handle, only a profile URL.
 */
export const TWITTER_HANDLE = '@blit386';
export const FEDIVERSE_HANDLE = '@blit386@mastodon.gamedev.place';
