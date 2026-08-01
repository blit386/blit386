import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';
import press from 'fumapress/vite';
import mdx from 'fumadocs-mdx/vite';

export default defineConfig({
    vite: {
        plugins: [press(), mdx(), tailwindcss()],
        environments: {
            client: {
                optimizeDeps: {
                    include: [
                        'fumadocs-twoslash > @base-ui/react > @base-ui/utils > use-sync-external-store/shim',
                        'fumadocs-twoslash > @base-ui/react > @base-ui/utils > use-sync-external-store/shim/with-selector',
                    ],
                },
            },
        },
    },
});
