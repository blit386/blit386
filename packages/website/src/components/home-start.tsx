import type { ReactNode } from 'react';
import { HOME_EXAMPLES } from '../data/home-examples';
import { HomeStartClient } from './home-start-client';

/**
 * The homepage first screen, used once in `content/index.mdx`. A server component so the example metadata is
 * validated at build time and only plain data reaches the browser, not the schema library.
 */
export function HomeStart({ children }: { children: ReactNode }) {
    return <HomeStartClient examples={HOME_EXAMPLES}>{children}</HomeStartClient>;
}
