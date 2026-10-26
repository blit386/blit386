// THROWAWAY: diagnoses the SwiftShader parity mismatch in CI. Revert before merge.
import fs from 'node:fs';

import { test } from '@playwright/test';

import { openFixture } from './open-fixture';

for (const name of ['sprites-stretched', 'sprites-nineslice']) {
    test(`debug ${name} identically on WebGPU and software`, async ({ page }) => {
        const shots: Buffer[] = [];

        for (const delay of [0, 2000]) {
            for (const q of ['', '?backend=software']) {
                console.log(name, q || 'gpu', await openFixture(page, `/${name}.html${q}`));
                await page.waitForTimeout(delay);
                shots.push(await page.locator('canvas').screenshot());
            }
        }

        fs.mkdirSync('test-results/parity-debug', { recursive: true });
        for (const [i, s] of shots.entries()) {
            fs.writeFileSync(`test-results/parity-debug/${name}-${i}.png`, s);
        }

        const result = await page.evaluate(
            async (b64s) => {
                const load = async (s: string) => {
                    const img = new Image();
                    img.src = `data:image/png;base64,${s}`;
                    await img.decode();
                    const c = document.createElement('canvas');
                    c.width = img.width;
                    c.height = img.height;
                    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
                    ctx.drawImage(img, 0, 0);
                    return ctx.getImageData(0, 0, img.width, img.height);
                };
                const imgs = await Promise.all(b64s.map(load));
                const diff = (A: ImageData, B: ImageData) => {
                    let n = 0;
                    let minX = 1e9,
                        minY = 1e9,
                        maxX = -1,
                        maxY = -1;
                    const pairs = new Map<string, number>();
                    for (let p = 0; p < A.data.length; p += 4) {
                        const pa = A.data.slice(p, p + 3).join(',');
                        const pb = B.data.slice(p, p + 3).join(',');
                        if (pa !== pb) {
                            n++;
                            const x = (p / 4) % A.width,
                                y = Math.floor(p / 4 / A.width);
                            minX = Math.min(minX, x);
                            maxX = Math.max(maxX, x);
                            minY = Math.min(minY, y);
                            maxY = Math.max(maxY, y);
                            const k = `${pa} vs ${pb}`;
                            pairs.set(k, (pairs.get(k) ?? 0) + 1);
                        }
                    }
                    return { n, box: [minX, minY, maxX, maxY], pairs: [...pairs].slice(0, 8) };
                };
                return {
                    size: [imgs[0].width, imgs[0].height, imgs[1].width, imgs[1].height],
                    gpuVsSw: diff(imgs[0], imgs[1]),
                    gpuVsSwAfter2s: diff(imgs[2], imgs[3]),
                    gpuVsGpuAfter2s: diff(imgs[0], imgs[2]),
                };
            },
            shots.map((s) => s.toString('base64')),
        );

        console.log(`PARITY-DEBUG ${name} ${JSON.stringify(result)}`);
    });
}
