# Positioning review: blit386.dev homepage

## Header

- Artifact reviewed: blit386.dev homepage (`packages/website/content/index.mdx`, `src/components/home-hero.tsx`), live
  page as of 2026-11-24
- Format and job: homepage - the first screen must say what it is, who it is for, and why it is different
- Assumed audience: the owner's stated new target - people who want to make a simple game, have never made one, and
  would use an AI coding agent. The toolkit's `context/` files are unfilled templates, so this review judges the page on
  its own terms.

## Verdict

Today a reader takes away "a technical engine for people who already know what a palette, WebGPU and a fallback renderer
are". The owner wants them to take away "I can make a game this weekend by telling my AI assistant to do it". Nothing on
the page connects to that second message: AI agents, the kit, `testState()` play-testing and the docs MCP server are the
actual differentiators, and none of them appears above the fold or in the feature cards. The page sells the mechanism
(palette-first) to an audience that cannot yet value it, and hides the outcome (a working game) the new audience came
for.

**One-sentence read-back:** "This is BLIT386, a game engine for [empty - no customer named] that recolors everything at
once via palette indices, unlike [empty - no alternative named]." The customer slot and the alternative slot are both
empty.

## Scores

| Dimension | Score | Evidence (quoted line) |
| --- | --- | --- |
| Customer clarity | 1 | No customer anywhere. The closest is implicit: "Prefer to add the engine to an existing project by hand?" - which assumes a developer with a project |
| Pain | 1 | Starts from the product: "BLIT386 is a palette-first retro game engine for the web." No problem is named, for anyone |
| Differentiation | 3 | "change what color 3 _means_ recolors everything drawn in it at once" is genuinely specific and fails the swap test against Phaser or Godot - but it differentiates for the old audience only. The differentiator that matters for the new audience (built for AI agents to drive) is absent |
| Proof | 3 | A live demo is embedded as the hero, which is a demonstrable mechanism. But it shows a logo, not a game, and there are no games made by real people, no "built in N hours" story |
| Specificity | 2 | Mix: the palette paragraph is concrete; the cards are abstract ("Unified input layer covering mouse, touch, pen, keyboard, and gamepad across all modern browsers") |
| Fit for the job | 1 | The visible first screen is the word "BLIT386", one tagline needing jargon, two docs-page buttons ("Copy Markdown", "Open") and a dark canvas. The real hero copy and CTAs exist but are `sr-only` - screen-reader only, invisible to sighted visitors. The primary action (`npm create blit386@latest my-game`) is below seven feature cards |

**Swap test:** lines that still work with a competitor's name in them:

- "Sprites, primitives & bitmap text - Draw textured sprites, colored geometry, and bitmap-font glyphs through a single
  unified draw API." (Phaser, KAPLAY)
- "Input: pointer, keyboard & gamepad - Unified input layer covering mouse, touch, pen, keyboard, and gamepad across all
  modern browsers." (any engine)
- "Audio: buses, clips & synth" (Phaser, Godot)
- "TypeScript throughout" (Phaser, Excalibur, KAPLAY)

## Top 3 fixes

### 1. Make the first screen say outcome, customer, and action - visibly

- **Why it matters:** a homepage has five seconds. The current first screen says nothing to the new audience, and the
  copy that would help is hidden in `sr-only`.
- **Before:** "BLIT386 / A palette-first retro game engine for the web. Change what a color means, and everything drawn
  in it changes at once." [Copy Markdown] [Open]
- **After:** "Make your first game this weekend. Tell your AI assistant what you want to play - BLIT386 gives it
  everything it needs to build it, run it, and test it." [Copy the prompt] [See games people made]

### 2. Lead with the agent differentiator instead of the render backend

- **Why it matters:** "built for AI agents to drive" is the one claim neither Phaser nor the chat-window path can make
  today, and it is already true in the product (kit, `AGENTS.md`, docs MCP server, `testState()` + `npx blit play`). The
  feature cards spend that space on WebGPU and audio buses.
- **Before:** seven cards: "Palette-first indexed color", "WebGPU with Canvas 2D fallback", "Overlay HUD", ...
- **After:** three cards: "Your assistant knows the engine - it reads the BLIT386 docs as it works, so it stops
  guessing." / "Your assistant can play your game - it checks the score and positions itself, so bugs get caught before
  you see them." / "It looks like a real game - a small fixed palette and pixel grid make a beginner's game look
  deliberate."

### 3. Replace engine demos with games, and the command with a prompt

- **Why it matters:** the new audience judges by "could I make that?", not by subsystem coverage, and a terminal command
  signals "for programmers".
- **Before:** "The fastest way to begin is the scaffolder. It works with npm, pnpm, yarn, or bun and generates a
  ready-to-run Vite project..." + "Featured demos"
- **After:** "Paste this into Claude Code, Cursor, or Codex:
  `Make me a small game with BLIT386 (blit386.dev). [game idea]`" + "Games made with BLIT386: [2-3 real games, with who
  made them and how long it took]". Keep the npm command as a secondary line for people who want it.

## Claims without proof

- "WebGPU where the browser has it, an automatic Canvas 2D fallback where it does not" - fine as a docs claim, invisible
  value to the new audience; proof would be "runs in every modern browser, including phones" plus a tested-browsers list
- Any future "works with any AI model" claim - no evidence exists yet; needs a run across several models (the planned
  benchmark)
- Any future "make a game in an afternoon" claim - needs [a real timed example, from an actual first-time user]

## Minor notes

- The sidebar on the homepage is a list of release posts, which makes the page read as a changelog. Taste-level, but it
  reinforces the docs feel.
- "The design takes its cue from RetroBlit by Martin Cietwierkowski" is a good credit for the docs, but is noise on a
  first-contact page.
- "Copy Markdown" / "Open" buttons are docs-page actions leaking onto the homepage.

## Questions for a human

- Who is the one concrete person this page is for, and do they already have a local AI coding assistant installed? This
  decides whether the main button is a terminal command, a prompt to paste, or a browser experience.
- Which real games made with BLIT386 can be shown, with their owners' permission (`_3RD_` games, the game jam)?
- Is the agent path actually reliable today for a first-timer? (See the filed issue on the non-interactive scaffold
  skipping the per-agent kit files - until that is fixed, fix 1's promise is only partly true.)
- Does the owner want to keep the retro look as a selling point (fix 2's third card) or downplay it?
