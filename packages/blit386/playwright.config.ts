import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/visual',
    outputDir: 'test-results',
    snapshotDir: 'tests/visual/__snapshots__',
    snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{testName}/{projectName}{ext}',

    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 2,

    reporter: process.env.CI ? 'github' : 'html',

    use: {
        baseURL: 'http://localhost:5174',
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium-webgpu',
            use: {
                ...devices['Desktop Chrome'],
                channel: 'chrome',
                launchOptions: {
                    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--disable-gpu-sandbox'],
                },
            },
        },
    ],

    webServer: {
        command: 'pnpm exec vite serve tests/visual/fixtures --config tests/visual/fixtures/vite.config.ts --port 5174',
        port: 5174,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
