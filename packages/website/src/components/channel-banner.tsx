import styles from './channel-banner.module.css';

interface ChannelBannerProps {
    productionUrl: string;
}

/**
 * Shown only on the `next.blit386.dev` preview channel (see `IS_NEXT_CHANNEL` in
 * `press.config.tsx`) – this build tracks unreleased work and may document features that
 * have not shipped to npm yet.
 */
export function ChannelBanner({ productionUrl }: ChannelBannerProps) {
    return (
        <div className={styles.banner} role="note">
            This site tracks unreleased work and may document features not yet on npm.{' '}
            <a href={productionUrl} className={styles.link}>
                Go to the released site
            </a>
            .
        </div>
    );
}
