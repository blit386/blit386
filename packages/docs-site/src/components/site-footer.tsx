'use client';
import type { ReactNode } from 'react';
import { useRouter } from 'waku';
import type { FooterLink, FooterSocialPlatform } from '../data/footer';
import { footerColumns, footerSocials, footerUtilityLinks, getCopyright } from '../data/footer';
import { SITE_NAME } from '../data/site';

/**
 * Minimal inline brand SVGs, keyed by footer social platform. Kept inline to
 * avoid adding an icon-library dependency. Each path is a single-color glyph
 * tinted via `currentColor`; the accessible name is supplied by the link.
 */
const SOCIAL_ICONS: Record<FooterSocialPlatform, ReactNode> = {
    discord: (
        <path
            fill="currentColor"
            d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 13.78 13.78 0 0 0-.608 1.25 18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.369a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.2 14.2 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.661a.06.06 0 0 0-.031-.028ZM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z"
        />
    ),
    x: (
        <path
            fill="currentColor"
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"
        />
    ),
    github: (
        <path
            fill="currentColor"
            d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.91 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.371.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12Z"
        />
    ),
};

function FooterAnchor({ link }: { link: FooterLink }) {
    const externalProps = link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};

    return (
        <a href={link.href} className="transition-colors hover:text-fd-foreground" {...externalProps}>
            {link.label}
        </a>
    );
}

/**
 * Site-wide footer: a social-icon row, navigation columns, utility links, and a
 * copyright line. Pure presentation driven entirely by `../data/footer`.
 */
export function SiteFooter() {
    const { path } = useRouter();
    const year = new Date().getFullYear();

    if (path.startsWith('/docs')) {
        return null;
    }

    return (
        <footer className="border-t bg-fd-background text-fd-muted-foreground">
            <div className="mx-auto flex w-full max-w-(--fd-layout-width) flex-col gap-8 px-4 py-10">
                {/* Social-icon row */}
                <nav className="flex flex-row flex-wrap items-center gap-4" aria-label="Social">
                    {footerSocials.map((social) => {
                        // The interactive element owns the accessible name; the
                        // SVG is decorative so assistive tech announces the link
                        // once, not the icon and the link separately.
                        const icon = (
                            <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" className="size-5">
                                {SOCIAL_ICONS[social.platform]}
                            </svg>
                        );

                        if (social.comingSoon || !social.url) {
                            // No interactive element to name here, so the inert
                            // placeholder span itself carries the label via
                            // role="img"; it has no href, so it stays non-navigable.
                            return (
                                <span
                                    key={social.platform}
                                    role="img"
                                    aria-label={`${social.label} (coming soon)`}
                                    title={`${social.label} (coming soon)`}
                                    className="opacity-40"
                                >
                                    {icon}
                                </span>
                            );
                        }

                        return (
                            <a
                                key={social.platform}
                                href={social.url}
                                aria-label={social.label}
                                className="transition-colors hover:text-fd-foreground"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {icon}
                            </a>
                        );
                    })}
                </nav>

                {/* Navigation link columns */}
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                    {footerColumns.map((column) => (
                        <div key={column.title} className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-fd-foreground">{column.title}</span>
                            <ul className="flex flex-col gap-1.5 text-sm">
                                {column.links.map((link) => (
                                    <li key={link.href}>
                                        <FooterAnchor link={link} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Utility links and copyright */}
                <div className="flex flex-col gap-4 border-t pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <ul className="flex flex-row flex-wrap items-center gap-4">
                        {footerUtilityLinks.map((link) => (
                            <li key={link.href}>
                                <FooterAnchor link={link} />
                            </li>
                        ))}
                    </ul>

                    <p className="text-fd-muted-foreground">
                        <span className="sr-only">{SITE_NAME}. </span>
                        {getCopyright(year)}
                    </p>
                </div>
            </div>
        </footer>
    );
}
