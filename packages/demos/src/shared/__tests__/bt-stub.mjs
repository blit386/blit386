/**
 * Test-only helper for controlling the real `BT` object from `blit386` while unit-testing
 * the shared UI kit (`ui-core.js`, `ui-widgets.js`, `ui-dpad.js`), all of which import `BT`
 * directly and have no way to receive a fake one.
 *
 * `BT` is a plain, unfrozen object literal (confirmed against `packages/blit386/src`: no
 * `Object.freeze`/`Object.seal` targets it anywhere), so `stubBt()` overwrites the handful
 * of members these three files actually touch and restores the original property
 * descriptors once the test finishes. This is preferred over Node's `node:test`
 * `mock.module()` API, which still requires the `--experimental-test-module-mocks` flag on
 * Node 22 and has open upstream bugs affecting ESM interop - not worth the fragility here.
 *
 * `drawRectFill`/`drawRect`/`drawNineSlice`/`systemPrint` MUST always be stubbed: an un-booted real `BT`
 * does not no-op them, it falls into a DOM-touching "engine not ready" error path. The
 * pointer/keyboard query methods are safe to leave un-stubbed (they default to `false`/
 * zero pre-boot), but stubbing them too gives every test full control over simulated input.
 */
import { BT } from 'blit386';

const STUB_KEYS = [
    'isPointerActive',
    'isDown',
    'isPressed',
    'pointerPos',
    'isKeyPressed',
    'displaySize',
    'drawRectFill',
    'drawRect',
    'drawNineSlice',
    'systemPrint',
];

const SAFE_DEFAULTS = {
    isPointerActive: () => false,
    isDown: () => false,
    isPressed: () => false,
    pointerPos: () => ({ x: 0, y: 0 }),
    isKeyPressed: () => false,
    displaySize: { x: 320, y: 180 },
    drawRectFill: () => {},
    drawRect: () => {},
    drawNineSlice: () => {},
    systemPrint: () => {},
};

/**
 * Installs safe, test-controllable defaults onto the real `BT` object, merging in
 * `overrides`, and registers a `t.after()` cleanup that restores every original property
 * descriptor - so no state ever leaks from one test to the next.
 *
 * @param {import('node:test').TestContext} t - The running test's context (for `t.after()`).
 * @param {Partial<typeof SAFE_DEFAULTS>} [overrides] - Per-key replacements, e.g.
 *   `{ isPointerActive: (slot) => slot === 0 }`.
 */
function stubBt(t, overrides = {}) {
    const merged = { ...SAFE_DEFAULTS, ...overrides };
    const originals = new Map();

    for (const key of STUB_KEYS) {
        originals.set(key, Object.getOwnPropertyDescriptor(BT, key));
        // eslint-disable-next-line security/detect-object-injection -- fixed STUB_KEYS list, not external input
        Object.defineProperty(BT, key, { value: merged[key], configurable: true, writable: true });
    }

    t.after(() => {
        for (const [key, descriptor] of originals) {
            Object.defineProperty(BT, key, descriptor);
        }
    });
}

export { stubBt };
