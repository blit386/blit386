/**
 * Runs the JavaScript starter's update() against a fake `blit386` module, to check which pointer slot steers the
 * paddle. The engine puts the mouse on slot 0 and fingers on slots 1-3, so a starter that reads slot 0 only never
 * moves on a phone, and a mouse resting over the canvas must not switch the keyboard off.
 */

import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { scaffoldNoAgent } from './helpers.mjs';

// A stand-in for the engine: just enough of BT for init() and update(), with the pointer and key state the tests set.
const FAKE_BLIT386 = `
export class Vector2i { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
export class Rect2i {
    constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); }
    isIntersecting(o) { return this.x < o.x + o.w && o.x < this.x + this.w && this.y < o.y + o.h && o.y < this.y + this.h; }
}
export class Color32 { constructor(r, g, b) { Object.assign(this, { r, g, b }); } }
export const input = { held: new Set(), active: new Set(), pos: [], delta: [], keys: new Set() };
export const BT = {
    BTN_LEFT: 1, BTN_RIGHT: 2, BTN_POINTER_A: 1024,
    displaySize: new Vector2i(320, 240), ticks: 1,
    random: { int: () => 0 },
    paletteCreate: () => ({ set() {} }), paletteSet() {}, inputMap() {}, randomSeed() {},
    isPointerActive: (slot = 0) => input.active.has(slot),
    pointerPos: (slot = 0) => input.pos[slot] ?? new Vector2i(),
    pointerDelta: (slot = 0) => input.delta[slot] ?? new Vector2i(),
    isDown: (button, slot = 0) => (button === BT.BTN_POINTER_A ? input.held.has(slot) : slot === 0 && input.keys.has(button)),
};
export let Game;
export function bootstrap(game) { Game = game; }
`;

const work = mkdtempSync(join(tmpdir(), 'cbt-starter-input-'));
after(() => rmSync(work, { recursive: true, force: true }));

const project = scaffoldNoAgent(work, 'input-game');
const fakeDir = join(project, 'node_modules', 'blit386');
mkdirSync(fakeDir, { recursive: true });
writeFileSync(
    join(fakeDir, 'package.json'),
    JSON.stringify({ name: 'blit386', type: 'module', exports: './index.js' }),
);
writeFileSync(join(fakeDir, 'index.js'), FAKE_BLIT386);

globalThis.window = { location: { search: '' } };
await import(pathToFileURL(join(project, 'src', 'game.js')).href);
const engine = await import(pathToFileURL(join(fakeDir, 'index.js')).href);
const { BT, input, Vector2i } = engine;

/** A fresh game after init(), with no pointer or key down. */
async function freshGame() {
    input.held.clear();
    input.active.clear();
    input.keys.clear();
    input.pos.length = 0;
    input.delta.length = 0;

    const game = new engine.Game();
    await game.init();

    return game;
}

test('a finger on touch slot 1 moves the paddle', async () => {
    const game = await freshGame();
    input.active.add(1);
    input.held.add(1);
    input.pos[1] = new Vector2i(100, 200);

    game.update();

    assert.equal(game.paddlePos.x, 100 - 24, 'the paddle centers under the finger');
});

test('a mouse resting over the canvas leaves the arrow keys working', async () => {
    const game = await freshGame();
    const startX = game.paddlePos.x;
    input.active.add(0);
    input.pos[0] = new Vector2i(10, 10);
    input.delta[0] = new Vector2i(0, 0);
    input.keys.add(BT.BTN_RIGHT);

    game.update();

    assert.ok(game.paddlePos.x > startX, 'the right arrow moves the paddle while the mouse rests');
});

test('a mouse that moves steers the paddle', async () => {
    const game = await freshGame();
    input.active.add(0);
    input.pos[0] = new Vector2i(60, 10);
    input.delta[0] = new Vector2i(3, 0);

    game.update();

    assert.equal(game.paddlePos.x, 60 - 24);
});
