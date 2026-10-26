import { defineConfig, devices } from '@playwright/test';

/**
 * Extra Chromium flags for GPU-less hosts (GitHub-hosted runners): run Vulkan, and so WebGPU and the compositor, on
 * SwiftShader. Opt in with `VISUAL_SWIFTSHADER=1`; local runs keep the hardware adapter. Do not swap in
 * `--use-webgpu-adapter=swiftshader`: it starts WebGPU too, but the canvas never reaches a screenshot (captures white).
 */
const SWIFTSHADER_ARGS = process.env.VISUAL_SWIFTSHADER
    ? ['--use-vulkan=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : [];

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
                    // Hand-kept in step with CHROME_WEBGPU_ARGS in packages/demos/scripts/playwright-session.mjs.
                    args: [
                        '--enable-unsafe-webgpu',
                        '--enable-features=Vulkan',
                        '--disable-gpu-sandbox',
                        ...SWIFTSHADER_ARGS,
                    ],
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
