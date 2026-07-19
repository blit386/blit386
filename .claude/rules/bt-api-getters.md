# BT API: getters vs methods

Canonical reference: [CLAUDE.md](../../CLAUDE.md) (BT API: getters vs methods, Boolean naming).

Quick rules when changing `src/BLIT386.ts` or demos:

- Getter: zero-arg read-only snapshot (`BT.displaySize`, `BT.targetFPS`, `BT.ticks`, `BT.activeBackend`)
- Method: mutation, parameters, or async (`BT.cameraSet`, `BT.pointerPos(0)`, `await BT.captureFrame()`)
- Never reintroduce `BT.displaySize()` / `BT.getActiveBackend()`-style call syntax for these reads

## Getter lists

| Category                                         | Members                                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Configure-time (mirror `HardwareSettings` names) | `displaySize`, `drawingBufferSize`, `targetFPS`                                                                                                                                      |
| Derived                                          | `outputSize` (`drawingBufferSize ?? displaySize`; no `HardwareSettings` field)                                                                                                       |
| Configure-time (backend)                         | `requestedBackend` (mirrors `HardwareSettings.backend`; `null` before init)                                                                                                          |
| Loop timing                                      | `deltaSeconds`, `timeSeconds`, `ticks`, `renderAlpha`                                                                                                                                |
| Runtime state                                    | `activeBackend`, `camera`, `palette`, `isAudioUnlocked`, `isMusicPlaying`, `screenOrientation` (`activeBackend` `null` before init; `screenOrientation` `null` when API unavailable) |
| Per-frame input                                  | `pointerScrollDelta`, `inputString`, `gamepadCount`                                                                                                                                  |

`Vector2i` getters return a clone per read. `activeBackend` is what actually started after fallback, not
`configure().backend`. `palette` is a live reference – mutating slots affects rendering on the next frame.

## Boolean queries on `BT` (Tier A; always methods)

- Hold: `isDown(...)`, `isKeyDown(...)`
- Edge: `isPressed(...)`, `isReleased(...)`, `isKeyPressed(...)`, `isKeyReleased(...)`
- Pointer: `isPointerActive(slot?)`
- Internal input classes mirror the same names (`isButtonDown`, `isKeyDown`, …). No embedded second `Is`
  (`\bis[A-Za-z]+Is[A-Z]`).

## Configure flags (Tier B)

Mirror `HardwareSettings` / `BootstrapOptions` field names: `isOverlayEnabled`, `isOverlayVisibleAtStart`,
`isDetectingDroppedFrames`, `isWaitingForDOMReady`, `canvasID`, `containerID`. Use `-ing` for ongoing behavior flags.

## Side-effect booleans (Tier C)

Not `is*`: `Timer.fireIfElapsed()`, `remove(): boolean`, `init(): Promise<boolean>`.

## Naming when adding getters

- Match `HardwareSettings` field name exactly for configure values (`targetFPS`, not `fps` or `targetFps`)
- Use a derived getter when the value is computed from configure fields (`outputSize`); do not add a matching field
- Use a runtime-descriptive name when no configure field exists (`activeBackend`, not `renderer`)

Cursor: `.cursor/rules/bt-api-getters.mdc` (always applied in this repo).
