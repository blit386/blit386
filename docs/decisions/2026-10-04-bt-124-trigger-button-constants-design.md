# BT-124: trigger button constants and digital trigger mapping

Status: approved design, pending implementation plan. Milestone 1.8.0 (new public API, minor bump).

## Goal

Let games read the gamepad triggers as digital buttons through the same `BT.isDown` / `BT.isPressed` / `BT.isReleased`
calls used for every other button, without touching the existing analog `BT.getAxis(BT.AXIS_TRIGGER_L/R)` path or the
`BTN_L` / `BTN_R` shoulder mapping.

## Decisions

| Question | Decision |
| --- | --- |
| New constants or fold into shoulders | New constants. Reworking `BTN_L` / `BTN_R` is out of scope per BT-124 |
| Digital threshold | Fixed 0.5, same rule as every other gamepad button (`pressed` or `value >= 0.5`). No setting, no validation |
| Keyboard players | Gamepad-only. No default keys, `BT.inputMap` rejects the new bits |
| Demo | Extend `gamepad-input.js`. No new demo and no BT-542 sub-ticket |

## Engine (`packages/blit386`)

### Constants (`src/BLIT386.ts`)

All `@since 1.8.0`:

- `BTN_L2 = 1 << 16` (left trigger, digital)
- `BTN_R2 = 1 << 17` (right trigger, digital)
- `BTN_TRIGGER = BTN_L2 | BTN_R2`, parallel to `BTN_SHOULDER`

Bits 12-15 remain the pointer buttons. Bits 0-11 remain the face buttons, so `FACE_BUTTON_MASK` and `FACE_BUTTON_FLAGS`
are not widened. That keeps `faceButtonKeys` and `BT.inputMap` rejecting trigger bits with no extra code.

### Gamepad (`src/input/GamepadInput.ts`)

- Mirror `BTN_L2` / `BTN_R2` locally next to the existing mirrored `BTN_*` copies (circular-import avoidance). Document
  the copy as a manual-sync hazard at both sites, or guard it with a parity test, per
  `.claude/rules/named-constants.md`.
- `mapButtons` sets the two bits from raw Gamepad API buttons 6 and 7 through the existing `isButtonDown` helper, so the
  digital rule matches every other button.
- The `0.5` literal in `isButtonDown` becomes one named constant (shared, not duplicated).
- Add both bits to `VALID_BUTTON_FLAGS` so first-press tick tracking and `repeatRate` work for triggers.
- The analog values written by `mapAxesInto` (`AXIS_TRIGGER_L/R`) are unchanged.

### Routing (`src/BLIT386.ts`)

- Add `TRIGGER_BUTTON_FLAGS = [BTN_L2, BTN_R2]`.
- In `isDown`, `isPressed` and `isReleased`, add a loop after the face-button loop that queries the gamepad only (no
  keyboard lookup). The pointer path is unchanged.
- Players 0-3 map like every other gamepad button.
- Deprecated aliases (`buttonDown`, `buttonPressed`, `buttonReleased`) forward to the same code and need no change.

## Tests (written first, TDD)

`GamepadInput.test.ts`:

- value 0.49 reads up, 0.5 reads down
- pressed fires on the edge, released fires on release
- `repeatRate` repeats while the trigger is held
- a multi-bit mask (`BTN_TRIGGER`) uses ANY semantics

`BLIT386` routing test:

- `BTN_L2` / `BTN_R2` work per player (0-3)
- `BTN_TRIGGER` mask behaves as ANY
- a keyboard press never sets the trigger bits
- `BT.inputMap(0, BT.BTN_L2, 'KeyQ')` is a no-op
- `BTN_L` / `BTN_R` behavior is unchanged

## Docs and kit

- `packages/blit386/docs/guide-input.md`: constants table, `<Since>` tags, a short "triggers: analog or digital" section
  covering the fixed 0.5 threshold and gamepad-only behavior.
- Regenerate API history (`pnpm run api:history` in `packages/blit386`) and add the changelog entry.
- `pnpm run sync:docs` in `packages/website` so blit386.dev stays in sync.
- Kit: update `packages/kit/content/skills/read-gamepad/SKILL.md` (constants list, mask list). Bump `docsReviewedAt` if
  the kit drift check requires it, and run the `/kit-audit` skill to confirm.

## Demos (`packages/demos/src/gamepad-input.js`)

- Add "L2 held" and "R2 held" pips next to the A/B pips, driven by `BT.isDown(BT.BTN_L2/R2, PLAYER)`.
- Add a `BT.isPressed(BT.BTN_R2, PLAYER)` action: a short boost burst on the pod. The throttle meter stays analog, so
  the demo shows analog and digital trigger reads side by side.
- Update the header comment (try-this list and API summary).
- No other demo reads triggers. Verify by hand with a gamepad (the demos package has no test runner) and say how in the
  PR.

## Out of scope

- A configurable trigger threshold.
- Default keyboard keys for the trigger bits.
- Any change to `BTN_L` / `BTN_R` or the analog axis API.

## Coordination

BT-123 (`anyButton*`) is In Progress separately. Whichever lands second decides whether trigger bits count as "any
button". Note this on both tickets.

## Release and commits

- Minor bump (new API), tagged to the 1.8.0 milestone.
- Commit scope `feat(api)` for the engine change, `feat(demos)` for the demo, per package conventions.
