# Competitive Intel Brief: BLIT386 homepage repositioning

## Header

- Competitors covered: Phaser Studio (Phaser AE, Phaser Game Agent, Phaser 4, Phaser Editor MCP), Rosebud AI, Astrocade,
  Bitmagic, Summer Engine, Replit Agent, Lovable, Bolt.new, v0, the chatbot path (Claude artifacts, ChatGPT canvas,
  Gemini Canvas), OpenAI's Codex browser-games guide, PICO-8, KAPLAY, GDevelop, Godot, Scratch. Dropped: Ludo.ai (makes
  assets and design docs, not playable games - per Ludo's own comparison page).
- Prepared for: BLIT386 owner. Decision: rewrite the blit386.dev homepage for first-time game makers with the pitch
  "tell your AI agent to make a game with BLIT386".
- Buyer segment / sales motion: individual hobbyists and first-time makers; free, self-serve, npm install. No sales
  motion.
- Date: 2026-11-24 (all pages fetched this day unless noted).
- Sources used:
  - Tier 1 (vendor's own pages, fetched 2026-11-24): rosebud.ai, rosebud.ai/pricing, replit.com, bolt.new, v0.app,
    kaplayjs.com, gdevelop.io, gdevelop.io/pricing, godotengine.org, lexaloffle.com/pico-8.php, scratchfoundation.org,
    astrocade.com, bitmagic.ai, phaser.io/news/2026/06/phaser-game-agent,
    phaser.io/news/2026/07/phaser-game-agent-mcp-setup, phaser.io/news/2026/07/no-you-didn-t-miss-a-3d-update,
    phaser.io/agent/mcp/manual, docs.phaser.io/phaser-editor/ai/mcp-server (via search snippet),
    learn.chatgpt.com/use-cases/browser-games (OpenAI), gemini.google/overview/canvas,
    support.claude.com/en/articles/9547008-share-artifacts, blit386.dev and this repo's
    `packages/website/content/index.mdx`.
  - Tier 1 blocked (HTTP 403, not read directly): phaser.io homepage, phaser.io/agent/about, lovable.dev,
    npmjs.com/package/create-blit386. Facts about these come from search snippets or third parties and are tagged lower.
  - Tier 3/4 (third-party, often competitor-authored): Summer Engine blog pages, Nilo articles on Bitmagic,
    Softr/Dupple/etc. pricing guides for Lovable and Bolt, Appy Pie and Ludo roundups, Godot forum and itch.io posts on
    vibe-coded games.
  - Not used: G2, Capterra, TrustRadius, Reddit. No review-platform pass was done (see section 8).
- Overall confidence: medium. Homepage messaging is high confidence (Tier 1, same-day). Pricing for Lovable and Bolt,
  everything about Bitmagic's GDK and Summer Engine, and all customer-experience claims are low to medium.

## 1. Landscape summary

- Category definition, as buyers describe it: "make a game with AI" / "AI game maker" / "vibe coding a game".
  Third-party roundups in 2026 file Rosebud, Astrocade, Bitmagic, GDevelop, Summer Engine and Phaser together under
  "best AI game makers" [Confirmed: Tier 4, ludo.ai/compare/best-ai-game-makers,
  summerengine.com/blog/best-ai-game-makers-2026, nilo.io/resources/best-ai-game-makers, 2026]. Nobody in that
  vocabulary searches for "palette-first" or "indexed color".
- Core problem: "I have an idea for a small game and no idea how to start." The answer every product in the set now
  offers is "describe it in plain language".
- Competitive set by type:
  - Hosted prompt-to-game platforms (browser-only, credit-metered): Rosebud, Astrocade, Bitmagic (consumer side), Phaser
    Game Agent.
  - General AI app builders that can make a game but do not lead with it: Replit, Bolt, Lovable, v0.
  - Chat-window path (free or already-paid, zero install): Claude artifacts, ChatGPT canvas, Gemini Canvas.
  - Engines and kits a coding agent drives on your machine (the direct category for BLIT386): Phaser AE (closed source,
    credits for designs), Bitmagic GDK, Summer Engine (Godot-compatible desktop editor), Phaser Editor MCP server, plus
    plain Phaser/PixiJS as OpenAI's recommended default.
  - Beginner engines without an AI pitch: PICO-8, KAPLAY, Godot, Scratch. GDevelop has added AI and sits between this
    group and the hosted platforms.
  - Do nothing / never start.
- Where the category is moving: engine vendors are rebuilding for agents, not for humans. Phaser Studio shipped a
  separate engine "built from scratch, specifically for LLMs to use" [Confirmed: Tier 1, phaser.io news, 07/2026] and an
  MCP server that plugs it into "76 coding agents" [Confirmed: Tier 1, phaser.io/agent/mcp/manual, fetched 11/2026].
  OpenAI's own Codex guide tells agents to use Phaser or PixiJS and to play-test with Playwright [Confirmed: Tier 1,
  learn.chatgpt.com/use-cases/browser-games, undated]. Agent play-testing is turning into a standard feature, not a
  differentiator.

## 2. Competitor profiles

Answers to Q1 (homepage promise) and Q2 (non-programmer path) are inside each profile. The summary table comes first.

| Product | Headline (verbatim, 2026-11-24) | Primary CTA | Stated audience | Price | Zero-to-running path | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Rosebud AI | "Create games with AI" / "Describe your game below." | "Create" | Not named; "you don't need to know how to code" | Free 10,000 credits/week; $15, $30, $50, $100/mo | Browser only, cloud-saved | [Confirmed: Tier 1, rosebud.ai + /pricing, 11/2026] |
| Phaser Game Agent | "Build a Game from a Single Sentence" | n/a (blog post) | "anyone who wants a game without touching a line of code" | Credits; model tiers Kilo, Sonnet, Opus | Hosted sandbox; game playable in browser via link | [Confirmed: Tier 1, phaser.io/news/2026/06/phaser-game-agent, 06/2026] |
| Phaser AE (via your agent) | "Make games with the coding agent you already use." | `npx -y @phaser-ae/cli setup` (per search snippet) | Coding-agent users | First design free; later designs "from 200" credits; build, playtests, publishing use no Phaser credits | Design on phaser.io, build locally through your agent | [Confirmed: Tier 1, phaser.io/agent/mcp/manual, 11/2026] |
| Astrocade | "Play Free Online Games or Create Your Own with AI" | Not clear ("Create" in nav) | Not stated | Not stated | Browser and app | [Confirmed: Tier 1, astrocade.com, 11/2026] |
| Bitmagic | "Play something nobody's played yet" | "Discover games"; "Make your own" goes to GDK | Players and creators | Play free; no plan prices shown | Browser for consumers; GDK for agents (see profile) | [Confirmed: Tier 1, bitmagic.ai, 11/2026] |
| Replit | "What will you build?" / "Turn ideas into apps in minutes - no coding needed" | "Get started" | "millions of builders"; founders, PMs, designers | Core $18/mo, Pro $90/mo (annual) | Browser | [Confirmed: Tier 1, replit.com, 11/2026] |
| Bolt.new | "What will you build today?" / "Create stunning apps & websites by chatting with AI." | "Build now" | "product builders"; students listed | Free tier; Pro about $25/mo | Browser | Headline [Confirmed: Tier 1, 11/2026]; price [Single-source: Tier 4, third-party guides] |
| Lovable | Variants seen: "Turn your ideas into apps in minutes" / "Create apps and websites by chatting with AI" | Not verified | Not verified | Free (5 build credits/day); Pro about $25/mo | Browser | [Single-source: Tier 1 snippet + Tier 4 guides; homepage 403] |
| v0 | "v0 is an AI agent that helps anyone create real code and full-stack apps and agents." | Not explicit | Teams; one line on "interactive examples and games" for educators | Not on page | Browser | [Confirmed: Tier 1, v0.app, 11/2026] |
| Gemini Canvas | "Gemini Canvas"; turns ideas into "apps, games, infographics" | n/a | Students, work, fun | Available to all Gemini users; best model on Google AI Pro/Ultra | Browser chat | [Confirmed: Tier 1, gemini.google/overview/canvas, 11/2026] |
| Claude artifacts | n/a (feature) | "Publish" | n/a | Publishing on Free, Pro, Max, Ultra | Browser chat; published link opens without a Claude account | [Confirmed: Tier 1, support.claude.com 9547008, 11/2026] |
| GDevelop | "Make your own game. Publish it on Steam and the App Stores." / "the best open-source, no-code game engine" | "Start your game now" | "Artists, GameDevs, Teachers and Brands" | Free; Silver/Gold/Pro (prices not rendered); AI credits per plan | Web editor (editor.gdevelop.io) or desktop | [Confirmed: Tier 1, gdevelop.io + /pricing, 11/2026] |
| PICO-8 | "Welcome to PICO-8!" / "a fantasy console for making, sharing and playing tiny games" | "Get PICO-8 $14.99" | Not stated; "Schools" link | $14.99; free browser Education Edition | Desktop install, or pico-8-edu.com in browser | [Confirmed: Tier 1, lexaloffle.com; Edu Edition via Lexaloffle BBS snippet] |
| KAPLAY | "The fun and open source game library for HTML5 Games" | "Explore Docs" | Not stated; "Easy to learn, easy to teach" | Free, open source | KAPLAYGROUND browser playground | [Confirmed: Tier 1, kaplayjs.com, 11/2026] |
| Godot | "Your free, open-source game engine." | "Download Latest" (4.7.2) | Not stated | Free | Desktop download | [Confirmed: Tier 1, godotengine.org, 11/2026] |
| Scratch | "Imagine, Program, Share" | n/a | Kids | Free ("Scratch is free for everyone") | Browser (common knowledge; page did not say so) | [Confirmed: Tier 1, scratch.mit.edu + scratchfoundation.org, 11/2026] |
| BLIT386 (us) | Page title "BLIT386"; "a palette-first retro game engine for the web" | `npm create blit386@latest my-game` | Not stated | Free, ISC license | Local: Node.js 22.18+, terminal, an agent | [Confirmed: Tier 1, blit386.dev + repo `packages/website/content/index.mdx`, 11/2026] |

### Phaser Studio: Phaser AE + Phaser Game Agent (the closest threat)

**Who they are**

- The company behind Phaser, the most-used HTML5 game framework. Phaser 4 launched in April 2026 [Single-source: Tier 1
  news snippet, phaser.io/news/2026/05/phaser-3-vs-phaser-4].
- Three agent products, all from 2026:
  1. **Phaser AE**: "a completely separate engine that we built from scratch, specifically for LLMs to use". It is not
     open source, it is "WebGPU-first, with a full WebGL 2 fallback", and it does 2D and 3D [Confirmed: Tier 1,
     phaser.io news, 07/23/2026].
  2. **Phaser Game Agent**: hosted, "for anyone who wants a game without touching a line of code". It "designs, builds,
     tests and ships it for you", with code, art and sound, and runs in isolated Superserve sandboxes [Confirmed: Tier
     1, phaser.io news, 06/30/2026].
  3. **MCP / CLI route**: "Make games with the coding agent you already use." Phaser AE "works in 76 coding agents"
     (Claude Code, Codex, Cursor, Copilot, Gemini CLI, Windsurf, OpenCode named). Its playtesting "plays the game in a
     real browser, finds what's off and fixes it" [Confirmed: Tier 1, phaser.io/agent/mcp/manual, fetched 11/2026]. A
     separate July post describes build time "From $0.01 per minute" [Confirmed: Tier 1,
     phaser.io/news/2026/07/phaser-game-agent-mcp-setup, 07/08/2026]. That conflicts with the manual's "No phaser.io
     credits for the build", so the pricing model may have changed between July and November.
- Separately, Phaser Editor v5 ships its own MCP server for scene editing. It is under development and auto-configures
  Claude Desktop, Cursor and VS Code [Single-source: Tier 1 docs snippet, docs.phaser.io/phaser-editor/ai/mcp-server].
- editor.phaser.io/phaser4 headline: "free, open source, and AI-ready" [Single-source: search snippet].

**How they position**

- Two audiences, kept apart on purpose: non-coders go to Game Agent, developers go to open-source Phaser 4 and Editor
  [Confirmed: Tier 1, 06/2026 post].
- Messaging themes: one sentence to a whole game; the agent you already use; built for LLMs; playtests itself.

**Pricing and packaging**

- First game design free. Later designs cost credits ("from 200 a design"). Art, music and sound use credits. 163
  expansion packs are free, and Pro unlocks the other 195 [Confirmed: Tier 1, manual, 11/2026]. Dollar value of a
  credit: insufficient sourced information.

**Strengths, stated honestly**

- Brand reach and the default-stack position: OpenAI's Codex guide recommends Phaser by name [Confirmed: Tier 1,
  learn.chatgpt.com].
- Already claims every agent-first idea BLIT386 has: agent-shaped API, multi-agent install, self-playtesting, WebGPU
  with fallback.
- Full ladder from no-code (hosted) to local agent use to hand-written code.

**Gaps and complaints**

- Phaser AE is closed source, and designs are credit-metered after the first. Lock-in risk follows from that
  [Inference].
- Sign-in to a phaser.io account is required for the CLI setup [Single-source: Tier 1 snippet].
- Customer complaints: insufficient sourced information (no review pass done).

**Recent moves (last 6 months)**

- Phaser Game Agent launched 06/30/2026. MCP setup post 07/08/2026. Phaser AE v2 became the engine for every new game in
  07/2026 [Single-source: news title]. Closed-source status clarified 07/23/2026.

### Rosebud AI

**Who they are**

- San Francisco, founded 2019, about $8.8M seed, 11-50 staff [Single-source: Tier 4, CB Insights / Simplify listings].
- Browser-based prompt-to-game platform: "You describe your game in plain language and Rosebud writes the code." It runs
  "in your browser on Windows, Mac, Linux, Chromebooks and tablets" [Confirmed: Tier 1, rosebud.ai, 11/2026].

**How they position**

- "Create games with AI." The CTA box is a prompt field. No-code is explicit, and editing the code is optional.

**Pricing and packaging** [Confirmed: Tier 1, rosebud.ai/pricing, 11/2026]

- Newbie (free): 10,000 credits per week, remixing, limits.
- Indie Dev ($15/mo): private projects, code tab in the browser.
- 10x Dev ($30/mo): "complete commercial rights to your games", no Rosebud branding.
- Pro ($50/mo): "Downloadable project code", Windows build for Steam.
- Scale ($100/mo).

**Strengths, stated honestly**

- Shortest path from zero to a running game: no install, no terminal, and any device with a browser.
- Speaks the beginner's language exactly.

**Gaps and complaints**

- Owning your code requires $50/mo, and commercial rights require $30/mo [Confirmed: Tier 1].
- One November 2026 test found Rosebud "blocked" and produced no game [Single-source: Tier 4, Appy Pie roundup] -
  anecdote.
- Competitor (Summer Engine) pages claim no Steam export, which contradicts Rosebud's own pricing page. Discard those
  claims.

### The chatbot path (Claude artifacts, ChatGPT canvas, Gemini Canvas)

- Gemini: "Simply describe your idea and Canvas generates the code for a working app or game that you can share"
  (translated from the Czech locale). "Canvas is available to all Gemini users" [Confirmed: Tier 1, gemini.google,
  11/2026].
- Claude: "Publish" is available on Free through Ultra plans, and anyone with the link can play without a Claude account
  [Confirmed: Tier 1, support.claude.com, 11/2026].
- ChatGPT canvas can preview interactive JS games. Some previews break when they need outside resources [Single-source:
  Tier 4 guide, flexos.work].
- Strengths: zero install, zero new account for most people, free, and instant sharing (Claude). This is the real
  default for the target persona [Inference].
- Gaps: single-file output that gets hard to change as it grows. The evidence is anecdotal: a developer with "one
  2,800-line file", a failed vibe-coded metroidvania post-mortem on the Godot forum, an itch.io comment that it works
  well until bugs pile up [Tier 3, 3 independent mentions, but none specific to chat windows - emerging pattern at
  best]. Unpublishing a Claude artifact deletes its storage and it cannot be republished [Confirmed: Tier 1].

### Bitmagic

- Consumer side: "Play something nobody's played yet" - "New games from new creators, every day. One tap, in your
  browser, free." The GDK is promoted as "Turn a sentence into a playable game" with "No code, no engine" [Confirmed:
  Tier 1, bitmagic.ai, 11/2026].
- GDK for coding agents: ships its 3D engine "as editable TypeScript source code inside the project" and connects to
  Claude Code, Codex and Cursor via a Claude Code plugin; release dated 08/27/2026 [Single-source: Tier 4, nilo.io
  articles - Nilo is a competitor; bitmagic.ai itself names no agents]. Low confidence.
- Overlap with BLIT386: TypeScript, browser, agent plugin. Difference: 3D and a hosted player audience.

### Summer Engine

- Self-described "AI-native game engine", a desktop editor compatible with Godot 4. Project files stay local and there
  are no royalties. The hosted AI requires an account and paid credits [Single-source: Tier 1-ish own marketing pages
  via search snippets]. It publishes a "Summer Engine for AI agents" facts page (summerengine.com/for-ai.md). It runs
  aggressive comparison SEO against Rosebud.
- Pricing: a $5/mo Basic plan is reported [Single-source: Tier 4, stork.ai, 05/2026 - may be dated].

### General AI app builders (Replit, Bolt, Lovable, v0)

- All lead with "build apps by chatting", and none leads with games. Replit lists "3D Game" as one project tile. v0
  mentions games once, for educators. Bolt and Lovable do not mention games on the fetched pages [Confirmed: Tier 1 for
  Replit, Bolt, v0, 11/2026].
- Browser-only, credit or token metered. Replit Core $18/mo annual [Confirmed: Tier 1]. Bolt Pro about $25/mo and
  Lovable Pro about $25/mo [Single-source: Tier 4 guides; official pages not read].
- They matter as a habit, not as a game product: the persona may already have one of these open [Inference].

### Beginner engines (PICO-8, KAPLAY, GDevelop, Godot, Scratch)

- Only GDevelop has an AI pitch: "AI-assisted", "Build with AI", an AI tutor, AI credits per plan (40/month free; Silver
  200/week; Gold 1,000/week; Pro 3,000/week) [Confirmed: Tier 1, gdevelop.io/pricing, 11/2026]. GDevelop targets
  non-programmers through no-code events plus AI, and promises Steam and App Store publishing. It is the strongest "real
  engine for beginners" competitor.
- PICO-8, KAPLAY, Godot and Scratch do not mention AI on their homepages [Confirmed: Tier 1, 11/2026]. PICO-8 is the
  closest aesthetic peer (tiny, retro, constrained) and has a free browser Education Edition. KAPLAY is the closest
  technical peer (free TS/JS web library with a browser playground) and makes no AI claim.

## 3. Positioning analysis

Q3: Is "an engine built for AI coding agents to use" claimed by anyone else?

Yes, explicitly and recently. Phaser Studio claims it in almost those words: "built from scratch, specifically for LLMs
to use" (07/2026). It is backed by multi-agent support ("76 coding agents") and agent self-playtesting [Confirmed: Tier
1]. Bitmagic GDK (low confidence) and Summer Engine ("AI-native") make adjacent claims. BLIT386 cannot be first or
loudest with this angle. A homepage that says "the game engine built for AI agents" would sit directly under Phaser's
brand [Inference].

- Where we are differentiated (sourced facts about us, framed as [Inference]):
  - Fully open source (ISC) engine, kit and scaffolder, with no account and no credits at any step. Phaser AE is closed
    and its designs are credit-metered. Rosebud gates code download at $50/mo. GDevelop, Lovable and Bolt meter AI use.
  - The game lives in your own folder from minute one: a Vite project, ready for git, deployable as a static site.
    Rosebud, Astrocade and Bitmagic's consumer side host games in their own runtime.
  - Agent reads game state as numbers (`testState()`, `npx blit play`). Phaser AE describes playtesting only in general
    terms ("plays the game in a real browser"), and OpenAI's guide uses Playwright. Structured state is a real mechanism
    difference, but beginners do not care about mechanisms [Inference].
  - The kit is not tied to one vendor's account: AGENTS.md plus hooks, skills and MCP config for 8 named agents, plus a
    public docs MCP server.
  - Deliberate constraint: low resolution and a small palette mean an agent can make a game that looks finished without
    generated art. Nobody else markets constraint as a beginner benefit, except PICO-8 implicitly [Inference].
- Where we overlap or are underdifferentiated:
  - "Works with the agent you already use" - Phaser AE claims it.
  - "The agent play-tests your game" - Phaser AE and OpenAI's Codex guide both cover it.
  - "WebGPU with fallback" - Phaser AE claims it.
  - "Free, open-source web game library" - KAPLAY, Phaser 4 and Godot all claim it.
- Unclaimed white space (none of the fetched homepages claim these; [Inference]):
  1. "Your game, your files, no credits": open source plus agent-first plus zero metering. Phaser AE is agent-first but
     closed and metered. KAPLAY and Godot are open but not agent-first.
  2. "The next step after the chat window": for someone whose Claude, ChatGPT or Gemini game got too big to change. No
     competitor homepage addresses graduating from a chatbot game.
  3. "Small on purpose": retro constraint as the reason a first game actually gets finished.
  4. "Runs on the AI subscription you already pay for": partly claimed by Phaser AE for builds, but not for design.
     Nobody leads with it.

Q4: What can BLIT386 honestly claim that the "ask the chatbot" path cannot? Each item is checked against the repo;
framing is [Inference].

- A real project, not one HTML file: separate files, a dev server, and a structure an agent can keep changing without
  rewriting everything.
- The agent knows this engine's actual API: local docs, AGENTS.md, rules and a docs MCP server. It does not guess at
  whatever library it remembers.
- The agent can play the game and read its state (`npx blit play`, `testState()`), so "the jump feels wrong" can become
  a number the agent checks.
- No account, no platform and no publish-button rules: deploy anywhere static, keep it forever.
- What it cannot honestly claim: faster or easier to start. The chatbot path needs no install and no terminal. BLIT386
  needs Node.js 22.18+, a terminal and a coding agent (repo `packages/create-blit386/README.md`). For someone who has
  "never made a game and does not know where to start", that install is the biggest barrier in this brief.

## 4. Traps and landmines

There is no sales motion, so these are comparison-page or FAQ questions. Each one traces to section 2.

- "Can you download your game's code on the free plan?" Rosebud: no, Pro at $50/mo [Confirmed: Tier 1].
- "Is the engine open source?" Phaser AE: no [Confirmed: Tier 1].
- "Do you need an account, and what does the second game cost?" Phaser AE: phaser.io sign-in, and designs after the
  first cost credits [Confirmed: Tier 1].
- "Who owns commercial rights?" Rosebud: from $30/mo [Confirmed: Tier 1].
- Landmine for us: "Do I need to install anything?" Every browser competitor wins that question. Do not invite the
  comparison on speed-to-first-pixel [Inference].
- Landmine for us: "Does it do 3D, art or sound?" Phaser Game Agent generates code, art and sound. BLIT386 is 2D,
  low-res and palette-only by design.

## 5. Proof gaps

- "Built specifically for LLMs" - made by Phaser. No public evaluation of agent success rates vs other engines found.
- "Works in 76 coding agents" - made by Phaser. No list of the 76 verified.
- "Plays the game in a real browser, finds what's off and fixes it" - made by Phaser. No demo or metric found.
- "Best open-source, no-code game engine" - made by GDevelop. Superlative with no comparison.
- "Tell your AI agent to make a game with BLIT386" (planned) - made by us. There is no public evidence yet that a
  first-timer gets to a running game. No showcase of agent-made games and no first-run time. About 105 scaffolder
  downloads per month (owner-supplied figure, not checked: npm page returned 403).
- Agents do better with BLIT386's kit than without - made by us, implicitly. No before/after evaluation exists in the
  sources reviewed.

## 6. Takeaways (adapted from "sales-ready")

- The "engine for AI agents" headline is taken by Phaser, with a far larger brand. Lead with an outcome the persona
  feels (a finished small game that is yours), not with the agent-tooling mechanism.
- The real rival for a first-timer is the chat window, not Phaser or Rosebud. It is free, instant, and already open. The
  honest pitch is "when your chatbot game outgrows the chat" or "start where it won't fall apart", not "faster than
  chat".
- Open source plus no credits plus your own files is the one combination no competitor holds alongside agent-first
  tooling.
- Install friction is the weak point. Every browser rival starts with a prompt box. A homepage for never-made-a-game
  people needs a step-by-step path through installing Node and an agent, or it will lose them at step one [Inference].
- The current blit386.dev homepage does not mention agents, MCP or play-testing at all [Confirmed: Tier 1, live page +
  `packages/website/content/index.mdx`, 11/2026]. The kit is the differentiator and the homepage hides it.

## 7. Recommendations (judgment, not findings)

- [Recommendation] Do not headline "built for AI agents". Headline the outcome plus ownership, for example "Make your
  first game with the AI you already use - and keep every file." Reason: Phaser owns the mechanism claim; ownership and
  no credits are unclaimed.
- [Recommendation] Add a "From a chat window to a real project" section that names the single-HTML-file problem without
  disparaging chatbots. Reason: it meets the persona where they already are. The supporting evidence is anecdotal
  (section 2), so keep the claim soft.
- [Recommendation] Make constraint a beginner benefit: "Small on purpose: 256 colors and low resolution, so your first
  game looks finished without an artist." Reason: unclaimed. Verify the wording against the engine's actual limits.
- [Recommendation] Put a 3-step zero-to-running path above the fold: install Node, install or pick an agent, paste one
  prompt. Show a real agent-made BLIT386 game next to it. Reason: biggest proof gap and biggest friction point.
- [Recommendation] Publish a small, honest comparison (BLIT386 vs chatbot vs Rosebud vs Phaser AE) on cost, code
  ownership, account needed, and install needed. Reason: the facts favor BLIT386 on three of four rows, and the fourth
  (install) is better admitted than hidden.
- [Recommendation] Do not claim "first" or "only" anywhere. Bitmagic GDK and Summer Engine may already make overlapping
  claims, and the research on them is thin.

## 8. Open items for human review

- No review-platform or Reddit pass was done. "What customers experience" for every competitor is insufficient sourced
  information.
- Phaser pricing is internally inconsistent: "$0.01 per minute" for builds (07/2026) vs "No phaser.io credits for the
  build" (manual, fetched 11/2026). Check phaser.io/agent before quoting either.
- phaser.io homepage, phaser.io/agent/about and lovable.dev returned 403. Their current headlines are unverified.
- Bitmagic GDK details come only from Nilo, a competitor. Verify on Bitmagic's own docs before citing.
- Is the target persona willing to install Node and a coding agent at all? No sources answer this. It needs user testing
  or a guided-install experiment before the homepage commits to it.
- The 105/month scaffolder figure was not checked (npm page 403).
- Whether to keep the retro/demoscene identity visible (as the reason the games look finished) or drop it is a brand
  call for the owner.
