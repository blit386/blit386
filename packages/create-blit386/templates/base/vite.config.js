import { defineConfig } from 'vite';
import { blit386 } from 'blit386/vite';

// Vite is the little web server that runs your game while you work on it.
// The blit386() plugin keeps the game running when you save code or assets
// (hot reload). You usually do not need to change anything else here.
export default defineConfig({
    plugins: [blit386()],
    server: {
        // Open the game in your browser automatically when you run `npm run dev`.
        open: true,
    },
});
