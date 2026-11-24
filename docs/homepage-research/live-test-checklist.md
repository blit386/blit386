# Live chat-app test (about 30 minutes per app)

Goal: find out whether the candidate prompt (`chat-prompt.md`) produces a playable game inside each plain chat app,
before the homepage promises it. Use your own accounts. Nothing here can be automated from a coding agent.

## Setup

- **Apps:** ChatGPT, Claude.ai, Gemini. If you have both, test a free account and a paid one for each.
- **Ideas:** use the same three game ideas in every app, so the results compare:
  1. "Breakout: a paddle at the bottom, a bouncing ball, and rows of colored bricks to smash. Three lives."
  2. "A little spaceship at the bottom dodges falling rocks and shoots them with Space. The rocks fall faster over
     time."
  3. Something you would actually want to make. This tells you more than the other two.
- **New chat for every run:** no earlier context.
- **Debug snippet:** paste this into the preview's browser console only if the app lets you open DevTools on the preview
  (most do via right-click, Inspect):

  ```js
  ({ gpu: 'gpu' in navigator, canvas: document.querySelector('canvas')?.width });
  ```

## Per run, record

| # | Question | How to tell |
| --- | --- | --- |
| 1 | Did it write one HTML file using the jsDelivr import line unchanged? | Read the code |
| 2 | Did it preview inside the chat at all? | Does a preview panel or Run button appear? |
| 3 | Did the engine load? | The BLIT386 splash or the game appears. A blank preview with a console error mentioning `cdn.jsdelivr.net` or "Content Security Policy" means no |
| 4 | Did the app ask permission to load outside resources (ChatGPT)? | A prompt in the chat |
| 5 | Is WebGPU there? | The snippet's `gpu: true`. If false, the game still runs on the Canvas 2D fallback, so note it, it is not a failure |
| 6 | Does it play? | Keys and mouse work, the score changes, restart works |
| 7 | Did it invent API calls? | Console errors like `BT.drawCircle is not a function`. Note the name: it goes into the cheat sheet or the docs |
| 8 | Does one follow-up change work? | Ask for one change, for example "make the ball faster and add a sound when a brick breaks" |
| 9 | Can you get the file out? | Download or copy, save as `game.html`, double-click. Does it run outside the chat? |
| 10 | Can you share it? | Is there a public link, and does it open in a logged-out browser? |

## Results table (fill in)

| App | Plan | Idea | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | free | 1 |  |  |  |  |  |  |  |  |  |  |  |
| ChatGPT | free | 2 |  |  |  |  |  |  |  |  |  |  |  |
| Claude.ai | free | 1 |  |  |  |  |  |  |  |  |  |  |  |
| Claude.ai | free | 2 |  |  |  |  |  |  |  |  |  |  |  |
| Gemini | free | 1 |  |  |  |  |  |  |  |  |  |  |  |
| Gemini | free | 2 |  |  |  |  |  |  |  |  |  |  |  |

## What decides what

| Result | What the homepage can say |
| --- | --- |
| An app plays in most runs, in its preview | Name it on the homepage as a supported chat app |
| It plays only after saving the file | Name it, and make the prompt's "save as game.html" step the primary instruction for it |
| It fails at row 3 (the CDN is blocked) | Do not name it. Consider whether a self-contained build (engine inlined into the HTML) is worth making; that is a separate decision |
| It fails at row 7 (invented API) | Fix the cheat sheet first, then run again |

## Also worth noting while you are in there

- **Prefilled links:** does `https://claude.ai/new?q=<url-encoded prompt>` open with the prompt prefilled? Try the same
  with `https://chatgpt.com/?q=`. If both work, the homepage button can be "Open in Claude" or "Open in ChatGPT" instead
  of copy-paste. The docs pages already use a `claude.ai/new?q=` link, and it shows up in Plausible.
- **Mobile:** does it work on a phone? About a third of blit386.dev visits come from phones.
