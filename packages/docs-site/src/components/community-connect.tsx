import { Card, Cards } from 'fumadocs-ui/components/card';
import { communityDestinations } from '../data/community';
import styles from './community-connect.module.css';

interface CommunityConnectProps {
    title?: string;
    className?: string;
}

export function CommunityConnect({ title = 'Connect', className }: CommunityConnectProps) {
    const active = communityDestinations.filter((d) => !d.comingSoon);
    const upcoming = communityDestinations.filter((d) => d.comingSoon);

    return (
        <section className={className}>
            <h2 className={styles.heading}>{title}</h2>

            <Cards>
                {active.map((dest) => (
                    <Card
                        key={`${dest.platform}:${dest.label}`}
                        href={dest.url}
                        title={dest.label}
                        external={dest.external}
                    />
                ))}

                {upcoming.map((dest) => (
                    <Card
                        key={`${dest.platform}:${dest.label}`}
                        title={dest.label}
                        className={styles.comingSoon}
                        aria-disabled="true"
                    />
                ))}
            </Cards>
        </section>
    );
}
