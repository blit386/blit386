import type { ReactNode } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { SidebarLogo } from './sidebar-logo';
import styles from './home-layout.module.css';

/**
 * The container for `/` (design doc 4.1, 5): a slim top nav and a full-width content area, no sidebar. Passed to
 * fumapress's `createHomeLayoutPage` as `layout` in `press.config.tsx` - fumapress's own `createHomeLayout` caps its
 * `<main>` at 1400 px, which the edge-to-edge game band cannot live with.
 */
export function HomeContainer({ children }: { children: ReactNode }) {
    return (
        <HomeLayout
            nav={{ title: <SidebarLogo /> }}
            links={[
                { text: 'Docs', url: '/docs' },
                { text: 'Demos', url: 'https://demos.blit386.dev', external: true },
                { text: 'Blog', url: '/blog' },
            ]}
            githubUrl="https://github.com/blit386/blit386"
            searchToggle={{ enabled: false }}
            themeSwitch={{ enabled: false }}
        >
            <div className={`prose ${styles.home}`}>{children}</div>
        </HomeLayout>
    );
}
