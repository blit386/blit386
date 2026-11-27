import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CHAT_PROMPT_PATH, checkChatPrompt } from '../check-chat-prompt.mjs';

const prompt = readFileSync(CHAT_PROMPT_PATH, 'utf8');

describe('chat prompt (public/prompt.txt) against the built engine', () => {
    test('every imported name and BT.* chain exists in dist/blit386.d.ts', () => {
        assert.deepEqual(checkChatPrompt(prompt), []);
    });

    test('a renamed API call fails and names the chain', () => {
        const problems = checkChatPrompt(prompt.replaceAll('BT.drawRectFill(', 'BT.drawRectFillFake('));

        assert.equal(problems.length, 1);
        assert.match(problems[0] ?? '', /^BT\.drawRectFillFake: .*drawRectFillFake/u);
    });

    test('a nested member is resolved too', () => {
        const problems = checkChatPrompt(prompt.replace('BT.random.float', 'BT.random.floaty'));

        assert.equal(problems.length, 1);
        assert.match(problems[0] ?? '', /^BT\.random\.floaty: /u);
    });

    test('an import the engine does not export fails', () => {
        const problems = checkChatPrompt(prompt.replaceAll('AudioClip }', 'AudioClip, SoundBank }'));

        assert.equal(problems.length, 1);
        assert.match(problems[0] ?? '', /^import line: .*SoundBank/u);
    });

    test('the two import lines must match', () => {
        const problems = checkChatPrompt(prompt.replace('Vector2i, AudioClip }', 'Vector2i }'));

        assert.ok(problems.some((problem) => problem.startsWith('the import lines differ')));
    });

    test('an import line that is not the pinned jsDelivr form is reported, not skipped', () => {
        const pinned = "from 'https://cdn.jsdelivr.net/npm/blit386@";
        const unpinned = prompt.replace(pinned, "from 'https://unpkg.com/blit386@");
        const problems = checkChatPrompt(unpinned);

        // The first import line is the one rewritten; match its whole report, not a host substring.
        const [firstImport] = unpinned
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('import '));

        assert.ok(problems.includes(`not an \`import { ... } from '<pinned jsDelivr URL>';\` line: ${firstImport}`));
        assert.ok(problems.some((problem) => problem.startsWith('the import lines differ')));
    });

    test('a double-quoted import line is reported, not skipped', () => {
        const problems = checkChatPrompt(prompt.replace(/'(https:\/\/cdn[^']+)';/u, '"$1";'));

        assert.ok(problems.some((problem) => problem.startsWith('not an `import')));
    });

    test('an import written mid-line is still checked', () => {
        const url = 'https://cdn.jsdelivr.net/npm/blit386@1.9.2/dist/blit386.js';
        const problems = checkChatPrompt(
            `${prompt}\n- Or load it with: import { BT, Color32, Rect2i, Vector2i, AudioClip, Sprite } from '${url}';\n`,
        );

        assert.ok(problems.some((problem) => problem.startsWith('import line: ') && problem.includes('Sprite')));
        assert.ok(problems.some((problem) => problem.startsWith('the import lines differ')));
    });

    test('chains on an aliased import are checked by the local name', () => {
        const aliased = `${prompt.replaceAll('{ bootstrap, BT,', '{ bootstrap, BT as B,')}\nB.drawRectFil(rect, 1)\n`;
        const problems = checkChatPrompt(aliased);

        assert.equal(problems.length, 1);
        assert.match(problems[0] ?? '', /^B\.drawRectFil: /u);
    });

    test('a prompt with no pinned import fails', () => {
        assert.deepEqual(checkChatPrompt('Make a game with BT.clear(1).'), [
            'no `import { ... } from <pinned jsDelivr URL>` line found',
        ]);
    });
});
