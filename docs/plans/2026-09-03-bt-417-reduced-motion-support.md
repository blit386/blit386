# BT-417: Reduced Motion Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let games and demos read the browser's `prefers-reduced-motion` preference through the `BT` namespace, react
to it changing at runtime, and have the engine's own built-in splash sequence respect it.

**Architecture:** A new `ReducedMotion` subsystem in `packages/blit386/src/core/`, structurally parallel to the existing
`Orientation` subsystem: a static-style `isPreferred` read (URL-flag override over the platform `matchMedia` read) plus
an instance `attach`/`detach`/`setOnChange` pair wired into `BTAPI.init()` / `stop()` / `hotReplaceDemo()` exactly where
orientation already is. The splash (`Splash.ts`) takes a `reducedMotion` boolean at `start()` and skips its fade effects
entirely, snapping palette values directly instead of animating; the handoff in `BTAPI.endPaletteCapture()` gets the
same instant-swap treatment.

**Tech Stack:** TypeScript, Vitest (`happy-dom` environment for DOM-dependent tests, default `node` environment for pure
resolvers), the existing `Palette` / `PaletteEffect` / `Splash` subsystems.

**Spec:**
[docs/decisions/2026-09-03-bt-417-reduced-motion-support-design.md](../decisions/2026-09-03-bt-417-reduced-motion-support-design.md)

## Global Constraints

- No `HardwareSettings` field for this feature – a demo's `configure()` must never be able to override the user's own
  accessibility preference. (Spec: Non-goals.)
- Boolean naming: the new `BT` getter must be `is*`-prefixed per `bt-api-getters.md` – `BT.isReducedMotionPreferred`,
  not `BT.prefersReducedMotion`.
- `@since 1.7.0` on every new public symbol (`BT.isReducedMotionPreferred`, `IBTDemo.onReducedMotionChange`) – matches
  the BT-417 issue's 1.7.0 milestone. Do not bump `BTAPI.VERSION_MINOR` – that happens at release time via
  `scripts/bump-lockstep.mjs`, not in this feature branch.
- `?reducedmotion` / `?noreducedmotion` valueless URL flags, `noreducedmotion` beating `reducedmotion` when both are
  present – mirrors `?nosplash` beating `?splash` in `src/splash/gating.ts`.
- 4-space indent, single quotes, trailing commas, named exports only, JSDoc required on every public and private member
  (`ts-file-structure.md`). Private fields/methods must not repeat the enclosing class or file name
  (`internal-scoped-naming.md`).
- Run `pnpm run lint:fix` after each task if `perfectionist/sort-classes` complains about member order – do not
  hand-sort class members.

---

## Task 1: `ReducedMotion` core subsystem

**Files:**

- Create: `packages/blit386/src/core/ReducedMotion.ts`
- Test: `packages/blit386/src/core/ReducedMotion.test.ts`

**Interfaces:**

- Produces: `ReducedMotion` class with `static get isPreferred(): boolean`,
  `attach(onChange: ((prefersReduced: boolean) => void) | null): void`,
  `setOnChange(onChange: ((prefersReduced: boolean) => void) | null): void`, `detach(): void`.
- Produces: exported pure functions `resolveReducedMotionPreferred(signals: ReducedMotionSignals): boolean` and
  `readReducedMotionUrlFlags(): ReducedMotionUrlFlags`, and exported types `ReducedMotionSignals`,
  `ReducedMotionUrlFlags` – for Task 4's URL-flag tests and any future reuse.
- Consumes: nothing from other tasks (this is the leaf subsystem).

- [ ] **Step 1: Write the failing tests for the pure resolver and URL-flag reader**

Create `packages/blit386/src/core/ReducedMotion.test.ts`:

```ts
/**
 * Unit tests for {@link ReducedMotion}.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readReducedMotionUrlFlags, ReducedMotion, resolveReducedMotionPreferred } from './ReducedMotion';

describe('resolveReducedMotionPreferred', () => {
  it('lets ?noreducedmotion beat ?reducedmotion when both are present', () => {
    expect(resolveReducedMotionPreferred({ urlForceOn: true, urlForceOff: true, platformPrefersReduced: true })).toBe(
      false,
    );
  });

  it('lets ?reducedmotion force it on regardless of the platform read', () => {
    expect(resolveReducedMotionPreferred({ urlForceOn: true, urlForceOff: false, platformPrefersReduced: false })).toBe(
      true,
    );
  });

  it('lets ?noreducedmotion force it off regardless of the platform read', () => {
    expect(resolveReducedMotionPreferred({ urlForceOn: false, urlForceOff: true, platformPrefersReduced: true })).toBe(
      false,
    );
  });

  it('falls back to the platform read when neither flag is present', () => {
    expect(resolveReducedMotionPreferred({ urlForceOn: false, urlForceOff: false, platformPrefersReduced: true })).toBe(
      true,
    );

    expect(
      resolveReducedMotionPreferred({ urlForceOn: false, urlForceOff: false, platformPrefersReduced: false }),
    ).toBe(false);
  });
});

describe('readReducedMotionUrlFlags', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'location');
  });

  function withSearch(search: string, body: () => void): void {
    Reflect.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { search },
    });

    body();
  }

  it('reports both flags false when there is no location', () => {
    expect(readReducedMotionUrlFlags()).toEqual({ forceOn: false, forceOff: false });
  });

  it('reads a valueless ?reducedmotion flag', () => {
    withSearch('?reducedmotion', () => {
      expect(readReducedMotionUrlFlags()).toEqual({ forceOn: true, forceOff: false });
    });
  });

  it('reads a valueless ?noreducedmotion flag', () => {
    withSearch('?noreducedmotion', () => {
      expect(readReducedMotionUrlFlags()).toEqual({ forceOn: false, forceOff: true });
    });
  });

  it('ignores an unrelated query string', () => {
    withSearch('?backend=software', () => {
      expect(readReducedMotionUrlFlags()).toEqual({ forceOn: false, forceOff: false });
    });
  });
});

describe('ReducedMotion.isPreferred', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'matchMedia');
    Reflect.deleteProperty(globalThis, 'location');
  });

  it('is false when matchMedia is unavailable', () => {
    expect(ReducedMotion.isPreferred).toBe(false);
  });

  it('reads the platform matchMedia result', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: matchMedia });

    expect(ReducedMotion.isPreferred).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm run test:unit -- ReducedMotion` (from `packages/blit386`) Expected: FAIL –
`Cannot find module './ReducedMotion'`

- [ ] **Step 3: Implement `ReducedMotion.ts`**

Create `packages/blit386/src/core/ReducedMotion.ts`:

```ts
/**
 * Detects the `prefers-reduced-motion` media feature and forwards changes.
 */

/** Callback invoked when the reduced-motion preference changes. */
type ChangeHandler = (prefersReduced: boolean) => void;

/** Valueless URL flag that forces reduced motion on. */
const FLAG_ON = 'reducedmotion';

/** Valueless URL flag that forces reduced motion off. Beats {@link FLAG_ON}. */
const FLAG_OFF = 'noreducedmotion';

/** CSS media query used to detect the platform's own preference. */
const MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

/** Inputs to {@link resolveReducedMotionPreferred}, gathered by {@link ReducedMotion.isPreferred}. */
export interface ReducedMotionSignals {
  /** Whether `?reducedmotion` is present in the query string. */
  urlForceOn: boolean;

  /** Whether `?noreducedmotion` is present in the query string. Beats `urlForceOn`. */
  urlForceOff: boolean;

  /** The platform's own `prefers-reduced-motion: reduce` match, from `matchMedia`. */
  platformPrefersReduced: boolean;
}

/** Which valueless reduced-motion flags the current URL carries. */
export interface ReducedMotionUrlFlags {
  /** `?reducedmotion` is present. */
  forceOn: boolean;

  /** `?noreducedmotion` is present. */
  forceOff: boolean;
}

/**
 * Resolves whether reduced motion is preferred, from already-gathered signals.
 *
 * An off switch should be unambiguous, so `?noreducedmotion` beats `?reducedmotion` when both
 * are present – the same rule `resolveSplashEnabled` follows for `?nosplash` / `?splash`.
 *
 * @param signals – See {@link ReducedMotionSignals}.
 * @returns `true` when reduced motion should be preferred.
 */
export function resolveReducedMotionPreferred(signals: ReducedMotionSignals): boolean {
  if (signals.urlForceOff) {
    return false;
  }

  if (signals.urlForceOn) {
    return true;
  }

  return signals.platformPrefersReduced;
}

/**
 * Reads the valueless reduced-motion flags from the current URL.
 *
 * Uses the `globalThis.location` guard idiom established by `BTAPI.getBackendQueryOverride`
 * and splash's `gating.ts`, so this stays safe in Node and SSR.
 *
 * @returns Which flags are present; both `false` when there is no location.
 */
export function readReducedMotionUrlFlags(): ReducedMotionUrlFlags {
  const search = typeof globalThis.location?.search === 'string' ? globalThis.location.search : '';

  if (!search) {
    return { forceOn: false, forceOff: false };
  }

  try {
    const params = new URLSearchParams(search);

    return { forceOn: params.has(FLAG_ON), forceOff: params.has(FLAG_OFF) };
  } catch (error) {
    console.warn('[BT] Failed to parse reduced-motion URL flags:', error);

    return { forceOn: false, forceOff: false };
  }
}

/**
 * Reads the platform's `prefers-reduced-motion: reduce` match.
 *
 * @returns `true` when the platform prefers reduced motion; `false` when it does not or
 *   `matchMedia` is unavailable (Node, SSR, old browsers).
 */
function readPlatformPreference(): boolean {
  if (typeof globalThis.matchMedia !== 'function') {
    return false;
  }

  try {
    return globalThis.matchMedia(MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Detects `prefers-reduced-motion` and forwards subsequent changes.
 *
 * Watches the platform media query for `change` events after {@link attach}. Silently
 * no-ops on platforms that do not expose `matchMedia`.
 */
export class ReducedMotion {
  /** Demo callback for preference changes, or null when the demo omitted the hook. */
  private onChange: ChangeHandler | null = null;

  /** Bound `change` handler so it can be removed in {@link detach}. */
  private readonly handleChange: (event: MediaQueryListEvent) => void;

  /** Live media query list this instance is listening on, or null when not attached. */
  private mediaQueryList: MediaQueryList | null = null;

  /**
   * Creates a reduced-motion subsystem. Call {@link attach} after a successful init.
   */
  constructor() {
    this.handleChange = (event: MediaQueryListEvent): void => {
      this.onChange?.(event.matches);
    };
  }

  /**
   * Whether reduced motion is currently preferred.
   *
   * Resolves the `?reducedmotion` / `?noreducedmotion` URL flags over the platform's own
   * `prefers-reduced-motion: reduce` match. Safe to call before {@link attach}.
   *
   * @returns `true` when reduced motion should be preferred.
   */
  public static get isPreferred(): boolean {
    const flags = readReducedMotionUrlFlags();

    return resolveReducedMotionPreferred({
      urlForceOn: flags.forceOn,
      urlForceOff: flags.forceOff,
      platformPrefersReduced: readPlatformPreference(),
    });
  }

  /**
   * Installs the `change` listener on the platform media query.
   *
   * No-ops when `matchMedia` is unavailable.
   *
   * @param onChange – Optional demo callback for subsequent preference changes.
   */
  public attach(onChange: ChangeHandler | null): void {
    if (typeof globalThis.matchMedia !== 'function') {
      return;
    }

    this.onChange = onChange;
    this.mediaQueryList = globalThis.matchMedia(MEDIA_QUERY);
    this.mediaQueryList.addEventListener('change', this.handleChange);
  }

  /**
   * Rebinds the demo callback for subsequent changes, without touching the live listener.
   *
   * Used when a hot reload swaps in a new demo instance ({@link BTAPI.hotReplaceDemo}) – the
   * `change` listener installed by {@link attach} closes over `this.onChange`, so without
   * this, preference changes would keep reaching the *previous* demo's bound handler.
   *
   * @param onChange – Replacement demo callback, or `null` to stop forwarding events.
   */
  public setOnChange(onChange: ChangeHandler | null): void {
    this.onChange = onChange;
  }

  /**
   * Removes the `change` listener.
   *
   * Safe to call repeatedly or when {@link attach} was never called (for example because
   * `matchMedia` is unavailable).
   */
  public detach(): void {
    this.mediaQueryList?.removeEventListener('change', this.handleChange);
    this.mediaQueryList = null;
    this.onChange = null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm run test:unit -- ReducedMotion` (from `packages/blit386`) Expected: PASS (all cases above)

- [ ] **Step 5: Write and run the attach/detach/change-forwarding tests (happy-dom)**

Append to `packages/blit386/src/core/ReducedMotion.test.ts` – add `// @vitest-environment happy-dom` as the second line
of the file (right after the file's JSDoc comment, before the imports), then add:

```ts
type FakeMediaQueryList = {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: (event: Event) => boolean;
};

function installMockMatchMedia(matches = false): { mql: FakeMediaQueryList; matchMedia: ReturnType<typeof vi.fn> } {
  const target = new EventTarget();

  const mql: FakeMediaQueryList = {
    matches,
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      target.addEventListener(event, listener);
    }),
    removeEventListener: vi.fn((event: string, listener: EventListener) => {
      target.removeEventListener(event, listener);
    }),
    dispatchEvent: (event: Event) => target.dispatchEvent(event),
  };

  const matchMedia = vi.fn(() => mql);

  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: matchMedia });

  return { mql, matchMedia };
}

describe('ReducedMotion instance', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'matchMedia');
  });

  it('does nothing on attach when matchMedia is unavailable', () => {
    const reducedMotion = new ReducedMotion();

    expect(() => reducedMotion.attach(null)).not.toThrow();
  });

  it('installs a change listener on attach', () => {
    const { mql } = installMockMatchMedia();
    const reducedMotion = new ReducedMotion();

    reducedMotion.attach(vi.fn());

    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('forwards change events with the new matches value', () => {
    const { mql } = installMockMatchMedia(false);
    const onChange = vi.fn();
    const reducedMotion = new ReducedMotion();

    reducedMotion.attach(onChange);

    const event = Object.assign(new Event('change'), { matches: true });
    mql.dispatchEvent(event);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('removes the listener on detach and stops forwarding', () => {
    const { mql } = installMockMatchMedia();
    const onChange = vi.fn();
    const reducedMotion = new ReducedMotion();

    reducedMotion.attach(onChange);
    reducedMotion.detach();

    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    mql.dispatchEvent(Object.assign(new Event('change'), { matches: true }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('rebinds the callback via setOnChange without touching the listener', () => {
    const { mql } = installMockMatchMedia();
    const oldOnChange = vi.fn();
    const newOnChange = vi.fn();
    const reducedMotion = new ReducedMotion();

    reducedMotion.attach(oldOnChange);
    reducedMotion.setOnChange(newOnChange);

    mql.dispatchEvent(Object.assign(new Event('change'), { matches: true }));

    expect(newOnChange).toHaveBeenCalledWith(true);
    expect(oldOnChange).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm run test:unit -- ReducedMotion` (from `packages/blit386`) Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/blit386/src/core/ReducedMotion.ts packages/blit386/src/core/ReducedMotion.test.ts
git commit -s -m "feat(core): add ReducedMotion detection subsystem

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `BT.isReducedMotionPreferred`, `IBTDemo.onReducedMotionChange`, and `BTAPI` hook wiring

**Files:**

- Modify: `packages/blit386/src/core/IBTDemo.ts` (add hook)
- Modify: `packages/blit386/src/core/BTAPI.ts` (import `ReducedMotion`, add field, wire `init`/`stop`/`hotReplaceDemo`,
  add `isReducedMotionPreferred()` method)
- Modify: `packages/blit386/src/BLIT386.ts` (add `BT.isReducedMotionPreferred` getter)
- Modify: `packages/blit386/src/core/BTAPI.test.ts` (new `describe('reduced motion', ...)` block)
- Modify: `packages/blit386/docs/api-core.md` (document the new getter + hook)
- Modify: `packages/blit386/.claude/rules/architecture.md` (add `ReducedMotion.ts` to the `core/` table)
- Modify: `packages/blit386/.claude/rules/bt-api-getters.md` (list the new getter in the Runtime bullet)

**Interfaces:**

- Consumes: `ReducedMotion` class from Task 1 (`import { ReducedMotion } from './ReducedMotion';`).
- Produces: `BTAPI.isReducedMotionPreferred(): boolean`, `BT.isReducedMotionPreferred: boolean`,
  `IBTDemo.onReducedMotionChange?(prefersReduced: boolean): void`. Task 4 calls `ReducedMotion.isPreferred` directly
  (not through this task's `BTAPI` method) since it needs the value before a `ReducedMotion` instance exists.

- [ ] **Step 1: Add the optional hook to `IBTDemo`**

In `packages/blit386/src/core/IBTDemo.ts`, update the interface's top JSDoc `@changed` list (around line 550-551) to add
a line:

```ts
 * @changed 1.4.0 Added optional {@link IBTDemo.onHotReload} hook.
 * @changed 1.7.0 Added optional {@link IBTDemo.onReducedMotionChange} hook.
```

Then, immediately after the existing `onOrientationChange` method (ends right before `onHotReload` begins), insert:

```ts
    /**
     * Optional hook called when the `prefers-reduced-motion` preference changes.
     *
     * The engine installs a listener after a successful `init()` and removes it on
     * `stop()`. Use this to reduce animation fidelity, disable screen-shake, or swap
     * transitions for instant cuts; the engine does not change your own draw calls for you.
     * Read the current value any time via {@link BT.isReducedMotionPreferred}.
     *
     * @since 1.7.0
     * @param prefersReduced – `true` when reduced motion is now preferred.
     */
    onReducedMotionChange?(prefersReduced: boolean): void;
```

- [ ] **Step 2: Write the failing `BTAPI` test**

In `packages/blit386/src/core/BTAPI.test.ts`, add a new `describe('reduced motion', ...)` block. Insert it right after
the closing `});` of the existing `describe('screen orientation', ...)` block (ends around line 1673, immediately before
`describe('assignTag', ...)`):

```ts
describe('reduced motion', () => {
  type FakeMediaQueryList = {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    dispatchEvent: (event: Event) => boolean;
  };

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'matchMedia');
  });

  function installMockMatchMedia(matches = false): FakeMediaQueryList {
    const target = new EventTarget();

    const mql: FakeMediaQueryList = {
      matches,
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        target.addEventListener(event, listener);
      }),
      removeEventListener: vi.fn((event: string, listener: EventListener) => {
        target.removeEventListener(event, listener);
      }),
      dispatchEvent: (event: Event) => target.dispatchEvent(event),
    };

    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => mql),
    });

    return mql;
  }

  function makeReducedMotionDemo(onReducedMotionChange?: (prefersReduced: boolean) => void): IBTDemo {
    const demo: IBTDemo = {
      ...makeMockDemo(),
      configure: vi.fn().mockReturnValue({
        isSplashEnabled: false,
        displaySize: new Vector2i(320, 240),
        drawingBufferSize: new Vector2i(640, 480),
        targetFPS: 60,
      }),
    };

    if (onReducedMotionChange !== undefined) {
      demo.onReducedMotionChange = onReducedMotionChange;
    }

    return demo;
  }

  it('exposes the current preference via isReducedMotionPreferred', () => {
    installMockMatchMedia(true);

    expect(BTAPI.instance.isReducedMotionPreferred()).toBe(true);
    expect(BT.isReducedMotionPreferred).toBe(true);
  });

  it('forwards preference change events to demo.onReducedMotionChange', async () => {
    const mql = installMockMatchMedia(false);
    const onReducedMotionChange = vi.fn();

    await BTAPI.instance.init(makeReducedMotionDemo(onReducedMotionChange), makeMockCanvas());

    mql.dispatchEvent(Object.assign(new Event('change'), { matches: true }));

    expect(onReducedMotionChange).toHaveBeenCalledWith(true);
  });

  it('removes the reduced-motion listener on stop', async () => {
    const mql = installMockMatchMedia();

    await BTAPI.instance.init(makeReducedMotionDemo(vi.fn()), makeMockCanvas());

    BTAPI.instance.stop();

    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm run test:unit -- BTAPI.test.ts -t "reduced motion"` (from `packages/blit386`) Expected: FAIL –
`BTAPI.instance.isReducedMotionPreferred is not a function` / `BT.isReducedMotionPreferred` is undefined

- [ ] **Step 4: Wire `ReducedMotion` into `BTAPI`**

In `packages/blit386/src/core/BTAPI.ts`:

1. Add the import, next to the existing `import { Orientation } from './Orientation';` (around line 56):

```ts
import { Orientation } from './Orientation';
import { ReducedMotion } from './ReducedMotion';
```

2. Add a private field, next to `private orientation: Orientation | null = null;` (around line 254):

```ts
    /** Screen orientation detection / lock subsystem. Created and attached during {@link init}. */
    private orientation: Orientation | null = null;

    /** Reduced-motion preference detection. Created and attached during {@link init}. */
    private reducedMotion: ReducedMotion | null = null;
```

3. In `init()`, right after the existing orientation attach block (around line 526-528):

```ts
this.orientation?.detach();
this.orientation = new Orientation();
this.orientation.attach(hwSettings.preferredOrientation ?? 'any', demo.onOrientationChange?.bind(demo) ?? null);

this.reducedMotion?.detach();
this.reducedMotion = new ReducedMotion();
this.reducedMotion.attach(demo.onReducedMotionChange?.bind(demo) ?? null);
```

4. In `stop()`, right after the existing orientation detach (around line 551-552):

```ts
this.orientation?.detach();
this.orientation = null;

this.reducedMotion?.detach();
this.reducedMotion = null;
```

5. In `hotReplaceDemo()`, right after the existing orientation rebind (around line 601):

```ts
this.demo = newDemo;
this.orientation?.setOnChange(newDemo.onOrientationChange?.bind(newDemo) ?? null);
this.reducedMotion?.setOnChange(newDemo.onReducedMotionChange?.bind(newDemo) ?? null);
```

6. Add a new public method next to `getScreenOrientation()` (around line 1007-1009):

```ts
    /**
     * Reports whether reduced motion is currently preferred.
     *
     * Resolves the `?reducedmotion` / `?noreducedmotion` URL flags over the platform's own
     * `prefers-reduced-motion: reduce` match. Does not require a successful init – reads the
     * platform API directly, mirroring {@link getScreenOrientation}.
     *
     * @since 1.7.0
     * @returns `true` when reduced motion should be preferred.
     */
    public isReducedMotionPreferred(): boolean {
        return ReducedMotion.isPreferred;
    }
```

- [ ] **Step 5: Add the `BT.isReducedMotionPreferred` getter**

In `packages/blit386/src/BLIT386.ts`, right after the `screenOrientation` getter (ends around line 797, right before the
`isAudioUnlocked` getter):

```ts
    /**
     * Whether reduced motion is currently preferred.
     *
     * Resolves `window.matchMedia('(prefers-reduced-motion: reduce)')`, or the
     * `?reducedmotion` / `?noreducedmotion` URL flags when either is present. Pair with
     * {@link IBTDemo.onReducedMotionChange} to react when the preference changes at runtime –
     * it is not fixed for the session, the same way {@link BT.screenOrientation} is not.
     *
     * @since 1.7.0
     * @returns `true` when reduced motion should be preferred.
     */
    get isReducedMotionPreferred(): boolean {
        return BTAPI.instance.isReducedMotionPreferred();
    },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm run test:unit -- BTAPI.test.ts -t "reduced motion"` (from `packages/blit386`) Expected: PASS

Then run the full suite to check nothing regressed:

Run: `pnpm run test:unit` (from `packages/blit386`) Expected: PASS

- [ ] **Step 7: Document the new API**

In `packages/blit386/docs/api-core.md`:

1. In the "Getters vs. configuration fields" bullet list (around line 276-283), add a bullet after the
   `screenOrientation` one:

```md
- `isReducedMotionPreferred` is runtime state too: resolves `prefers-reduced-motion` (or a `?reducedmotion` /
  `?noreducedmotion` URL override). See [Reduced motion](#reduced-motion).
```

2. Add a new `### Reduced motion` section right after the existing `### Screen orientation` section (after line 320,
   before `### Requested vs. active backend`):

````md
### Reduced motion

<Since symbol="BT.isReducedMotionPreferred" />
<Since symbol="IBTDemo.onReducedMotionChange" />

`BT.isReducedMotionPreferred` reads the browser's `prefers-reduced-motion` setting. After a successful `init()`, the
engine also listens for changes and calls optional `IBTDemo.onReducedMotionChange(prefersReduced)` when the demo
implements it – the preference can change while your game is running, the same way orientation can.

Reducing your own animation fidelity, screen-shake, or particle counts is a demo concern – the engine only supplies the
getter and the change hook. The built-in splash does respect it; see
[The splash and reduced motion](guide-splash.md#reduced-motion).

```ts twoslash
import { BT, type HardwareSettings, type IBTDemo } from 'blit386';

class Demo implements IBTDemo {
  onReducedMotionChange(prefersReduced: boolean): void {
    console.log('reduced motion:', prefersReduced, BT.isReducedMotionPreferred);
  }

  async init(): Promise<boolean> {
    return true;
  }

  update(): void {}

  render(): void {}
}
```

`?reducedmotion` and `?noreducedmotion` are valueless URL flags for testing either state without changing OS settings or
devtools media emulation; `?noreducedmotion` wins when both are present.
````

- [ ] **Step 8: Update the architecture table**

In `packages/blit386/.claude/rules/architecture.md`, add a line right after the `Orientation.ts` row in the `core/`
section:

```text
    Orientation.ts          # Screen orientation detection + optional lock (HardwareSettings.preferredOrientation, IBTDemo.onOrientationChange, BT.screenOrientation)
    ReducedMotion.ts         # prefers-reduced-motion detection (IBTDemo.onReducedMotionChange, BT.isReducedMotionPreferred)
```

- [ ] **Step 9: List the new getter in the API-getters naming rule**

`scripts/check-api-getters-drift.mjs` (wired into `pnpm run api:getters:check`, part of `preflight`) fails when a public
`BT.*` getter has no inline-code mention anywhere in `.claude/rules/bt-api-getters.md`. In
`packages/blit386/.claude/rules/bt-api-getters.md`, find the "Runtime:" bullet under "## Prefer getters (no
parentheses)" – it currently ends `..., isDevMode, splashState, isSplashVisible` – and add the new getter to the list,
plus one clause describing it (matching the style of the `screenOrientation` clause already there):

```md
Runtime: `activeBackend`, `camera`, `palette`, `random`, `systemFont`, `isAudioUnlocked`, `isMusicPlaying`,
`screenOrientation`, `loadingAssetsCount`, `isDevMode`, `splashState`, `isSplashVisible`, `isReducedMotionPreferred` –
`activeBackend` is `null` before init or on failure; `isAudioUnlocked` is `false` until the first user gesture resumes
the audio context; `isMusicPlaying` is `true` while the music player has a live current track; `screenOrientation` is
the current `screen.orientation.type` string, or `null` when the API is unavailable; `loadingAssetsCount` is the
combined count of in-flight `AssetLoader` + `AudioClip` loads (poll for a loading screen); `random` is a live,
time-seeded `Random` (always present; reseed with `randomSeed`); `systemFont` is the same live `BitmapFont` instance
`BT.systemPrint` draws with – throws if read before `BT.init()` finishes creating it (mirrors `palette`); `isDevMode`
resolves an explicit override, then the `blit386/vite` plugin's build-time flag, then live hot-reload activity – it is
Tier A below, not Tier B, because no `HardwareSettings` field mirrors it, so it reads as a runtime environment query
rather than a configure flag; `splashState` is the five-state splash machine's current state (`'disabled'` when gated
off); `isSplashVisible` is the one-term derived query game code should prefer over `splashState`;
`isReducedMotionPreferred` resolves the platform's `prefers-reduced-motion` match (or a `?reducedmotion` /
`?noreducedmotion` URL override) and needs no init either, mirroring `screenOrientation`
```

Preserve every word of the existing bullet – this is an insertion of `isReducedMotionPreferred` into the name list and
one clause appended to the end of the trailing prose, not a rewrite of the surrounding text.

- [ ] **Step 10: Regenerate API history**

Run: `pnpm run api:history` (from `packages/blit386`)

If running in a tag-less checkout (see `.claude/rules/environment-gotchas.md`), restore the committed `versions` block
in `docs/_api-history.json` afterward – the only real diff should be the new `BT.isReducedMotionPreferred` and
`IBTDemo.onReducedMotionChange` symbol entries.

- [ ] **Step 11: Commit**

```bash
git add packages/blit386/src/core/IBTDemo.ts packages/blit386/src/core/BTAPI.ts packages/blit386/src/core/BTAPI.test.ts \
    packages/blit386/src/BLIT386.ts packages/blit386/docs/api-core.md packages/blit386/docs/_api-history.json \
    packages/blit386/.claude/rules/architecture.md packages/blit386/.claude/rules/bt-api-getters.md
git commit -s -m "feat(api): add BT.isReducedMotionPreferred and IBTDemo.onReducedMotionChange

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Splash respects reduced motion

**Files:**

- Modify: `packages/blit386/src/splash/Splash.ts`
- Modify: `packages/blit386/src/splash/Splash.test.ts`

**Interfaces:**

- Consumes: nothing new (works entirely with the fake-clock harness already in `Splash.test.ts`; the `reducedMotion`
  flag is a plain boolean parameter, not a `ReducedMotion` import).
- Produces: `Splash.start(reducedMotion: boolean = false): void` – the default keeps every existing `splash.start()`
  call site (including every current test) compiling and behaving unchanged. Task 4 passes `true`/`false` explicitly.

- [ ] **Step 1: Write the failing tests**

In `packages/blit386/src/splash/Splash.test.ts`, add `RAMP_LAST_SLOT` to the existing import from `./constants` (line
10):

```ts
import {
  FADE_IN_MS,
  FADE_OUT_MS,
  GLITCH_MAX_INTENSITY,
  HOLD_MIN_MS,
  RAMP_LAST_SLOT,
  RAMP_PALETTE_SIZE,
} from './constants';
```

Then add a new `describe` block after the closing `});` of the existing `describe('Splash state machine', ...)` block
(append to the end of the file):

```ts
describe('Splash reduced motion', () => {
  let now = 0;
  let splash: Splash;

  beforeEach(() => {
    now = 0;
    splash = new Splash({}, () => now);
  });

  function step(ms: number): void {
    now += ms;
    splash.advance();
  }

  it('shows the fully lit ramp immediately, with no fade-in wait', () => {
    splash.start(true);
    step(1);

    expect(splash.state).toBe('shown');
    expect(splash.palette.get(RAMP_LAST_SLOT).r).toBe(255);
  });

  it('still waits on init() before collapsing the hold, same as a manual skip', () => {
    splash.start(true);
    step(1);
    step(HOLD_MIN_MS * 10);

    expect(splash.state).toBe('shown');
  });

  it('collapses straight to done once init settles, with an instant black palette swap', () => {
    splash.start(true);
    step(1);
    splash.markInitSettled();
    step(1);

    expect(splash.state).toBe('done');
    expect(splash.palette.get(RAMP_LAST_SLOT).r).toBe(0);
  });

  it('does not animate through the fade-out duration', () => {
    splash.start(true);
    step(1);
    splash.markInitSettled();

    // One tiny step is enough to reach done; a real fade would still be mid-transition
    // for FADE_OUT_MS - 1 more milliseconds.
    step(1);

    expect(splash.state).toBe('done');
  });

  it('defaults to the animated path when start() is called with no argument', () => {
    splash.start();
    step(1);

    expect(splash.state).toBe('fadingIn');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm run test:unit -- Splash.test.ts -t "reduced motion"` (from `packages/blit386`) Expected: FAIL –
`splash.start(true)` – TypeScript will fail to compile since `start()` currently takes no parameters (a type error,
which Vitest surfaces as a failed test run).

- [ ] **Step 3: Implement the reduced-motion behavior in `Splash.ts`**

Add a new private field, next to `private isSkipped: boolean = false;` (around line 53):

```ts
    /** Whether the viewer asked to skip. Collapses the fade-in and the minimum hold. */
    private isSkipped = false;

    /** Whether reduced motion is preferred for this run. Set once, in {@link start}. */
    private isReducedMotion = false;
```

Replace the `start()` method (around lines 167-174):

```ts
    /**
     * Begins the splash, entering `fadingIn` and starting the fade up from black.
     *
     * Calling this more than once is a no-op, so a re-entrant caller cannot
     * restart a finished splash.
     *
     * @param reducedMotion – When `true`, skips the fade-in effect entirely (the palette
     *   snaps straight to the fully lit ramp) and collapses the minimum hold the same way a
     *   manual {@link skip} does, without waiting for a press.
     */
    public start(reducedMotion: boolean = false): void {
        if (this.currentState !== 'disabled') {
            return;
        }

        this.isReducedMotion = reducedMotion;
        this.enter('fadingIn', this.timeProvider());

        if (reducedMotion) {
            this.live.copyFrom(this.ramp);
            this.isSkipped = true;
        } else {
            this.effects.add(new ExposureFadeEffect(this.live, this.ramp, FADE_IN_MS));
        }
    }
```

Replace the `leaveShown()` method (around lines 360-379):

```ts
    /**
     * Leaves `shown` for `fadingOut` once the hold is satisfied.
     *
     * The hold has a minimum but no maximum, so this refuses to move until the
     * game's `init()` has settled however long a skip has been waiting.
     *
     * @param now – Current clock reading in milliseconds.
     * @param elapsed – Milliseconds spent in `shown`.
     * @returns `true` when the state changed.
     */
    private leaveShown(now: number, elapsed: number): boolean {
        if (!this.isInitSettled) {
            return false;
        }

        if (this.isSkipped) {
            this.enter('fadingOut', now);
        } else if (elapsed >= HOLD_MIN_MS) {
            this.enter('fadingOut', this.stateEnteredAt + HOLD_MIN_MS);
        } else {
            return false;
        }

        // A skip can leave the fade-in still running. Clearing first stops the two
        // effects fighting over the same palette for the rest of the fade-in's duration.
        this.effects.clear();

        if (this.isReducedMotion) {
            // Instant swap: snap to black and immediately back-date entry time so the very
            // next transition() check sees the fade-out duration as already elapsed.
            this.live.copyFrom(createBlackened(this.live));
            this.stateEnteredAt -= FADE_OUT_MS;
        } else {
            this.effects.add(new ExposureFadeEffect(this.live, createBlackened(this.live), FADE_OUT_MS));
        }

        return true;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm run test:unit -- Splash.test.ts` (from `packages/blit386`) Expected: PASS – both the new reduced-motion tests
and every pre-existing test in the file (the default parameter keeps `splash.start()` behaving exactly as before).

- [ ] **Step 5: Commit**

```bash
git add packages/blit386/src/splash/Splash.ts packages/blit386/src/splash/Splash.test.ts
git commit -s -m "feat(splash): skip fade animations when reduced motion is preferred

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Thread reduced motion through `BTAPI`'s splash integration

**Files:**

- Modify: `packages/blit386/src/core/BTAPI.ts` (`runDemoInitBehindSplash`, `endPaletteCapture`)
- Modify: `packages/blit386/src/core/BTAPI.test.ts` (`BTAPI splash palette capture`, `BTAPI splash lifecycle in init`
  describe blocks)
- Modify: `packages/blit386/docs/guide-splash.md`

**Interfaces:**

- Consumes: `ReducedMotion.isPreferred` (Task 1), `Splash.start(reducedMotion)` (Task 3).
- Produces: `BTAPI.endPaletteCapture(reducedMotion: boolean = false): void` – the default keeps the existing non-splash
  `paletteSet()` call path (which never passes an argument) unchanged.

- [ ] **Step 1: Write the failing tests**

In `packages/blit386/src/core/BTAPI.test.ts`, inside `describe('BTAPI splash palette capture', ...)`, add a test right
after `it('installs the captured palette blackened at handoff', ...)` (around line 2991):

```ts
it('installs the captured palette immediately when reduced motion is preferred', () => {
  armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

  const gamePalette = new Palette(16);
  gamePalette.set(1, Color32.white);

  BTAPI.instance.setPalette(gamePalette);
  BTAPI.instance.endPaletteCapture(true);

  const live = renderPalette();

  expect(live).toBe(gamePalette);
  expect(live?.get(1).r).toBe(255);
  expect(activeEffectCount()).toBe(0);
});

it('snaps the splash palette to black immediately when the game never set one and reduced motion is preferred', () => {
  const splashPalette = new Palette(RAMP_PALETTE_SIZE);
  splashPalette.set(16, Color32.white);

  armWithSplashPalette(splashPalette);

  BTAPI.instance.endPaletteCapture(true);

  expect(splashPalette.get(16).r).toBe(0);
  expect(activeEffectCount()).toBe(0);
});
```

Then, inside `describe('BTAPI splash lifecycle in init', ...)`, add a nested `describe('reduced motion', ...)` block
right before the closing `});` of the outer describe (after the last existing `it(...)` in that block):

```ts
describe('reduced motion', () => {
  function installMockMatchMedia(matches: boolean): void {
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'matchMedia');
  });

  it('installs the game palette with no animated handoff', async () => {
    installMockMatchMedia(true);

    const gamePalette = new Palette(16);
    gamePalette.set(1, Color32.white);

    await BTAPI.instance.init(
      makeSplashDemo({ isSplashEnabled: true }, () => {
        BTAPI.instance.setPalette(gamePalette);
      }),
      makeMockCanvas(),
    );

    expect(renderPalette()).toBe(gamePalette);
    expect(gamePalette.get(1).r).toBe(255);
  });

  it('skips the WebGPU dissolve', async () => {
    installMockMatchMedia(true);

    const enableDissolveSpy = vi.spyOn(Splash.prototype, 'enableDissolve');

    await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

    expect(enableDissolveSpy).not.toHaveBeenCalled();
  });

  it('still runs the WebGPU dissolve when reduced motion is not preferred', async () => {
    installMockMatchMedia(false);

    const enableDissolveSpy = vi.spyOn(Splash.prototype, 'enableDissolve');

    await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

    expect(enableDissolveSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm run test:unit -- BTAPI.test.ts -t "reduced motion"` (from `packages/blit386`) Expected: FAIL –
`endPaletteCapture(true)` is a type error (no parameter yet); the lifecycle tests fail because the palette is still
installed blackened-then-faded and the dissolve is still enabled regardless of `matchMedia`.

- [ ] **Step 3: Implement the `BTAPI` changes**

In `packages/blit386/src/core/BTAPI.ts`, replace `endPaletteCapture()` (around lines 1127-1152):

```ts
    /**
     * Disarms capture and performs the handoff into the game's palette.
     *
     * Installs the captured palette blackened, then brings it up with an exposure
     * fade so the splash fading down and the game fading up read as one continuous
     * in-camera move rather than a cut. When the game never called
     * `BT.paletteSet()` during `init()`, the splash's own palette is faded to black
     * instead, so the screen is black rather than showing stale splash grays until
     * the game sets a palette of its own.
     *
     * Palette effects started during capture are dropped: they hold snapshots of a
     * palette that is about to be replaced wholesale.
     *
     * @param reducedMotion – When `true`, skips the exposure fade entirely and installs the
     *   target colors immediately – no intermediate blackened state, no animation.
     */
    public endPaletteCapture(reducedMotion: boolean = false): void {
        const captured = this.pendingPalette;

        this.isCapturingPalette = false;
        this.pendingPalette = null;

        if (!captured) {
            const current = this.palette;

            if (current) {
                this.paletteEffects.clear();

                if (reducedMotion) {
                    current.copyFrom(createBlackened(current));
                } else {
                    this.paletteEffects.add(new ExposureFadeEffect(current, createBlackened(current), HANDOFF_FADE_MS));
                }
            }

            return;
        }

        if (reducedMotion) {
            this.installPalette(captured);

            return;
        }

        const target = captured.clone();

        for (let slot = 1; slot < captured.size; slot++) {
            captured.set(slot, Color32.black);
        }

        this.installPalette(captured);
        this.paletteEffects.add(new ExposureFadeEffect(captured, target, HANDOFF_FADE_MS));
    }
```

Then update `runDemoInitBehindSplash()` (around lines 2217-2273) to read the preference once and thread it through:

```ts
    private async runDemoInitBehindSplash(demo: IBTDemo, splash: Splash, displaySize: Vector2i): Promise<boolean> {
        const reducedMotion = ReducedMotion.isPreferred;

        // Install it as the active palette, not just on the renderer: endPaletteCapture()
        // reads this.palette to fade the splash down when the game never sets one of its
        // own, and the two must not disagree while the splash is the thing on screen.
        this.installPalette(splash.palette);
        this.beginPaletteCapture();
        splash.attachSkipInput(globalThis);
        splash.start(reducedMotion);

        // Gate on activeBackend, not requestedBackend: this is a runtime feature
        // gate, and the software renderer throws on post-process. Reduced motion skips the
        // dissolve entirely – it is a simulated glitch effect, exactly the category of motion
        // the preference exists to suppress.
        if (this.activeBackend === 'webgpu' && !reducedMotion) {
            splash.enableDissolve();

            const dissolve = splash.dissolveEffect;

            if (dissolve) {
                this.effectAdd(dissolve);
            }
        }

        // markInitSettled fires on failure too, so a failed init() cannot leave the
        // hold running forever.
        const initPromise = this.runDemoInit(demo).then((ok) => {
            splash.markInitSettled();

            return ok;
        });

        try {
            // allSettled, not all: a splash frame that throws must not tear the capture
            // down while the game's init() is still running, or a paletteSet() landing
            // after the teardown would apply straight to the screen mid-handoff.
            const [initSettled, splashSettled] = await Promise.allSettled([initPromise, this.runSplash(displaySize)]);

            if (splashSettled.status === 'rejected') {
                throw splashSettled.reason;
            }

            return initSettled.status === 'fulfilled' ? initSettled.value : false;
        } finally {
            // In a finally so a throw from either side still tears the splash down.
            // Leaving capture armed would make every later BT.paletteSet() a no-op.
            splash.detachSkipInput();

            const dissolve = splash.dissolveEffect;

            if (dissolve) {
                // By exact reference, never effectClear(): the game's init() ran
                // concurrently and may have registered effects of its own.
                this.effectRemove(dissolve);
            }

            this.endPaletteCapture(reducedMotion);
            this.drainInputEdges();
        }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm run test:unit -- BTAPI.test.ts` (from `packages/blit386`) Expected: PASS – the new tests and every
pre-existing `BTAPI splash palette capture` / `BTAPI splash lifecycle in init` test (the
`reducedMotion: boolean = false` defaults keep every un-flagged call site behaving exactly as before).

Then run the full unit suite:

Run: `pnpm run test:unit` (from `packages/blit386`) Expected: PASS

- [ ] **Step 5: Document the splash behavior**

In `packages/blit386/docs/guide-splash.md`, add a new `## Reduced motion` section right before `## Backends` (after line
141, the end of the "The skip" section):

```md
## Reduced motion

<Since symbol="BT.isReducedMotionPreferred" />

When `BT.isReducedMotionPreferred` is `true` at splash start, the splash shows a static hold instead of animating:

- No fade-in – the ramp and logo appear at full brightness immediately.
- The minimum hold still collapses the same way a manual skip does (see [The skip](#the-skip)), but it still waits on
  `init()` – the splash doubling as a loading screen does not change.
- The handoff into your game's palette is an instant swap, not the animated exposure fade described in
  [The palette handoff](#the-palette-handoff) – no intermediate blackened frame.
- The WebGPU dissolve is skipped entirely. It is a simulated glitch effect – exactly the category of motion
  `prefers-reduced-motion` exists to suppress – rather than a decoration to tone down.

You do not opt into any of this. It follows `BT.isReducedMotionPreferred` automatically, which itself follows the
platform's `prefers-reduced-motion` setting (or the `?reducedmotion` / `?noreducedmotion` URL overrides – see
[API: Core](api-core.md#reduced-motion)).
```

- [ ] **Step 6: Regenerate API history (if new symbols were added)**

Run: `pnpm run api:history` (from `packages/blit386`)

Restore the committed `versions` block in `docs/_api-history.json` if running in a tag-less checkout (see
`.claude/rules/environment-gotchas.md`). Expect no `symbols` diff here – Task 2 already added the only two new public
symbols this feature introduces.

- [ ] **Step 7: Commit**

```bash
git add packages/blit386/src/core/BTAPI.ts packages/blit386/src/core/BTAPI.test.ts packages/blit386/docs/guide-splash.md
git commit -s -m "feat(splash): thread reduced motion through the BTAPI handoff and dissolve gate

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Final verification

**Files:** none created or modified – verification only.

- [ ] **Step 1: Run the full preflight gate**

Run: `pnpm run preflight` (from `packages/blit386`)

This covers format, lint (including `perfectionist/sort-classes` member order and the `is*`/`has*` boolean-naming ESLint
rules), typecheck, spellcheck, knip, `api:since:check`, `api:history:check`, and the unit/integration test suites. Fix
anything it flags before moving on – in particular, watch for:

- `api:since:check` failing if the `@since 1.7.0` tags from Task 2 are missing or malformed.
- `spellcheck` flagging `reducedmotion` / `noreducedmotion` (the bare URL-flag literals) or `matchMedia` – add
  legitimate new words to the root `cspell.json` if so.
- Class member order in `ReducedMotion.ts` and the modified sections of `BTAPI.ts` / `Splash.ts` – run
  `pnpm run lint:fix` if `perfectionist/sort-classes` complains, then re-check the diff for anything it moved that
  should not have moved.

- [ ] **Step 2: Run the visual regression suite if it exists for splash-adjacent changes**

This feature changes splash timing and palette values but not pixel-level rendering of any primitive, sprite, or
post-process effect – `/test blit386 visual` is not expected to be needed, but run it if `preflight` or CI flags a
`.png` snapshot diff:

Run: `pnpm run test:visual` (from `packages/blit386`), only if triggered.

- [ ] **Step 3: Manual smoke check with `?reducedmotion`**

Run: `pnpm run dev` (from `packages/demos`, or whichever demo package exercises the splash)

Open a demo with `?splash&reducedmotion` in the URL (forces the splash on in a dev build, forces reduced motion on) and
confirm: the logo appears immediately with no fade-in, holds statically, and cuts straight to the game with no visible
dissolve or color fade. Then reload with `?splash&noreducedmotion` and confirm the original animated sequence still
plays.

- [ ] **Step 4: Final commit (if Step 1 produced fixes)**

```bash
git add -A
git commit -s -m "chore(blit386): address preflight fixes for reduced motion support

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Skip this step if `preflight` was clean and nothing changed.
