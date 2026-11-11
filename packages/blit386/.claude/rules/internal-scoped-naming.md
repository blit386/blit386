---
paths: [src/**/*.ts]
---

# Internal scoped naming

This file is the full policy for internal scoped naming; [CLAUDE.md](../../CLAUDE.md) carries only a short summary and
points here. See also `docs/developer-experience-guide.md` (Naming conventions).

When adding or renaming **non-public** symbols in `src/` (library TypeScript):

## Rule

**Private fields, private methods, protected members, and module-local constants/types must not repeat the enclosing
class or file name.** Context already supplies that scope.

| Scope | Applies |
| --- | --- |
| `#privateField`, `private method()` | yes |
| `protected readonly fragmentShader` | yes |
| Module `const`, file-local `type` / `interface` | yes |
| `BT.*`, barrel exports, public class methods | **no** - public API stays stable |
| JSDoc `@link` to another module's public symbol | use the **full public name** |

## Good vs bad (same file provides context)

```typescript
// FrameCapture.ts
request(); // not requestCapture()
hasPending(); // not hasPendingCapture()
private width = 0; // not captureWidth

// GamepadInput.ts
private poll(): void // not pollGamepads()

// Bloom.ts
const FRAGMENT_WGSL // not BLOOM_FRAGMENT_WGSL

// FrameCapture.ts (file-local type)
type Resolve = (blob: Blob) => void; // not FrameCaptureResolve

// Palette.ts (public type - the rule does not apply)
export type PaletteJSON = { … } // in the BLIT386.ts export block, so it keeps the class name; never rename it

// pointerSlot.ts (pointer wire codes)
const CODE_A = 20; // OK - short local name; not BTN_A, which input/buttonFlags.ts already exports as a bit
// JSDoc: maps to BT.BTN_POINTER_A, not BT.BTN_A (gamepad)
```

## Do not rename

- `BT` namespace members, `HardwareSettings` / `BootstrapOptions` fields, or anything in the `BLIT386.ts` export block
- Public methods on exported classes (`Palette.toJSON()`, `SpriteSheet.loadIndexed()`, …)
- Documented public constants (`BT.BTN_POINTER_*`, preset effect names, overlay configure flags)
- Cross-subsystem method names when two types expose similar verbs (e.g. keep `Overlay.handleFrameInput()` vs
  `Toggle.handleInput()`)

## When refactoring existing code

- Prefer shortening **internal** names in the same change that touches the file; do not drive renames through public
  callers.
- After shortening a local alias, update JSDoc that references **public** API to the correct public symbol (internal
  `CODE_A` comments must point at `BT.BTN_POINTER_A`, not `BT.BTN_A`).
