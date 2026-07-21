# Internal scoped naming

This file (and `.cursor/rules/internal-scoped-naming.mdc`) is the full policy for internal scoped naming;
[CLAUDE.md](../../CLAUDE.md) carries only a short summary and points here. See also `docs/developer-experience-guide.md`
(Naming conventions).

When editing non-public symbols in `src/`:

- Do not repeat the class or file name in private fields, private methods, protected members, or module-local
  constants/types.
- Do rename redundant prefixes when you touch a file (`requestCapture` → `request` on `FrameCapture`, `pollGamepads` →
  `poll` on `GamepadInput`, `BLOOM_FRAGMENT_WGSL` → `FRAGMENT_WGSL` in `Bloom.ts`).
- Never rename `BT.*`, barrel exports, public class methods, or documented configure/API names.
- JSDoc to public API: use full public names (`BT.BTN_POINTER_A`, not internal `BTN_A` or gamepad `BT.BTN_A`).
- Avoid global shadows: do not use `JSON` as a file-local type alias; prefer neutral names like `Serialized`.

Cursor: `.cursor/rules/internal-scoped-naming.mdc` (always applied in this repo).
