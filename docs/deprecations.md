# Deprecation Timeline

<!-- blit386.dev-banner:start -->

> [!TIP] You're reading the raw source on GitHub. The same page lives at
> https://blit386.dev/docs/reference/deprecations, typeset like an actual docs site and easier on the eyes. Probably the
> nicer place to read it, but same words either way.

<!-- blit386.dev-banner:end -->

Central tracker for public API compatibility aliases and planned removals.

Use this file as the single source of truth when pruning old names.

---

## 2026-05-31 - compatibility aliases added

These aliases were introduced to preserve backward compatibility after the API naming refactor.

### `BT` namespace

- `BT.pointerPosValid()` -> `BT.isPointerActive()`
- `BT.buttonDown()` -> `BT.isDown()`
- `BT.buttonPressed()` -> `BT.isPressed()`
- `BT.buttonReleased()` -> `BT.isReleased()`
- `BT.gamepadConnected()` -> `BT.isGamepadConnected()`
- `BT.keyDown()` -> `BT.isKeyDown()`
- `BT.keyPressed()` -> `BT.isKeyPressed()`
- `BT.keyReleased()` -> `BT.isKeyReleased()`

### `HardwareSettings` compatibility fields

- `detectDroppedFrames` -> `isDetectingDroppedFrames`
- `overlayEnabled` -> `isOverlayEnabled`
- `overlayVisibleAtStart` -> `isOverlayVisibleAtStart`
- `overlayToggleHintVisible` -> `isOverlayToggleHintVisible`
- `overlayToggleEnabled` -> `isOverlayToggleEnabled`
- `overlayPaletteView` -> `isOverlayPaletteEnabled`
- `overlayTimingChart` -> `isOverlayTimingChartEnabled`
- `overlayRendererDiagnosticsBar` -> `isOverlayRendererDiagnosticsBarEnabled`

### `BootstrapOptions` compatibility fields

- `canvasId` -> `canvasID`
- `containerId` -> `containerID`
- `waitForDOMReady` -> `isWaitingForDOMReady`

### Class method aliases

- `SpriteSheet.isIndexized()` -> `SpriteSheet.isIndexed()`
- `Timer.tick()` -> `Timer.fireIfElapsed()`
- `Vector2i.equals()` -> `Vector2i.isEqual()`
- `Rect2i.contains()` -> `Rect2i.isContaining()`
- `Rect2i.containsXY()` -> `Rect2i.isContainingXY()`
- `Rect2i.intersects()` -> `Rect2i.isIntersecting()`
- `Rect2i.intersectionTo()` -> `Rect2i.intersectTo()`
- `Rect2i.equals()` -> `Rect2i.isEqual()`
- `Color32.equals()` -> `Color32.isEqual()`

### Removal checklist

- Search for `@deprecated Deprecated since 2026-05-31` in `src/`.
- Remove aliases only after confirming downstream demos/apps have migrated.

**Scope:** This tracker lists **public** compatibility aliases only. Internal deprecated helpers (overlay layout
functions, `RenderPaletteUsage` re-exports, etc.) are omitted — search `@deprecated` in `src/` for the full set.

## See Also

| Guide                                                 | What it covers                                     |
| ----------------------------------------------------- | -------------------------------------------------- |
| [API: Core](api-core.md)                              | current `BT` getters and `HardwareSettings` fields |
| [Input Guide](input.md)                               | current input API names                            |
| [Overlay Guide](overlay.md)                           | current overlay configure flags                    |
| [Developer Experience](developer-experience-guide.md) | boolean naming and migration policy                |
