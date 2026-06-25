import type { AuthorEntry } from '../data/authors';
import { getAuthor } from '../data/authors';

interface AuthorBylineProps {
    author: string | AuthorEntry;
}

const PLATFORM_LABELS: Record<string, string> = {
    github: 'GitHub',
    mastodon: 'Mastodon',
    bluesky: 'Bluesky',
    website: 'Website',
};

export function AuthorByline({ author }: AuthorBylineProps) {
    const entry: AuthorEntry | undefined = typeof author === 'string' ? getAuthor(author) : author;

    if (!entry) return null;

    return (
        <div className="not-prose flex flex-row flex-wrap items-center gap-3 text-sm text-fd-muted-foreground border-b pb-4 mb-6">
            {entry.avatar && (
                <img
                    src={entry.avatar}
                    alt={entry.name}
                    width={32}
                    height={32}
                    className="rounded-full size-8 object-cover"
                />
            )}

            <span>
                {'By '}
                {entry.url ? (
                    <a
                        href={entry.url}
                        className="text-fd-foreground font-medium hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {entry.name}
                    </a>
                ) : (
                    <span className="text-fd-foreground font-medium">{entry.name}</span>
                )}
            </span>

            {entry.socials && entry.socials.length > 0 && (
                <span className="flex flex-row items-center gap-2">
                    {entry.socials.map((social) => (
                        <a
                            key={social.platform}
                            href={social.url}
                            className="hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${entry.name} on ${PLATFORM_LABELS[social.platform] ?? social.platform}`}
                        >
                            {social.label ?? PLATFORM_LABELS[social.platform] ?? social.platform}
                        </a>
                    ))}
                </span>
            )}
        </div>
    );
}
