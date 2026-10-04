# BT-124 Trigger Button Constants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the gamepad triggers as digital buttons `BT.BTN_L2` / `BT.BTN_R2` (and mask `BT.BTN_TRIGGER`) readable
through `BT.isDown` / `BT.isPressed` / `BT.isReleased`, with a 0.5 threshold, gamepad-only.

**Architecture:** Two new bits (16, 17) sit above the pointer bits, so `FACE_BUTTON_MASK` and `FACE_BUTTON_FLAGS` stay
untouched and `BT.inputMap` keeps rejecting them. `GamepadInput.mapButtons` sets the bits from raw buttons 6 and 7 with
the existing `isButtonDown` rule. `BT.isDown/isPressed/isReleased` get one extra gamepad-only loop over
`TRIGGER_BUTTON_FLAGS`. The analog axis path is unchanged.

**Tech Stack:** TypeScript (strict), Vitest, pnpm workspace (`packages/blit386`, `packages/demos`, `packages/kit`,
`packages/website`).

**Spec:** `docs/decisions/2026-10-04-bt-124-trigger-button-constants-design.md`

## Global Constraints

- Threshold is fixed at 0.5 (`pressed || value >= 0.5`). No setting, no validation, no new `HardwareSettings` field.
- Keyboard players get nothing for the new bits. `BT.inputMap(player, BT.BTN_L2, ...)` is a no-op.
- `BTN_L` / `BTN_R` (bits 8, 9) and `AXIS_TRIGGER_L/R` behavior must not change.
- Bits: `BTN_L2 = 1 << 16`, `BTN_R2 = 1 << 17`, `BTN_TRIGGER = BTN_L2 | BTN_R2`, all `@since 1.8.0`.
- No emoji; plain hyphen-minus only (never en/em dash); American English.
- Named-constants rule (`.claude/rules/named-constants.md`): the `0.5` literal and the trigger button indices 6 and 7
  each get one named constant; the mirrored `BTN_L2/R2` copy in `GamepadInput.ts` is documented as a manual-sync hazard
  and guarded by a parity test.
- Use `pnpm run <script>` (not bare `pnpm <script>`). Run commands from the repo root unless a step says otherwise.
- Commits: Conventional Commits, `git commit -s`, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
  Only commit when the user has approved local commits for this run; otherwise stage the files and stop at the commit
  step. Never push.

## Review Focus

- Trigger value exactly 0.5 reads down and 0.49 reads up (boundary, not just "obviously on/off").
- A pad that reports fewer than 8 buttons (no trigger entries) must read triggers as up, not throw.
- A held trigger on a pad that disconnects produces a release edge, like any other button.
- `BT.isDown(BT.BTN_L2, 4)` and a negative or fractional player return `false`.
- A mixed mask such as `BT.BTN_A | BT.BTN_L2` is true when either source is active, and keyboard-held A does not require
  the gamepad.
- Bits above 17 or unknown bits in a mask are ignored, never throw.

---

## File Structure

- Modify `packages/blit386/src/BLIT386.ts` - new constants, `TRIGGER_BUTTON_FLAGS`, gamepad-only loops in three methods.
- Modify `packages/blit386/src/input/GamepadInput.ts` - mirrored bits, named constants, `mapButtons`,
  `VALID_BUTTON_FLAGS`.
- Modify `packages/blit386/src/input/GamepadInput.test.ts` and `packages/blit386/src/BLIT386.test.ts` - tests.
- Modify `packages/blit386/docs/guide-input.md`, `packages/blit386/docs/changelog.md`, regenerate
  `packages/blit386/docs/_api-history.json`, sync website docs.
- Modify `packages/kit/content/skills/read-gamepad/SKILL.md` (and `docsReviewedAt` if the kit drift check demands it).
- Modify `packages/demos/src/gamepad-input.js`.

---

### Task 1: Constants and GamepadInput digital trigger bits

**Files:**

- Modify: `packages/blit386/src/BLIT386.ts` (constants block near `BTN_SHOULDER`, around line 518)
- Modify: `packages/blit386/src/input/GamepadInput.ts` (top-of-file constants, `isButtonDown` helper, `mapButtons`,
  `mapAxesInto`)
- Test: `packages/blit386/src/input/GamepadInput.test.ts`, `packages/blit386/src/BLIT386.test.ts` (constants describe
  near line 1581)

**Interfaces:**

- Produces: `BT.BTN_L2: number` (65536), `BT.BTN_R2: number` (131072), `BT.BTN_TRIGGER: number` (196608).
  `GamepadInput.isButtonDown/isButtonPressed/isButtonReleased(mask, player)` now honor those bits. Task 2 relies on
  exactly these.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('GamepadInput', ...)` in `GamepadInput.test.ts`, after the
`'maps dpad buttons to direction flags'` test:

```ts
it('maps triggers to BTN_L2 / BTN_R2 at the 0.5 threshold', () => {
  pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 0.49, 0.5] });
  input.endFrame(1);

  expect(input.isButtonDown(BT.BTN_L2, 0)).toBe(false);
  expect(input.isButtonDown(BT.BTN_R2, 0)).toBe(true);
  expect(input.isButtonDown(BT.BTN_TRIGGER, 0)).toBe(true);
  // The analog value is untouched by the digital mapping.
  expect(input.getAxis(BT.AXIS_TRIGGER_L, 0)).toBe(0.49);
});

it('does not map triggers onto the shoulder bits', () => {
  pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1, 1] });
  input.endFrame(1);

  expect(input.isButtonDown(BT.BTN_SHOULDER, 0)).toBe(false);

  pads[0] = makeGamepad({ pressed: [4, 5] });
  input.endFrame(2);

  expect(input.isButtonDown(BT.BTN_SHOULDER, 0)).toBe(true);
  expect(input.isButtonDown(BT.BTN_TRIGGER, 0)).toBe(false);
});

it('reports trigger pressed/released edges and supports repeat', () => {
  pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1] });
  input.endFrame(0);

  expect(input.isButtonPressed(BT.BTN_L2, 0, undefined, 1)).toBe(true);
  expect(input.isButtonPressed(BT.BTN_L2, 0, 3, 5)).toBe(true);
  input.endFrame(5);

  expect(input.isButtonPressed(BT.BTN_L2, 0, 3, 6)).toBe(false);
  expect(input.isButtonPressed(BT.BTN_L2, 0, 3, 8)).toBe(true);

  pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 0] });
  input.endFrame(9);

  expect(input.isButtonReleased(BT.BTN_L2, 0)).toBe(true);
});

it('reads triggers as up on a pad that reports fewer than eight buttons', () => {
  const pad = makeGamepad({});
  (pad as unknown as { buttons: unknown[] }).buttons = pad.buttons.slice(0, 6);
  pads[0] = pad;
  input.endFrame(1);

  expect(input.isButtonDown(BT.BTN_TRIGGER, 0)).toBe(false);
});

it('treats disconnect as release for a held trigger', () => {
  pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 0, 1] });
  input.endFrame(1);
  pads[0] = null;
  input.endFrame(2);

  expect(input.isButtonReleased(BT.BTN_R2, 0)).toBe(true);
});

it('ignores unknown bits in a mask', () => {
  pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1] });
  input.endFrame(1);

  expect(input.isButtonDown(1 << 20, 0)).toBe(false);
  expect(input.isButtonDown(BT.BTN_A | BT.BTN_L2, 0)).toBe(true);
});
```

Append inside `describe('BT gamepad constants and APIs', ...)` in `BLIT386.test.ts`, after the `BTN_SHOULDER` assertion
test:

```ts
it('defines trigger button constants above the pointer bits', () => {
  expect(BT.BTN_L2).toBe(1 << 16);
  expect(BT.BTN_R2).toBe(1 << 17);
  expect(BT.BTN_TRIGGER).toBe(BT.BTN_L2 | BT.BTN_R2);
  expect(BT.BTN_TRIGGER & BT.BTN_POINTER_ANY).toBe(0);
  expect(BT.BTN_TRIGGER & BT.BTN_SHOULDER).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/blit386 && pnpm run test:unit -- src/input/GamepadInput.test.ts src/BLIT386.test.ts` Expected: FAIL
(`BT.BTN_L2` is undefined, so the new trigger tests and the constants test fail).

- [ ] **Step 3: Add the public constants**

In `packages/blit386/src/BLIT386.ts`, after the `BTN_SHOULDER` entry (before `BTN_POINTER_ANY`):

```ts
    /**
     * Left trigger as a digital button (down at 50% pull or more). Gamepad only:
     * keyboard players never trigger it and `BT.inputMap` rejects it. The analog
     * pull is still available through `BT.getAxis(BT.AXIS_TRIGGER_L)`.
     *
     * @since 1.8.0
     */
    BTN_L2: 1 << 16,

    /**
     * Right trigger as a digital button (down at 50% pull or more). Gamepad only:
     * keyboard players never trigger it and `BT.inputMap` rejects it. The analog
     * pull is still available through `BT.getAxis(BT.AXIS_TRIGGER_R)`.
     *
     * @since 1.8.0
     */
    BTN_R2: 1 << 17,

    /**
     * Either trigger as a digital button (`BTN_L2 | BTN_R2`).
     *
     * @since 1.8.0
     */
    BTN_TRIGGER: (1 << 16) | (1 << 17),
```

- [ ] **Step 4: Update GamepadInput**

In `packages/blit386/src/input/GamepadInput.ts`:

1. After `GP_BUTTON_R = 5;` add `const GP_BUTTON_L2 = 6;` and `const GP_BUTTON_R2 = 7;`.
2. After `const BTN_SELECT = 1 << 11;` add:

```ts
/**
 * Trigger bit flags mirrored from `BT.BTN_L2` / `BT.BTN_R2` to avoid circular imports.
 * Manual-sync hazard: keep in step with `BLIT386.ts`; `GamepadInput.test.ts` asserts the parity.
 */
const BTN_L2 = 1 << 16;
const BTN_R2 = 1 << 17;
```

3. Add `BTN_L2, BTN_R2,` to the end of the `VALID_BUTTON_FLAGS` array (after `BTN_SELECT`).
4. After `GAMEPAD_AXIS_COUNT`, add the shared threshold:

```ts
/** A gamepad button (including a trigger) counts as down at or above this analog value. */
const BUTTON_DOWN_THRESHOLD = 0.5;
```

5. In `isButtonDown`, replace `button.value >= 0.5` with `button.value >= BUTTON_DOWN_THRESHOLD`.
6. In `mapButtons`, before `return mask;`:

```ts
if (isButtonDown(pad, GP_BUTTON_L2)) {
  mask |= BTN_L2;
}
if (isButtonDown(pad, GP_BUTTON_R2)) {
  mask |= BTN_R2;
}
```

7. In `mapAxesInto`, replace the literal `6` / `7` with `GP_BUTTON_L2` / `GP_BUTTON_R2`.
8. Add a parity test inside `describe('GamepadInput', ...)` in `GamepadInput.test.ts`:

```ts
it('keeps the mirrored trigger bits in step with BT.BTN_L2 / BT.BTN_R2', () => {
  pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1, 1] });
  input.endFrame(1);

  expect(input.isButtonDown(BT.BTN_L2, 0)).toBe(true);
  expect(input.isButtonDown(BT.BTN_R2, 0)).toBe(true);
  expect(BT.BTN_L2).toBe(1 << 16);
  expect(BT.BTN_R2).toBe(1 << 17);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/blit386 && pnpm run test:unit -- src/input/GamepadInput.test.ts src/BLIT386.test.ts` Expected: PASS
(all new tests, no regressions).

- [ ] **Step 6: Commit**

```bash
git add packages/blit386/src/BLIT386.ts packages/blit386/src/input/GamepadInput.ts packages/blit386/src/input/GamepadInput.test.ts packages/blit386/src/BLIT386.test.ts
git commit -s -m "feat(api): map gamepad triggers to BTN_L2 and BTN_R2 digital bits" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Route trigger bits through BT.isDown / isPressed / isReleased

**Files:**

- Modify: `packages/blit386/src/BLIT386.ts` (constants near line 105; `isDown` ~1869, `isPressed` ~1943, `isReleased`
  ~2027)
- Test: `packages/blit386/src/BLIT386.test.ts`

**Interfaces:**

- Consumes: `BT.BTN_L2/R2/TRIGGER` and the gamepad-side
  `isButtonDown/isButtonPressed/isButtonReleased(mask, player[, repeatRate, tick])` from Task 1.
- Produces: `BT.isDown(BTN_L2 | ..., player)`, `BT.isPressed(..., player, repeatRate?)`, `BT.isReleased(..., player)`
  honor trigger bits, gamepad only.

- [ ] **Step 1: Write the failing tests**

Add a new describe to `BLIT386.test.ts` after `'BT gamepad constants and APIs'` (reuse the file's existing imports of
`BT`, `BTAPI`, `vi`):

```ts
describe('BT trigger buttons (gamepad-only)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isDown reads BTN_L2 / BTN_R2 from the gamepad per player', () => {
    const isDown = vi.fn((flag: number, player: number) => flag === BT.BTN_R2 && player === 2);
    vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonDown: isDown } as never);
    vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(null);

    expect(BT.isDown(BT.BTN_R2, 2)).toBe(true);
    expect(BT.isDown(BT.BTN_L2, 2)).toBe(false);
    expect(BT.isDown(BT.BTN_TRIGGER, 2)).toBe(true);
    expect(BT.isDown(BT.BTN_R2, 0)).toBe(false);
  });

  it('never consults the keyboard for trigger bits', () => {
    const keyboard = {
      isButtonDown: vi.fn(() => true),
      isButtonPressed: vi.fn(() => true),
      isButtonReleased: vi.fn(() => true),
    };
    vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(keyboard as never);
    vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);

    expect(BT.isDown(BT.BTN_TRIGGER, 0)).toBe(false);
    expect(BT.isPressed(BT.BTN_TRIGGER, 0)).toBe(false);
    expect(BT.isReleased(BT.BTN_TRIGGER, 0)).toBe(false);
    expect(keyboard.isButtonDown).not.toHaveBeenCalled();
    expect(keyboard.isButtonPressed).not.toHaveBeenCalled();
    expect(keyboard.isButtonReleased).not.toHaveBeenCalled();
  });

  it('isPressed forwards repeatRate and tick to the gamepad', () => {
    const isPressed = vi.fn(() => true);
    vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonPressed: isPressed } as never);
    vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(null);
    vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(42);

    expect(BT.isPressed(BT.BTN_L2, 1, 6)).toBe(true);
    expect(isPressed).toHaveBeenCalledWith(BT.BTN_L2, 1, 6, 42);
  });

  it('isReleased reads the gamepad release edge', () => {
    const isReleased = vi.fn(() => true);
    vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonReleased: isReleased } as never);
    vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(null);

    expect(BT.isReleased(BT.BTN_R2, 0)).toBe(true);
  });

  it('returns false for trigger bits when the gamepad subsystem is unavailable or the player is invalid', () => {
    vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);
    vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(null);

    expect(BT.isDown(BT.BTN_L2, 0)).toBe(false);
    expect(BT.isDown(BT.BTN_L2, 4)).toBe(false);
    expect(BT.isDown(BT.BTN_L2, -1)).toBe(false);
    expect(BT.isDown(BT.BTN_L2, 1.5)).toBe(false);
  });

  it('combines a face button and a trigger in one mask (ANY semantics)', () => {
    const isDown = vi.fn((flag: number) => flag === BT.BTN_L2);
    vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonDown: isDown } as never);
    vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: vi.fn(() => false) } as never);

    expect(BT.isDown(BT.BTN_A | BT.BTN_L2, 0)).toBe(true);
    expect(BT.isDown(BT.BTN_A, 0)).toBe(false);
  });

  it('BT.inputMap rejects trigger bits', () => {
    const before = BT.isDown(BT.BTN_A, 0);

    expect(() => BT.inputMap(0, BT.BTN_L2, 'KeyQ')).not.toThrow();
    expect(() => BT.inputMap(0, BT.BTN_TRIGGER, 'KeyQ')).not.toThrow();
    expect(BT.isDown(BT.BTN_A, 0)).toBe(before);
  });
});
```

Check the file's import line for `afterEach` and add it if missing. Note: the player-validity assertions (4, -1, 1.5)
pass only because the real `GamepadInput` rejects them; with the mock above they pass because the mock subsystem is
`null`. That is intentional for the "unavailable" half. The real validity check is already covered by
`GamepadInput.test.ts` ("returns safe defaults for invalid players").

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/blit386 && pnpm run test:unit -- src/BLIT386.test.ts -t "trigger buttons"` Expected: FAIL
(`isDown(BTN_R2, 2)` is false because only the face loop runs).

- [ ] **Step 3: Implement the routing**

In `packages/blit386/src/BLIT386.ts`:

1. After `const FACE_BUTTON_MASK = (1 << 12) - 1;` add:

```ts
/** Trigger button bit flags (`BTN_L2`, `BTN_R2`). Gamepad only, no keyboard fallback. */
const TRIGGER_BUTTON_FLAGS = [1 << 16, 1 << 17] as const;
```

2. In `isDown`, replace the final `return false;` (after the face loop) with:

```ts
for (const triggerButton of TRIGGER_BUTTON_FLAGS) {
  if ((button & triggerButton) === 0) {
    continue;
  }

  if (BTAPI.instance.getGamepad()?.isButtonDown(triggerButton, player) ?? false) {
    return true;
  }
}

return false;
```

3. In `isPressed`, same shape, using the tick already read for the face loop:

```ts
for (const triggerButton of TRIGGER_BUTTON_FLAGS) {
  if ((button & triggerButton) === 0) {
    continue;
  }

  if (BTAPI.instance.getGamepad()?.isButtonPressed(triggerButton, player, repeatRate, tick) ?? false) {
    return true;
  }
}

return false;
```

4. In `isReleased`:

```ts
for (const triggerButton of TRIGGER_BUTTON_FLAGS) {
  if ((button & triggerButton) === 0) {
    continue;
  }

  if (BTAPI.instance.getGamepad()?.isButtonReleased(triggerButton, player) ?? false) {
    return true;
  }
}

return false;
```

5. Update the `isDown` / `isPressed` / `isReleased` JSDoc `@param button` lines and the "face buttons" prose to mention
   `BTN_L2` / `BTN_R2` / `BTN_TRIGGER` as gamepad-only. Add
   `@changed 1.8.0 Also accepts BTN_L2 / BTN_R2 / BTN_TRIGGER (gamepad only).` to each (match the existing `@changed`
   tag format in this file).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/blit386 && pnpm run test:unit` Expected: PASS for the whole engine suite, including the existing
face-button, pointer and keyboard-merge tests.

- [ ] **Step 5: Typecheck and lint**

Run: `cd packages/blit386 && pnpm run typecheck && pnpm run lint` Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add packages/blit386/src/BLIT386.ts packages/blit386/src/BLIT386.test.ts
git commit -s -m "feat(api): route trigger bits through isDown, isPressed and isReleased" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Docs, API history, changelog, website sync, kit

**Files:**

- Modify: `packages/blit386/docs/guide-input.md` (Since tags near line 216-221; mask examples near line 248; new
  section)
- Modify: `packages/blit386/docs/changelog.md`
- Regenerate: `packages/blit386/docs/_api-history.json`
- Sync: `packages/website/content/docs/*`
- Modify: `packages/kit/content/skills/read-gamepad/SKILL.md`; `packages/kit/package.json` (`blit386.docsReviewedAt`)
  only if the drift check requires it

**Interfaces:**

- Consumes: the constants and behavior from Tasks 1-2.

- [ ] **Step 1: Update guide-input.md**

After `<Since symbol="BT.BTN_SHOULDER" />` add:

```
<Since symbol="BT.BTN_L2" />
<Since symbol="BT.BTN_R2" />
<Since symbol="BT.BTN_TRIGGER" />
```

After the `BTN_SHOULDER` example line in the mask code block add
`BT.isDown(BT.BTN_TRIGGER, 0); // L2 or R2 trigger past half pull, gamepad only`.

Add a short section after the face-button section (same heading level style as its neighbors):

```markdown
### Triggers: analog or digital

Each trigger is available two ways. `BT.getAxis(BT.AXIS_TRIGGER_L)` / `AXIS_TRIGGER_R` return the pull from 0 to 1.
`BT.BTN_L2` and `BT.BTN_R2` (mask `BT.BTN_TRIGGER`) work with `BT.isDown`, `BT.isPressed` and `BT.isReleased` and turn
on at 50% pull or more, the same rule every gamepad button uses. The threshold is fixed. `BTN_L` and `BTN_R` are still
the shoulder buttons, not the triggers.

Trigger buttons are gamepad only. Keyboard players never trigger them and `BT.inputMap` ignores them, so give keyboard
players an explicit fallback if your game needs one:

\`\`\`ts const fire = BT.isPressed(BT.BTN_R2, 0) || BT.isPressed(BT.BTN_A, 0); \`\`\`
```

(Write the code fence as a normal triple-backtick fence in the file; the backslashes above only escape it inside this
plan.)

- [ ] **Step 2: Changelog and API history**

Add a 1.8.0 entry under the existing 1.8.0 heading in `packages/blit386/docs/changelog.md`, matching the neighboring
entry format: "Added `BT.BTN_L2`, `BT.BTN_R2` and `BT.BTN_TRIGGER`, digital trigger buttons for `isDown` / `isPressed` /
`isReleased` (gamepad only, 50% threshold)."

Run: `cd packages/blit386 && pnpm run api:history` Expected: `_api-history.json` gains the three symbols at 1.8.0. Then
run `pnpm run api:history:check` and `pnpm run api:since:check` - both pass.

- [ ] **Step 3: Sync the website docs**

Run: `cd packages/website && pnpm run sync:docs && pnpm run sync:docs:check` Expected: check passes. Stage the resulting
`content/docs` changes.

- [ ] **Step 4: Update the kit skill**

In `packages/kit/content/skills/read-gamepad/SKILL.md`, extend the buttons bullet:

```
  `BTN_A/B/X/Y`, `BTN_L/R` (shoulders), `BTN_L2/R2` (triggers as buttons, gamepad only, down at 50% pull),
  `BTN_START`, `BTN_SELECT`; masks `BTN_ABXY`, `BTN_SHOULDER`, `BTN_TRIGGER`.
```

Run the kit drift check: `cd packages/kit && pnpm run test:unit` and the repo's kit-docs-drift script (see
`packages/kit/CLAUDE.md`, "docsReviewedAt"). If it reports `docsReviewedAt` behind `_api-history.json`, review the
shipped kit docs for any other staleness (run the `/kit-audit` skill), then bump `blit386.docsReviewedAt` by hand in
`packages/kit/package.json`.

- [ ] **Step 5: Verify formatting and spelling**

Run: `cd packages/blit386 && pnpm run format:check && pnpm run spellcheck` Expected: clean. If cspell trips on a token,
reword the prose instead of adding it to `cspell.json`.

- [ ] **Step 6: Commit**

```bash
git add packages/blit386/docs packages/website/content packages/kit
git commit -s -m "docs(api): document trigger buttons and sync kit and website" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Demo - trigger pips and R2 boost

**Files:**

- Modify: `packages/demos/src/gamepad-input.js`

**Interfaces:**

- Consumes: `BT.BTN_L2`, `BT.BTN_R2`, `BT.isDown`, `BT.isPressed` from Tasks 1-2.

The demos package has no test runner; verify by hand (Step 4).

- [ ] **Step 1: Add boost state and constants**

Near the other tuning constants (next to `POD_SPEED`) add:

```js
// R2 press gives the pod a short speed burst: BOOST_TICKS update ticks at BOOST_FACTOR x speed.
const BOOST_TICKS = 20;
const BOOST_FACTOR = 2;
```

In the `Demo` class fields, after `podColorIndex = 0;`:

```js
// Update ticks of boost left. R2 (the right trigger as a DIGITAL button) starts it.
boostTicks = 0;
```

- [ ] **Step 2: Start and apply the boost in update()**

After the Start-button reset block add:

```js
// R2 is the right trigger read as a button: BT.isPressed fires once per pull past
// half way, like any other button. (BT.getAxis below still gives the analog pull.)
if (BT.isPressed(BT.BTN_R2, PLAYER)) {
  this.boostTicks = BOOST_TICKS;
}
```

Replace the pod movement line with a boosted version:

```js
const speed = this.boostTicks > 0 ? POD_SPEED * BOOST_FACTOR : POD_SPEED;

if (this.boostTicks > 0) {
  this.boostTicks -= 1;
}

this.podPos = this.podPos.add(new Vector2i(Math.round(moveX * speed), Math.round(moveY * speed)));
```

(Keep the aim-cursor line as is.) Also reset `this.boostTicks = 0;` inside `resetPod()`.

- [ ] **Step 3: Add pips and update the header comment**

In `renderStatusPanel`, after `ui.pip('(A|B) mask', maskHeld);` add:

```js
// The triggers as DIGITAL buttons: held once pulled past half way. The Throttle
// meter below shows the same triggers as an ANALOG 0..1 pull.
ui.pip('L2 held', BT.isDown(BT.BTN_L2, PLAYER));
ui.pip('R2 held', BT.isDown(BT.BTN_R2, PLAYER));
```

In the file header: add to the controls list `- R2 (the right trigger as a button) gives the pod a short speed boost.`;
extend the API sentence with `BT.isDown(BT.BTN_L2, player)` / `BT.isPressed(BT.BTN_R2, player)`; add to "Try this":
`- Pull R2 half way and feel the boost; the "R2 held" pip lights at the same point the Throttle meter reaches half.`
Update the panel doc comment ("live button pips, raw stick axis numbers, and a trigger pressure meter") only if it no
longer reads correctly.

- [ ] **Step 4: Verify in the browser**

Run: `cd packages/demos && pnpm run dev` (via `preview_start` if a launch config exists), open the gamepad-input demo,
confirm it loads without console errors and the two new pips render. With a real gamepad: pulling a trigger lights its
pip at about half pull and R2 triggers a boost. Without a gamepad, say so explicitly in the PR instead of claiming the
trigger behavior was exercised.

- [ ] **Step 5: Lint and format**

Run: `cd packages/demos && pnpm run format:check && pnpm run lint && pnpm run spellcheck` Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/demos/src/gamepad-input.js
git commit -s -m "feat(demos): show digital trigger buttons in the gamepad demo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Full preflight and ticket hygiene

- [ ] **Step 1: Engine preflight**

Run: `cd packages/blit386 && pnpm run preflight` Expected: all gates pass.

- [ ] **Step 2: Demos, kit, website gates**

Run each package's `pnpm run preflight` (demos, kit, website) from its own directory, or the repo-level equivalent via
the `/preflight` skill with the matching package argument. Expected: all pass. A failure unrelated to this change goes
to a separate PR (green-the-build first), not into this one.

- [ ] **Step 3: Linear notes**

Comment on BT-124 and BT-123 (one line each): trigger bits `BTN_L2/R2` exist as of this branch, and `anyButton*` must
decide whether trigger bits count as "any button" - whichever lands second decides. Post only after the user approves
the wording.

- [ ] **Step 4: Open the PR**

Use the `/pr` skill (package argument `blit386`, scope `feat(api)`), body ends with the generated-with-Claude-Code line.
Land through a PR, never push to `main`.
