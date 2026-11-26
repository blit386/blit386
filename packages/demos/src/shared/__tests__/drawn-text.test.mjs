/**
 * Unit tests for the last-frame drawn-text readout: the BT.systemPrint tap, its frame boundary, the kit's
 * source tag, and the merge with the engine's dev-only overlay rows.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { BT } from 'blit386';

import { installTextTap, readDrawnText, setTextSource, TEXT_SOURCE_KIT, TEXT_SOURCE_SYSTEM } from '../drawn-text.js';
import { CMD_TEXT, UI_ANCHORS } from '../ui-core.js';
import { stubBt } from './bt-stub.mjs';
import { createReadyContext } from './ui-test-helpers.mjs';

/** A fake `BT` that remembers what really reached the draw call. */
function fakeBt(camera = { x: 0, y: 0 }) {
    const drawn = [];

    return { drawn, camera, systemPrint: (pos, color, text) => drawn.push({ x: pos.x, y: pos.y, color, text }) };
}

/** Lets the microtask that closes a frame run, like the end of a real render task. */
const endOfTask = () => Promise.resolve();

afterEach(() => {
    delete globalThis.__btOverlayRows;
    setTextSource(TEXT_SOURCE_SYSTEM);
});

describe('installTextTap', () => {
    it('draws every string exactly as before and records it with its display position', async () => {
        const bt = fakeBt();

        installTextTap(bt);
        bt.systemPrint({ x: 7, y: 9 }, 250, 'paletteFadeRange:');
        await endOfTask();

        assert.deepEqual(bt.drawn, [{ x: 7, y: 9, color: 250, text: 'paletteFadeRange:' }]);
        assert.deepEqual(readDrawnText(), [
            { source: TEXT_SOURCE_SYSTEM, text: 'paletteFadeRange:', x: 7, y: 9, color: 250 },
        ]);
    });

    it('copies the position, since the kit reuses one vector for every string', async () => {
        const bt = fakeBt();
        const pos = { x: 1, y: 2 };

        installTextTap(bt);
        bt.systemPrint(pos, 1, 'first');
        pos.x = 50;
        pos.y = 60;
        bt.systemPrint(pos, 1, 'second');
        await endOfTask();

        assert.deepEqual(
            readDrawnText().map((entry) => [entry.text, entry.x, entry.y]),
            [
                ['first', 1, 2],
                ['second', 50, 60],
            ],
        );
    });

    it('keeps only the last frame: the first string after a task ends starts a new list', async () => {
        const bt = fakeBt();

        installTextTap(bt);
        bt.systemPrint({ x: 0, y: 0 }, 1, 'old');
        await endOfTask();
        bt.systemPrint({ x: 0, y: 0 }, 1, 'new a');
        bt.systemPrint({ x: 0, y: 14 }, 1, 'new b');
        await endOfTask();

        assert.deepEqual(
            readDrawnText().map((entry) => entry.text),
            ['new a', 'new b'],
        );
    });

    it('tags text with the source set when it was drawn', async () => {
        const bt = fakeBt();

        installTextTap(bt);
        setTextSource(TEXT_SOURCE_KIT);
        bt.systemPrint({ x: 0, y: 0 }, 1, 'from the kit');
        setTextSource(TEXT_SOURCE_SYSTEM);
        bt.systemPrint({ x: 0, y: 14 }, 1, 'from the demo');
        await endOfTask();

        assert.deepEqual(
            readDrawnText().map((entry) => [entry.source, entry.text]),
            [
                [TEXT_SOURCE_KIT, 'from the kit'],
                [TEXT_SOURCE_SYSTEM, 'from the demo'],
            ],
        );
    });

    it('hands back copies, so a reader cannot change the recorded frame', async () => {
        const bt = fakeBt();

        installTextTap(bt);
        bt.systemPrint({ x: 3, y: 4 }, 1, 'text');
        await endOfTask();

        readDrawnText()[0].text = 'changed';

        assert.equal(readDrawnText()[0].text, 'text');
    });
});

describe('what is on screen', () => {
    it('still draws a transparent string but does not record it, since the engine draws nothing', async () => {
        const bt = fakeBt();

        installTextTap(bt);
        bt.systemPrint({ x: 0, y: 0 }, 0, 'Hidden');
        bt.systemPrint({ x: 0, y: 14 }, 3, 'Shown');
        await endOfTask();

        assert.deepEqual(
            bt.drawn.map((call) => call.text),
            ['Hidden', 'Shown'],
        );
        assert.deepEqual(
            readDrawnText().map((entry) => entry.text),
            ['Shown'],
        );
    });

    it('records the display position, which is the passed position minus the camera', async () => {
        const bt = fakeBt({ x: 30, y: 12 });

        installTextTap(bt);
        bt.systemPrint({ x: 100, y: 50 }, 3, 'World label');
        await endOfTask();

        assert.deepEqual(
            readDrawnText().map((entry) => [entry.x, entry.y]),
            [[70, 38]],
        );
    });

    it('records nothing for a call the engine rejects', async () => {
        const bt = fakeBt();
        const drawShown = bt.systemPrint;

        // The engine throws on a palette index outside the palette.
        bt.systemPrint = (pos, color, text) => {
            if (color > 255) {
                throw new Error('palette index out of range');
            }

            drawShown(pos, color, text);
        };
        installTextTap(bt);
        bt.systemPrint({ x: 0, y: 0 }, 3, 'fine');
        assert.throws(() => bt.systemPrint({ x: 0, y: 14 }, 999, 'bad'), /out of range/);
        await endOfTask();

        assert.deepEqual(
            readDrawnText().map((entry) => entry.text),
            ['fine'],
        );
    });
});

describe('readDrawnText overlay rows', () => {
    it('appends the engine overlay rows after the printed text, tagged as overlay', async () => {
        const bt = fakeBt();

        installTextTap(bt);
        bt.systemPrint({ x: 6, y: 20 }, 1, 'Title');
        await endOfTask();
        globalThis.__btOverlayRows = {
            read: () => [{ side: 'left', text: 'Current Game Boy - 4 slots', x: 4, y: 211 }],
        };

        assert.deepEqual(
            readDrawnText().map((entry) => [entry.source, entry.text, entry.x, entry.y]),
            [
                [TEXT_SOURCE_SYSTEM, 'Title', 6, 20],
                ['overlay', 'Current Game Boy - 4 slots', 4, 211],
            ],
        );
        assert.equal(readDrawnText()[1].side, 'left');
    });

    it('reads the overlay on every call, so a later frame is not stale', () => {
        let text = 'Row A';

        globalThis.__btOverlayRows = { read: () => [{ side: 'left', text, x: 4, y: 211 }] };

        const first = readDrawnText().filter((entry) => entry.source === 'overlay');

        text = 'Row B';

        const second = readDrawnText().filter((entry) => entry.source === 'overlay');

        assert.deepEqual([first[0].text, second[0].text], ['Row A', 'Row B']);
    });

    it('adds nothing when the page has no overlay readout (release build, overlay off)', () => {
        assert.equal(readDrawnText().filter((entry) => entry.source === 'overlay').length, 0);
    });
});

describe('kit text through the tap', () => {
    it('tags the text a group prints as kit and puts the source back afterwards', async (t) => {
        stubBt(t);
        installTextTap(BT);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        ctx.addRow(40, 10);
        ctx.addCommand(CMD_TEXT, 0, 0, 0, 0, 7, 'Music 100%');
        ctx.end();
        BT.systemPrint({ x: 1, y: 1 }, 1, 'direct');
        await endOfTask();

        assert.deepEqual(
            readDrawnText().map((entry) => [entry.source, entry.text]),
            [
                [TEXT_SOURCE_KIT, 'Music 100%'],
                [TEXT_SOURCE_SYSTEM, 'direct'],
            ],
        );
    });
});
