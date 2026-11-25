# Running with a local model

<!-- cspell:ignore nvfp -->

Your AI assistant normally sends your requests to a model running in the cloud. You can run a model on your own computer
instead: it works offline, every request is free, and your code never leaves the machine. The trade-off is that you need
a powerful computer, and a small local model is noticeably weaker than the big cloud ones.

## The model I tested: Inkling 2 Mini

Inkling 2 Mini is a small open model from Thinking Machines (Apache 2.0 license) - see
https://thinkingmachines.ai/inkling/. It is the local model I have tried with BLIT386 games, through Claude Code, in
November 2026:

- Small, specific requests went well. "Play a happy blip when a block is caught and a sad sound when one is missed" and
  "add a red bomb that costs a life when caught" both took two to four minutes and came out right.
- An open-ended request did not. "Make it look like an old CRT TV" ran for 25 minutes without finishing: the model kept
  reading the engine's compiled code instead of asking the online docs.
- Asked to throw away all changes, it tried to run `git reset --hard` without asking first. The game's safety hook
  blocked it.

So it is a good helper for one small change at a time, and the safety hooks matter (see below).

## What you need

- A Mac with Apple silicon (M1 or newer) and 32 GB of memory or more. I have only tried it on a Mac.
- About 20 GB of free disk space for the model.
- Ollama, a free app that runs models on your computer: download it from ollama.com.
- Claude Code, or another assistant from the list below.

## Set it up (one time)

1. Install Ollama and open it.
2. Download the model. In a terminal:

   ```bash
   ollama pull inkling-2-mini:26b-a5b-nvfp4
   ```

   That tag is the Apple silicon build I tested. Plain `inkling-2-mini` downloads a different build.

3. Give the model room to read your game. In the Ollama app's settings, set the context length to 64k or more. Ollama's
   own default depends on your computer's memory and is often smaller, and coding assistants need at least 64k.

## Start a session

From your game's folder:

```bash
ENABLE_TOOL_SEARCH=false ollama launch claude --model inkling-2-mini:26b-a5b-nvfp4
```

This starts Claude Code on the local model. If the game is set up for Claude Code, it loads the game's `CLAUDE.md`,
skills, safety hooks, and docs server exactly like a normal session - only the model is different. No `.claude/` folder
in your game? Run `npx blit agents add claude` first, or the model works with no safety hooks at all. It changes no
Claude Code settings, so plain `claude` next time is back on the cloud model.

The `ENABLE_TOOL_SEARCH=false` part matters: without it, Claude Code hides the docs server's tools until the model asks
for them, and this model never asks - it reads the engine's minified code in `node_modules` instead, which is slow and
easy to misread. With it, the docs tools are there from the start.

Ollama can start other assistants the same way - `ollama launch codex`, `ollama launch opencode`,
`ollama launch copilot`. Each one gets this game's safety rules only if the game has its files: add them with
`npx blit agents add codex` (or `opencode`, `copilot`) first, and in Codex run `/hooks` and approve them. I have only
tested Claude Code.

Skip chat apps and assistants that have no safety hooks in this game. This model may run a command that deletes your
work without asking, and the hooks are what stop it.

## Getting good results

- Ask for one small, specific change at a time. "Make the paddle 10 pixels wider" works; "make the game more fun" does
  not.
- Name the skill when you know which one fits: "use the play-a-sound skill to add a jump sound". The skills are the
  folders in `.claude/skills/` (or `.agents/skills/`).
- Point it at the right doc: "read docs/audio.md first". Left alone, it tends to dig through `node_modules`.
- If it works for a few minutes without changing anything, stop it (press Esc in Claude Code) and ask a smaller
  question.
- Save your work with git before each request, so you can step back if a change goes wrong.
- Check the result yourself: run the game and play it. The model can say it finished something it did not.
