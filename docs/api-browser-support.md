# Browser Support

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/browser-support, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

The WebGPU renderer is the default. When WebGPU is unavailable the engine falls back to the Canvas 2D software renderer
automatically; it also runs on browsers that do not expose WebGPU globals at all (for example Firefox on Linux without
Nightly). Use `BT.activeBackend` to read which backend actually started (`'webgpu'`, `'software'`, or `null` before
init).

| Browser     | Version        | Status                                                           |
| ----------- | -------------- | ---------------------------------------------------------------- |
| Chrome/Edge | 113+           | Enabled by default                                               |
| Firefox     | 141+ (Windows) | Enabled by default; 145+/147+ on macOS; Nightly on Linux/Android |
| Safari      | 26+            | Enabled by default; Safari 18–25 available via Feature Flags     |

<Callout title="Point-in-time snapshot">

WebGPU rollout is still moving across browsers. Treat this matrix as a snapshot and re-check the vendor release notes
periodically.

</Callout>

Build toolchain: Node.js >= 22.18.0 (LTS) and an ESM bundler (Vite, webpack, esbuild, or similar) to load the published
package in the browser.

## See also

<Cards>
  <Card title="API: Core" href="/docs/api/core">Bootstrap, init, requested vs. active backend.</Card>
  <Card title="Software Fallback Smoke Matrix" href="/docs/performance/smoke-matrix">Manual Canvas 2D fallback checklist.</Card>
</Cards>
