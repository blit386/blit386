# Candidate chat prompt (draft 1, 2026-11-24)

**Moved (BT-858, 2026-11-27).** The maintained prompt is
[`packages/website/public/prompt.txt`](../../packages/website/public/prompt.txt), served at
`https://blit386.dev/prompt.txt` and the one source the new homepage (BT-856) reads. Its pin moves with every lockstep
bump, and the website's `test:scripts` checks its API names against the built engine (see the "Chat prompt" section of
`packages/website/CLAUDE.md`). This page keeps the draft's notes and the proxy-test history. The prompt text is no
longer copied here, so there is no stale second copy.

This is for plain chat apps: ChatGPT, Claude.ai and Gemini, with no Node and no terminal. The user replaces the
bracketed line with their own idea.

Every API name in draft 1 was checked against `blit386@1.9.0` (`dist/blit386.d.ts` plus the kit docs). The jsDelivr URL
was loaded and ran in a browser.

- **Pin:** draft 1 was pinned to 1.9.0. The maintained file is pinned to the current engine version by the lockstep
  bump.
- **Size:** about 650 words, small enough to paste, and small enough for a `?q=` link if a "Open in Claude" button is
  used instead of copy-paste.

## Proxy test, 2026-11-24

Two fresh Claude Haiku subagents each got only draft 1 and a game idea, with no repo, no docs and no web access. Their
output is in `haiku-test/`.

| Idea | Result in Chrome (localhost) | Invented API |
| --- | --- | --- |
| Breakout, three lives | Played on the first try: ball launches, bricks break, score counts, no console errors. WebGPU present | none |
| Rock dodger with shooting, speed-up and sounds | Played on the first try: rocks fall, ship moves, game over, Space restarts, no console errors. Bullets are 1x4 px, so hard to see | none |

What this shows: the cheat sheet is complete enough for a small model to write a working game without guessing.

What it does not show:

- whether ChatGPT, Claude.ai or Gemini previews allow the CDN import;
- how bigger or older models behave;
- what happens after five rounds of changes.

`window.BT` is not exposed in a CDN build, so the debugging console helpers are unavailable there.

## Proxy test, 2026-11-27 (maintained prompt, pin 1.9.2)

One fresh Claude Haiku subagent, told to use no tools, got `packages/website/public/prompt.txt` with the idea line
filled in and nothing else. It used no tools. Its HTML is `haiku-test/coin-maze.html`, saved unedited.

| Idea | Result in Chrome (localhost, served over HTTP) | Invented API |
| --- | --- | --- |
| A top-down maze: steer a robot to collect every coin before a 60-second timer runs out, walls block, a blip per coin, a win screen | Played on the first try: random maze, WASD and arrow keys move the robot, walls block, coins collect with a blip, the timer turns red under 10 and ends on "TIME UP", Space starts a new maze. Engine v1.9.2 on WebGPU, no console errors or warnings | none |

Testing note: the engine reads keys from the focused canvas, so a synthetic key event has to be held across frames and
sent to the canvas. A one-frame tap sent to the window does nothing, and that is the test harness, not the game.

## What to check when it comes back

Live test checklist: `live-test-checklist.md` in this folder.
