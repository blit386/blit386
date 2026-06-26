import { Card, Cards } from 'fumadocs-ui/components/card';
import { communityDestinations } from '../data/community';

interface CommunityConnectProps {
    title?: string;
    className?: string;
}

export function CommunityConnect({ title = 'Connect', className }: CommunityConnectProps) {
    const active = communityDestinations.filter((d) => !d.comingSoon);
    const upcoming = communityDestinations.filter((d) => d.comingSoon);

    return (
        <section className={className}>
            <h2 className="text-xl font-semibold mb-4 text-fd-foreground">{title}</h2>

            <Cards>
                {active.map((dest) => (
                    <Card
                        key={`${dest.platform}:${dest.label}`}
                        href={dest.url}
                        title={dest.label}
                        description={dest.description}
                        external={dest.external}
                    />
                ))}

                {upcoming.map((dest) => (
                    <Card
                        key={`${dest.platform}:${dest.label}`}
                        href="#"
                        title={dest.label}
                        description={dest.description}
                        className="opacity-50 pointer-events-none select-none"
                    />
                ))}
            </Cards>
        </section>
    );
}
