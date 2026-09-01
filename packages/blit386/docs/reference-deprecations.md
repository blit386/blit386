# Deprecation Timeline

<!-- generated:start -->

<!-- prettier-ignore -->
> [!NOTE]
> This file is generated. Never hand-edit it: edit `packages/kit/src/migrations/registry.ts` and
> run `pnpm run api:deprecations` to regenerate it. `pnpm run api:deprecations:check` fails when
> this file drifts from the registry.

<!-- generated:end -->

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/reference/deprecations, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Central tracker for public API compatibility aliases and planned removals.

Use this file as the single source of truth when pruning old names.

## 2026-05-31 – compatibility aliases added

These aliases were introduced to preserve backward compatibility after the API naming refactor.

### `BT` namespace

Removal target: 2.0.0

- `BT.pointerPosValid()` → `BT.isPointerActive()`
- `BT.buttonDown()` → `BT.isDown()`
- `BT.buttonPressed()` → `BT.isPressed()`
- `BT.buttonReleased()` → `BT.isReleased()`
- `BT.gamepadConnected()` → `BT.isGamepadConnected()`
- `BT.keyDown()` → `BT.isKeyDown()`
- `BT.keyPressed()` → `BT.isKeyPressed()`
- `BT.keyReleased()` → `BT.isKeyReleased()`

### `HardwareSettings` compatibility fields

Removal target: 2.0.0

- `detectDroppedFrames` → `isDetectingDroppedFrames`
- `overlayEnabled` → `isOverlayEnabled`
- `overlayVisibleAtStart` → `isOverlayVisibleAtStart`
- `overlayToggleHintVisible` → `isOverlayToggleHintVisible`
- `overlayToggleEnabled` → `isOverlayToggleEnabled`
- `overlayPaletteView` → `isOverlayPaletteEnabled`
- `overlayTimingChart` → `isOverlayTimingChartEnabled`
- `overlayRendererDiagnosticsBar` → `isOverlayRendererDiagnosticsBarEnabled`

### `BootstrapOptions` compatibility fields

Removal target: 2.0.0

- `canvasId` → `canvasID`
- `containerId` → `containerID`
- `waitForDOMReady` → `isWaitingForDOMReady`

### Class method aliases

Removal target: 2.0.0

- `SpriteSheet.isIndexized()` → `SpriteSheet.isIndexed()`
- `Rect2i.containsXY()` → `Rect2i.isContainingXY()`
- `Rect2i.intersectionTo()` → `Rect2i.intersectTo()`
- `Timer.tick()` → `Timer.fireIfElapsed()`
- `Vector2i.equals()` → `Vector2i.isEqual()`
- `Rect2i.equals()` → `Rect2i.isEqual()`
- `Color32.equals()` → `Color32.isEqual()`
- `Rect2i.contains()` → `Rect2i.isContaining()`
- `Rect2i.intersects()` → `Rect2i.isIntersecting()`

### Removal checklist

- Search for `@deprecated Deprecated since` in `src/` (every public alias uses that versioned form).
- Remove aliases only after confirming downstream demos/apps have migrated.

<Callout title="Public aliases only">

This tracker lists public compatibility aliases only. Internal deprecated helpers that used to live beside overlay
layout functions and `RenderPaletteUsage` re-exports were removed rather than carried forward – search `@deprecated` in
`src/` for anything that remains outside this list.

</Callout>

## See also

<Cards>
  <Card title="API: Core" href="/docs/api/core">Current BT getters and HardwareSettings fields.</Card>
  <Card title="Input Guide" href="/docs/guides/input">Current input API names.</Card>
  <Card title="Overlay Guide" href="/docs/guides/overlay">Current overlay configure flags.</Card>
  <Card title="Developer Experience" href="https://github.com/blit386/blit386/blob/main/docs/developer-experience-guide.md">Boolean naming and migration policy.</Card>
</Cards>
