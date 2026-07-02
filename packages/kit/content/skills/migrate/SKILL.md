---
name: migrate
description:
  Update a game's code after a BLIT386 upgrade renamed parts of the API. Use this when 'blit upgrade' or 'blit migrate'
  reports names that need a closer look, when the game breaks after updating BLIT386, or when the user says 'update my
  game to the new version' or 'fix the renamed functions'.
---

# Update BLIT386 API names

Update a game after a BLIT386 upgrade renamed parts of the API: let `blit migrate` make the safe renames, then handle
the rest by hand.

## When to use

Use when `blit upgrade` or `blit migrate` reports names that "need a closer look," when the game breaks after a BLIT386
update, or when the user says "update my game to the new version" or "fix the renamed functions."

## Steps

1. Preview first: run `npx blit migrate`. It lists the renames it can make automatically and the ones that need review.
   Nothing is written yet.
2. Apply the safe ones: run `npx blit migrate --write`. This rewrites unambiguous names for you (for example
   `BT.buttonDown` -> `BT.isDown`, the `overlayEnabled` config flag -> `isOverlayEnabled`).
3. Handle each "needs a closer look" item by hand. These are common words, so the tool will not rewrite them blindly -
   they might belong to your own code. Only rename a call when the value on the left is the matching BLIT386 type:
   - `.equals(...)` -> `.isEqual(...)` on a `Vector2i`, `Rect2i`, or `Color32`
   - `.contains(...)` -> `.isContaining(...)` on a `Rect2i`
   - `.intersects(...)` -> `.isIntersecting(...)` on a `Rect2i`
   - `.tick(...)` -> `.fireIfElapsed(...)` on a `Timer`
   - Inside the `bootstrap(...)` options object only: `canvasId` -> `canvasID`, `containerId` -> `containerID`,
     `waitForDOMReady` -> `isWaitingForDOMReady`
4. Leave anything that is not a BLIT386 value alone. A plain array's `.contains(...)` or your own `tick()` method is not
   the engine – do not touch it.
5. Verify: run `npx blit run` and play the game, or `npx blit doctor` to check the setup. If something still breaks, use
   the "fix" skill.

## Notes

- The full, authoritative list of old -> new names is the engine's deprecation timeline:
  https://blit386.dev/docs/reference/deprecations
- `blit migrate` previews by default and only changes files with `--write`, so it is always safe to run and read first.
- If the project is not saved with git, save a copy before writing – `blit migrate --write` warns about this first.
