// THROWAWAY: finds Chrome flags that composite a SwiftShader WebGPU canvas in CI. Revert before merge.
import fs from 'node:fs';

import { chromium, test } from '@playwright/test';

import { openFixture } from './open-fixture';

const BASE = ['--enable-unsafe-webgpu', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader'];

const VARIANTS: Record<string, string[]> = {
    current: ['--enable-features=Vulkan', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'],
    vulkanSwiftshader: ['--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-angle=swiftshader'],
    vulkanAngleVulkan: ['--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-angle=vulkan'],
    noVulkanFeature: ['--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'],
    angleOnly: ['--use-angle=swiftshader'],
    noVulkanSurface: [
        '--enable-features=Vulkan',
        '--use-vulkan=swiftshader',
        '--use-angle=swiftshader',
        '--use-webgpu-adapter=swiftshader',
        '--disable-vulkan-surface',
        '--ignore-gpu-blocklist',
    ],
};

for (const [label, extra] of Object.entries(VARIANTS)) {
    test(`debug ${label} identically on WebGPU and software`, async () => {
        const browser = await chromium.launch({ channel: 'chrome', args: [...BASE, ...extra] });
        const page = await browser.newPage({
            baseURL: 'http://localhost:5174',
            viewport: { width: 1280, height: 720 },
        });
        const gpuBackend = await openFixture(page, '/sprites-stretched.html');
        const gpu = await page.locator('canvas').screenshot();
        const swBackend = await openFixture(page, '/sprites-stretched.html?backend=software');
        const sw = await page.locator('canvas').screenshot();

        fs.mkdirSync('test-results/parity-debug', { recursive: true });
        fs.writeFileSync(`test-results/parity-debug/${label}-gpu.png`, gpu);
        console.log(
            `PARITY-DEBUG ${label} gpu=${String(gpuBackend)} sw=${String(swBackend)} identical=${Buffer.compare(gpu, sw) === 0} gpuBytes=${gpu.length} swBytes=${sw.length}`,
        );
        await browser.close();
    });
}
