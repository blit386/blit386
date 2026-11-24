# Competitive Intel Brief (delta): the plain-chat-app path for first-time game makers

## Header

- Competitors covered: ChatGPT (code-block Preview, retired canvas, Intelligent UI, Sites), Claude.ai (artifacts, legacy
  and new), Gemini (Canvas), plus engines that market a chatbot path: LittleJS, KAPLAY, p5.js, Phaser, Rosebud. This is
  a delta on `competitive-intel.md` (same folder). It does not repeat that brief's agent-engine, browser-builder or
  beginner-engine profiles.
- Prepared for: BLIT386 owner. Decision: the blit386.dev homepage redesign, and whether the main "copy a prompt, paste
  it into your AI" CTA can target plain chat apps (ChatGPT, Claude.ai, Gemini) or has to target coding agents (Claude
  Code, Codex, Cursor).
- Buyer segment / sales motion: people of any age who always wanted to make a game and never did. They have used a chat
  LLM, and may have only a chat app: no Node, no terminal, no coding agent. Free, self-serve, individual hobbyists. No
  sales motion.
- Date: 2026-11-24. All pages were fetched on this date unless noted.
- Sources used:
  - Tier 1 (vendor docs and help centers, fetched 2026-11-24):
    - code.claude.com/docs/en/artifacts.md (artifact page constraints and CDN allowlist)
    - support.claude.com articles 9487310, 17153992 (what artifacts are) and 9547008 (sharing)
    - help.openai.com/en/articles/20001246 (writing blocks and code blocks, "updated 27 days ago")
    - help-lb.openai.com/en/articles/6825453 (ChatGPT release notes)
    - help.openai.com/el-gr/articles/20001598 (Intelligent UI)
    - help.openai.com/en/articles/20001339 (ChatGPT Sites) and learn.chatgpt.com/docs/sites
    - learn.chatgpt.com/use-cases/browser-games
    - support.google.com/gemini/answer/16047321 (Canvas) and gemini.google/overview/canvas (Czech locale)
    - docs.cloud.google.com Gemini Enterprise Canvas docs
    - Engine homepages: github.com/KilledByAPixel/LittleJS, github.com/KilledByAPixel/LittleJS-AI, kaplayjs.com,
      p5js.org
    - anthropic.com/legal/consumer-terms (search snippet)
    - Direct checks run today: the jsDelivr, unpkg and cdnjs URLs for `blit386@1.9.0`, blit386.dev/llms.txt, and this
      repo's `packages/blit386/package.json` and README.
  - Tier 3 (community): community.openai.com threads; HN items 47563423 (2026-03-29) and 48537272 (2026-06-15) via the
    hn.algolia.com API; Figma community forum (WebGPU in null-origin frames); eviltester.com and other blog experience
    reports (search snippets).
  - Tier 4 (third-party analysis and press): Simon Willison's weblog (2026-10-28 and 2026-10-31); Parameter Labs
    security write-up (2026-10-28); Appy Pie "best AI game generators" test (2026-11-03, written by a competing vendor);
    TechRadar, Digital Trends (2024-02-16), KDnuggets (2026-01-05), PCWorld (2026-03-04), eWeek (2025-12-18),
    michalcichon.github.io (2025-10-01).
  - Not reachable:
    - Reddit refuses this crawler (HTTP 400 "not accessible to our user agent"), so r/aigamedev, r/gamedev and r/ChatGPT
      were not read at all.
    - The English OpenAI canvas help article (9930697) returns 404; its content came from search snippets only.
    - Android Authority (Gemini export to Google Sites) and gamedev.net returned 403.
    - The TechRadar article bodies were truncated, so only headlines and snippets were used.
- Overall confidence: medium for Claude.ai, which has a documented allowlist. Low-medium for ChatGPT and Gemini, where
  no allowlist is published. Low for WebGPU inside any preview, and low for the community questions because Reddit could
  not be read.

## 1. Landscape summary

- Category definition, as buyers describe it: "make me a game" typed into the chat app they already use. In late 2026
  all three big chat apps market playable games inside the chat:
  - ChatGPT: "games" are named among the interactive tools in responses [Confirmed: Tier 1, ChatGPT release notes,
    10/2026].
  - Gemini: "Simply describe your idea and Canvas generates the code for a working app or game that you can share"
    (translated from the Czech locale) [Confirmed: Tier 1, gemini.google/overview/canvas, 11/2026].
  - Claude: people using an artifact can "play games" [Confirmed: Tier 1, support.claude.com 17153992, 11/2026].
- Core problem: getting from an idea to something playable with no setup. The chat app already answers this for
  one-screen games. Small classics (Snake, Tetris, Asteroids-style shooters) now come out playable on the first or
  second prompt in all three apps:
  - Appy Pie ran one arcade prompt through six tools on 2026-11-03, and all four major tools passed its eight checks
    [Single-source: Tier 4, appypie.com, 11/2026, vendor-authored].
  - TechRadar got working Snake, Tetris, Pong and Pac-Man-style games inside ChatGPT [Single-source: Tier 4,
    techradar.com headline and snippet, 10-11/2026].
  - Simon Willison got a one-prompt three.js game in Claude chat [Single-source: Tier 4, simonwillison.net, 10/2026].
  - Three sources across Tier 4 agree that small one-shot games work, so this is a pattern, though all three are Tier 4.
- Competitive set by type:
  - Chat-native game output: ChatGPT Intelligent UI and code-block Preview, Claude artifacts, Gemini Canvas.
  - Chat-adjacent hosted builders: ChatGPT Sites (paid plans only), Google AI Studio "vibe coding", Opal in Gemini.
  - Engines that hand the chat app a recipe: LittleJS (custom GPT plus "AI Friendly" README). No other engine found does
    this.
  - Do nothing: the chat app writes vanilla JS or three.js with no engine at all.
- Where the category is moving: chat vendors are turning code previews into first-class interactive output and moving
  them away from a separate canvas.
  - OpenAI removed canvas from its default models on 2026-05-28 and moved preview into code blocks [Confirmed: Tier 1,
    release notes].
  - OpenAI launched Intelligent UI with GPT-6 on 2026-10-07 [Confirmed: Tier 1, release notes and help center].
  - Anthropic replaced chat artifacts with a new artifact model on 2026-09-16 [Confirmed: Tier 1, support.claude.com].
  - Sharing and hosting are moving behind paid plans: ChatGPT Sites is not on Free or Go, and new Claude artifacts
    cannot be shared by public link on Free (see section 2).

## 2. Platform profiles

### Q1 summary table: can a pasted prompt produce a BLIT386 game that runs inside the chat app?

| Question | Claude.ai artifacts | ChatGPT (code-block Preview / Intelligent UI) | Gemini Canvas |
| --- | --- | --- | --- |
| Can the preview load a script from a public CDN? | Yes, from a documented allowlist: `cdnjs.cloudflare.com`, `cdn.jsdelivr.net` (selected paths such as `/npm/`), `unpkg.com`, `cdn.tailwindcss.com`, `code.jquery.com`, "and from no other external host" [Confirmed: Tier 1, code.claude.com/docs/en/artifacts, 11/2026]. `esm.sh` is not on the list | Possibly. "If a preview requires outside resources, ChatGPT may ask for permission before connecting" [Confirmed: Tier 1, help.openai.com 20001246, ~10/2026]. The CSP "only allowed script loading from a handful of domains", and the list was not published [Single-source: Tier 4, Parameter Labs via simonwillison.net, 10/2026] | Probably, for common CDNs. A November 2026 test game "loads Tailwind and Google Fonts from the web" [Single-source: Tier 4, Appy Pie, 11/2026]. No Google documentation found |
| Documented CSP / allowed domains | Yes (list above). Also, `fetch`/XHR/WebSocket can reach only the page's own origin and Google Fonts, and the CSP "blocks every external image" [Confirmed: Tier 1] | No public list. Enterprise admins control network access for code previews [Confirmed: Tier 1, help.openai.com 20001246] | Insufficient sourced information |
| WebGPU inside the preview iframe | Insufficient sourced information | Insufficient sourced information | Insufficient sourced information |
| Download the result as a file | Legacy artifacts: "view the code, copy the content, or download it" [Confirmed: Tier 1]. New artifacts: the page cannot start a download itself, only through a declared downloads capability [Confirmed: Tier 1, code.claude.com]. Copying the code from the chat still works [Inference] | The help article does not mention downloads [Tier 1, absence]. An HTML file was obtained "only after asking again" [Single-source: Tier 4, Appy Pie, 11/2026] | Consumer help lists "Copy contents" and Docs/Slides/Colab exports, with no HTML download [Confirmed: Tier 1, support.google.com 16047321]. Gemini Enterprise documents a self-contained `.html` download [Confirmed: Tier 1, Google Cloud docs]; consumer parity unknown |
| Share a playable link | New artifacts: "anyone with the link" is listed for Pro, Max, Ultra, Team and Enterprise, not for Free [Confirmed: Tier 1, support.claude.com 9547008]. Corroborated by "the free plan makes artifacts but cannot share a new one by link" [Tier 4, Appy Pie]. Emerging pattern | Intelligent UI elements: no sharing documented. Sites: Plus and above, "not available on Free or Go" [Confirmed: Tier 1] | g.co/gemini/share link. "Shared links only open in gemini.google.com", not the mobile app [Confirmed: Tier 1] |
| Free plan can build it? | Artifacts on Free [Confirmed: Tier 1] | Intelligent UI on Free and Go via "GPT-6 Luna" [Confirmed: Tier 1, help center 20001598]. Code-block actions "vary by plan" | Canvas "available to all Gemini users" [Confirmed: Tier 1] |
| Age limits relevant to "any age" | Consumer terms: 18 or older [Single-source: Tier 1 snippet, anthropic.com/legal/consumer-terms] | Not checked this pass | Some Canvas features (creating from a Canvas doc, copying shared content, adding AI to apps) are "not available to users under 18" [Confirmed: Tier 1] |

What this means for BLIT386 specifically. These were checked directly on 2026-11-24 and are Tier 1 facts about us:

- `https://cdn.jsdelivr.net/npm/blit386@1.9.0/+esm` returns 200. It is a 304 KB single ES module with no further
  imports.
- `https://unpkg.com/blit386@1.9.0/dist/blit386.js` returns 200.
- blit386 is not on cdnjs (404).
- The engine has no runtime dependencies (`packages/blit386/package.json`). The README says it uses "WebGPU when your
  browser has it, an automatic Canvas 2D fallback".
- So under Claude's documented CSP, a single-file artifact that runs
  `import ... from "https://cdn.jsdelivr.net/npm/blit386@1.9.0/+esm"` should load [Inference: the host and path are on
  the allowlist, but no test was run inside a live artifact].
- If WebGPU turns out to be missing inside the iframe, the Canvas 2D fallback should still render the game [Inference].
- External image URLs are blocked in Claude artifacts [Confirmed: Tier 1]. Sprites therefore have to be drawn in code or
  inlined as data URIs. That suits a palette-first engine [Inference].

WebGPU detail. `navigator.gpu` exists only in secure contexts [Confirmed: Tier 1, MDN snippet]. One forum report finds
it undefined in null-origin (opaque, sandboxed) frames [Single-source: Tier 3, forum.figma.com, date unknown]. Claude
serves artifacts from a real origin, `*.claudeusercontent.com` [Confirmed: Tier 1, code.claude.com], which makes the
null-origin failure less likely there [Inference]. No source states the iframe `sandbox` or permissions attributes for
any of the three apps.

### Claude.ai (Anthropic)

**Who they are / core product**

- Artifacts are available on Free, Pro, Max, Ultra, Team and Enterprise [Confirmed: Tier 1, support.claude.com 17153992,
  11/2026].
- Chat artifacts made before 2026-09-16 are "legacy". They keep working and can be published, but new ones cannot be
  made [Confirmed: Tier 1].

**How they position**

- Artifacts are pitched for documents, tools and dashboards, with games mentioned once ("play games") [Confirmed: Tier
  1].

**Pricing and packaging (as it affects the persona)**

- Free: can create artifacts. Public link sharing for new artifacts is listed only for Pro and above [Confirmed: Tier 1,
  9547008]. This is an emerging pattern, with Appy Pie (Tier 4) agreeing.
- Most artifacts shared with "Anyone with the link" open without a Claude account [Confirmed: Tier 1].

**Strengths, stated honestly**

- The only one of the three with a published script allowlist, and it includes jsDelivr `/npm/` and unpkg, where BLIT386
  is already served [Confirmed: Tier 1 plus direct check].
- A published artifact URL plays without a Claude account [Confirmed: Tier 1].

**Gaps and complaints**

- 18+ consumer terms rule out younger users of the "any age" persona [Single-source: Tier 1 snippet].
- New artifacts block page-initiated downloads unless the downloads capability is declared [Confirmed: Tier 1].
- An older third-party report says chat history was corrupt and missing information, the work had to be split across six
  chats, and the artifacts view had no diff [Single-source: Tier 3, eviltester.com, date unknown] - anecdote.
- Older reports say an artifact has to be generated in full in one message, which "used almost every available
  character" [Single-source: Tier 4, tomsguide.com, likely 2024] - stale, verify before using.

**Recent moves (last 6-12 months)**

- 2026-09-16: new artifact model in chat. Old chat artifacts became "legacy" [Confirmed: Tier 1].
- 2026: templates (Docs, Slides, Design, Data) with export as .zip, PDF, PowerPoint or standalone HTML for designs
  [Confirmed: Tier 1].
- Claude Code can publish artifacts to claude.ai with the same CDN allowlist [Confirmed: Tier 1].
- No game-specific launch found.

### ChatGPT (OpenAI)

**Core product, late 2026**

- Canvas is gone from default models: "canvas will no longer be available in GPT-5.5 Instant or GPT-5.5 Thinking". Paid
  users keep it through legacy models "until those models are sunset" [Confirmed: Tier 1, release notes, 2026-05-28].
- Code now previews inside code blocks. "Supported previews may include HTML pages" and React components. Previews "use
  a sandboxed environment", and "If a preview requires outside resources, ChatGPT may ask for permission before
  connecting" [Confirmed: Tier 1, help.openai.com 20001246, updated ~10/2026].
- Intelligent UI (GPT-6, 2026-10-07): responses can include tools "such as calculators, bill splitters, and games".
  Available to Free and Go via GPT-6 Luna. Not in the Work tab or voice. State does not carry across conversations
  [Confirmed: Tier 1, release notes plus help center 20001598].
- ChatGPT Sites (public beta, 2026-07-09): "create, preview, publish, and share interactive websites and lightweight
  apps". learn.chatgpt.com names games ("Describe a website, web app, or game"). Plus, Pro, Business and Enterprise
  only, "not available on Free or Go". Builds count toward Codex usage. Source is exported by asking Codex [Confirmed:
  Tier 1, help.openai.com 20001339 and learn.chatgpt.com/docs/sites, 11/2026].

**CSP**

- The preview runs on "a different web address" from ChatGPT. Its CSP "only allowed script loading from a handful of
  domains" (YouTube was one) and blocked inline JavaScript. OpenAI changed the CSP during an October 2026 fix
  [Single-source: Tier 4, parameter.ai via simonwillison.net, 2026-10-28/31].
- Which CDNs are on the list: insufficient sourced information.
- The "blocked inline JavaScript" finding conflicts with HTML previews that obviously run inline game code. The
  researchers may have meant a different frame [Inference]. Treat it as unresolved.

**Download**

- Not documented. One test got an HTML file only after a second request, and the in-chat game was "taller than a laptop
  screen" [Single-source: Tier 4, Appy Pie, 11/2026] - anecdote.

**Strengths**

- The largest consumer reach (not sourced this pass), Intelligent UI games on Free, and a permission prompt path for
  outside resources [Confirmed: Tier 1].

**Gaps**

- No documented CDN list. Sharing a game as a link needs Sites, which needs a paid plan [Confirmed: Tier 1].

**Recent moves**

- 2026-02-19: "Preview diagrams and mini apps directly in chat".
- 2026-05-28: canvas removed from default models.
- 2026-07-09: Sites beta.
- 2026-08-21: interactive content streams in.
- 2026-10-07: GPT-6 Intelligent UI with games.
- All [Confirmed: Tier 1, release notes].

### Gemini (Google)

**Core product**

- Canvas is "available to all Gemini users". Google AI Pro and Ultra get a stronger model and a larger context
  [Confirmed: Tier 1, gemini.google, 11/2026].
- Code view, "Show console" for preview errors, and auto-saved changes [Confirmed: Tier 1, support.google.com 16047321].

**Sharing and export**

- Share link via g.co/gemini/share, which opens only on gemini.google.com and not in the mobile app.
- "Anyone with that public link can view and edit data associated with the app."
- Exports go to Docs, Slides, PDF or Colab, plus "Copy contents". No consumer HTML download is documented.
- All [Confirmed: Tier 1].

**CDN and CSP**

- No Google documentation found.
- A November 2026 test game loaded Tailwind and Google Fonts from the web [Single-source: Tier 4, Appy Pie].
- Willison earlier observed it "appears able to pull libraries from a CDN" [Single-source: Tier 4, simonwillison.net,
  03/2025 - stale, verify before using].
- Google AI Studio (a different product) defaults to an esm.sh mirror, aistudiocdn.com [Single-source: Tier 3,
  discuss.ai.google.dev].

**Gaps**

- Under-18 restrictions on several Canvas features [Confirmed: Tier 1].
- Code preview is "only on the web" [Single-source: Tier 4, TechCrunch, 2025 - stale].

**Recent moves**

- Canvas in Search AI Mode for all US users, English only [Single-source: Tier 4, PCWorld, 2026-03-04].
- Opal mini-app builder inside the Gemini web app [Single-source: Tier 4, eWeek, 2025-12-18].
- AI Studio "full-stack vibe coding" with game-style physics and external libraries [Single-source: Tier 1 snippet,
  blog.google, date not shown].
- Export to Google Sites [Single-source: Tier 4 headline, androidauthority.com; page 403].

### Q2: what chat apps default to when asked "make me a game"

- Format: a single self-contained HTML file is the default. Evidence:
  - Willison's chat-made games are "single-file HTML/JavaScript" [Tier 4, 10/2026].
  - KDnuggets' prompt asked for "a single HTML file" [Tier 4, 01/2026].
  - Cichon's ChatGPT and Claude outputs were single `.html` files, while Gemini split into three files [Tier 4, 10/2025,
    may be dated].
  - Gemini Enterprise "generates a working, interactive single-page app as a single self-contained HTML file" [Tier 1].
  - Four sources across two tiers make this a pattern.
- Library: insufficient sourced information for a measured default. No study counts libraries in chat-app game output.
  Signals:
  - 2D memory games came back as vanilla DOM/JS with no library [Tier 4, Cichon, 10/2025].
  - Willison's 3D chat games used three.js. He says frontier models know three.js and Phaser well [Tier 4, 10/2026].
  - OpenAI recommends Phaser or PixiJS, but only in its Codex guide, not for plain ChatGPT [Confirmed: Tier 1,
    learn.chatgpt.com].
  - No source shows chat apps choosing p5.js or KAPLAY by default.
  - [Inference] The default is vanilla canvas or DOM for 2D and three.js for 3D. An engine appears only when the prompt
    names it.
- Implication [Inference]: a pasted prompt has to name BLIT386 and give the exact CDN URL plus a compact API summary. A
  model will not know `blit386`'s API from training, and blit386.dev/llms-full.txt is 1.2 MB (checked 2026-11-24), far
  too big to paste. blit386.dev/llms.txt (18 KB) is an index, not a usable API summary.

### Q3: engines that market a chatbot path

| Engine | Homepage or README wording (verbatim, 2026-11-24) | Chat path | Source |
| --- | --- | --- | --- |
| LittleJS | "AI Friendly" - "The entire API is small and well documented so LLMs can produce high quality results"; "LittleJS GPT - Build LittleJS games right inside ChatGPT"; "One HTML file" | A custom GPT ("LittleJS Game Maker") plus a Claude Code plugin; LittleJS-AI says "use ChatGPT to make games without writing any code" | [Confirmed: Tier 1, github.com/KilledByAPixel/LittleJS and LittleJS-AI, 11/2026] |
| KAPLAY | "The fun and open source game library for HTML5 Games"; CTA "Explore Docs"; "Play in KAPLAYGround" | None. No AI, LLM, CDN or single-file wording on the homepage | [Confirmed: Tier 1, kaplayjs.com, 11/2026] |
| p5.js | "Welcome to p5.js"; CTA "Start Coding" (web editor) | None on the homepage | [Confirmed: Tier 1, p5js.org, 11/2026] |
| Phaser | Agent-first (Phaser AE, Phaser Game Agent) per the first brief | No "paste into your chatbot" path found | [Confirmed: Tier 1, first brief, 11/2026] |
| Rosebud | Own hosted platform; code download from $50/mo | Not a chatbot path | [Confirmed: Tier 1, first brief] |
| Kontra, PICO-8-likes | Not checked this pass | - | Insufficient sourced information |

- LittleJS is the only engine found that markets a plain-chat path, and it does so through a custom GPT, not a
  paste-a-prompt CTA [Confirmed: Tier 1]. Custom GPT usage rules on the Free plan were not checked.
- No engine homepage found uses "copy this prompt, paste it into ChatGPT/Claude/Gemini" as its main action [Inference
  from the pages checked; not exhaustive].

### Q4: what first-time makers report (community signal)

Coverage warning: Reddit could not be read (the crawler is refused), so r/aigamedev, r/gamedev and r/ChatGPT are missing
entirely. HN search returned little that is specific to the persona. Most of the experience reports below are blogs and
forums from 2024-2025.

| Theme | Independent mentions | Rating |
| --- | --- | --- |
| Small, one-screen games work on the first or second prompt (late 2026) | Appy Pie (11/2026), TechRadar (ChatGPT games headline, 10-11/2026), Willison (10/2026) | Pattern (3, all Tier 4) |
| The game breaks or stalls as the single file grows | Tom's Guide (artifact used "almost every available character", likely 2024); community.openai.com (secondhand "deteriorate when lines of code exceed 5000", 06/2025); gamedev.net (scripts "too long to paste into a single prompt", snippet only); first brief's "2,800-line file" | Pattern across Tier 3 and 4, but mostly 6-24 months old - "stale, verify before using" for 2026 models |
| Losing work: a good version overwritten, no history, no diff | eviltester.com (Claude.ai chat history corrupt, six chats, no diff, undated); Digital Trends (no version control to roll back to, 02/2024); "destroyed it entirely with a single, lazy prompt" (snippet, Product Hunt or LinkedIn, undated); community.openai.com "When vibe coding turns into an unfixable mess" (thread title only) | Pattern (4, Tier 3 and 4), with dating gaps |
| Code is bespoke and hard to extend, so the maker starts over | Digital Trends (02/2024); TechRadar "we failed for hours" (headline plus snippet: ChatGPT "kept losing track"); Medium (code "too long for ChatGPT to ingest") | Emerging pattern; stale |
| Download and sharing friction | Appy Pie: ChatGPT gave a file only on a second ask, and Claude's downloaded file needed a fix (11/2026); Claude Free cannot share a new artifact by link (Tier 1 plus Tier 4) | Emerging pattern |
| Assets (images, sound) | No first-timer report found. Claude's CSP blocks external images [Tier 1] | Insufficient sourced information |
| Kids and parents | HN Ask (2026-03-29): 1 of about 20 commenters recommends Claude artifacts ("pretty fun"); Scratch leads (4), PICO-8 (2), LittleJS (1). Show HN (2026-06-15): a parent built a phonics game with Claude; no comments | Anecdote |

### Q5: recent moves toward game making in chat apps (last 6-12 months)

- OpenAI:
  - Code-block mini-app previews (2026-02-19).
  - Canvas retired from default models (2026-05-28).
  - Sites beta, paid plans only, names games (2026-07-09).
  - Interactive content streams in (2026-08-21).
  - GPT-6 Intelligent UI, with games as a named use and available on Free (2026-10-07).
  - All [Confirmed: Tier 1].
- Anthropic:
  - New artifact model in chat; legacy cutoff 2026-09-16.
  - Public link sharing listed for Pro and above.
  - Templates with HTML export for designs.
  - All [Confirmed: Tier 1].
  - No game-specific feature found.
- Google:
  - Canvas for all Gemini users; Gemini 3 for Pro and Ultra [Confirmed: Tier 1].
  - Canvas in AI Mode (2026-03) [Tier 4].
  - Opal in the Gemini web app (2025-12) [Tier 4].
  - Export to Google Sites (date unknown) [Tier 4 headline].
  - No consumer-Gemini game launch found.

## 3. Positioning analysis

- Where we are differentiated [Inference, based on the sourced facts above]:
  - BLIT386 already sits on two of the five CDN hosts Claude artifacts allow, as a dependency-free single ES module. A
    pasted prompt can therefore produce a real BLIT386 game inside Claude with no install. No other engine checked makes
    this claim.
  - The Canvas 2D fallback removes the biggest unknown in this brief (WebGPU inside preview iframes).
  - A palette-first, code-drawn look fits a sandbox that blocks external images.
- Where we overlap or are underdifferentiated:
  - LittleJS already says "AI Friendly", "One HTML file" and "Build LittleJS games right inside ChatGPT" [Confirmed:
    Tier 1].
  - Every chat app already makes small games with no engine, so for a one-screen game the engine adds little a
    first-timer can see [Inference].
- Unclaimed white space [Inference]:
  1. "Paste this into the AI you already have" as the main action of an engine homepage. Not found on any page checked.
  2. Not losing your game: the strongest community pain (overwrites, lost history, a growing single file) is unclaimed.
     A "save your game to a file, then paste it back next time" loop, or a graduation path from a chat artifact to a
     real project, answers it.
  3. Retro constraint as a reason a chat-made game looks finished. This repeats the first brief's white space and still
     holds.

## 4. Traps and landmines

- Landmine for us: "Will it work in my ChatGPT?" Neither the CDN allowlist nor WebGPU is documented for ChatGPT [Tier 1
  absence; Tier 4 says the allowlist is a "handful of domains"]. If the homepage promises "works in ChatGPT" and the
  preview blocks jsDelivr, the first experience is a blank box. This ties to the ChatGPT CSP gap in section 2.
- Landmine for us: "Can I share it with my friends?" On Free, Claude cannot share a new artifact by link, ChatGPT Sites
  is not on Free, and Gemini links do not open in the mobile app [Confirmed: Tier 1].
- Landmine for us: "any age". Claude is 18+ by its terms, and Gemini limits several Canvas features for under-18s [Tier
  1].
- Comparison question that favors us: "Does your engine run inside Claude without installing anything?" Yes for BLIT386,
  based on the documented allowlist [Inference until tested]. Unknown for LittleJS, whose README shows only a local
  `dist/` path and no CDN [Confirmed: Tier 1].

## 5. Proof gaps

- "A pasted BLIT386 prompt runs in Claude/ChatGPT/Gemini" - our claim (planned). Not tested in any live chat app. This
  is the single most important missing evidence.
- WebGPU inside any of the three previews - no claim made by anyone. No documentation found.
- "LittleJS GPT - Build LittleJS games right inside ChatGPT" - their claim. No evidence of output quality or how many
  people use it.
- ChatGPT CSP domain list - Parameter Labs says "a handful", OpenAI publishes none.
- "Games" in ChatGPT Intelligent UI - OpenAI claim. No documentation on whether those games can load outside libraries
  or be exported.
- What first-timers report on Reddit - unread (crawler refused).

## 6. Takeaways (adapted from "sales-ready")

- The paste-a-prompt CTA can target a plain chat app today, and Claude.ai is the best-documented target. jsDelivr
  `/npm/` and unpkg are on its published allowlist, and BLIT386 1.9.0 is served from both as a self-contained module
  [Confirmed: Tier 1 plus direct check]. It still has to be proven with a live test.
- ChatGPT and Gemini are plausible but undocumented. ChatGPT may show a permission prompt for outside resources, and
  Gemini has loaded other CDNs in a test. Treat both as "probably works, verify" [Inference].
- The prompt has to carry the engine: the exact CDN URL, "one HTML file", "draw sprites in code, no image URLs", and a
  compact API cheat sheet of a few KB. Models will not know BLIT386, and llms-full.txt is too big to paste [Inference
  plus direct check].
- Sharing and age limits are where plain chat apps fail this persona: Claude Free cannot link-share, ChatGPT Sites is
  paid, Claude is 18+, Gemini restricts under-18s [Confirmed: Tier 1].
- The persona's documented pain is losing or breaking the game as it grows, not starting it. That is where BLIT386 can
  add value beyond "the chatbot already makes Snake" [Pattern, Tier 3-4, partly stale].

## 7. Recommendations (judgment, not findings)

- [Recommendation] Run a 30-minute test matrix before committing the homepage. Paste the draft prompt into Claude.ai,
  ChatGPT and Gemini, each on a free and a paid account, on desktop Chrome, desktop Safari and one phone. Record whether
  the module loads, whether `navigator.gpu` exists, which renderer BLIT386 picks, whether a download works, and whether
  a share link works. Reasoning: every key cell in the Q1 table except the Claude CDN list is unproven.
- [Recommendation] If the test passes in Claude and at least one other app, make the primary CTA "Copy this prompt and
  paste it into ChatGPT, Claude or Gemini", with a smaller secondary path: "Have a coding agent? Use
  `npm create blit386@latest`". Reasoning: the persona has only a chat app, and the documented constraints fit.
- [Recommendation] Pin the URL in the prompt to `https://cdn.jsdelivr.net/npm/blit386@<version>/+esm` (not esm.sh, not
  cdnjs). Reasoning: it is on Claude's allowlist, and esm.sh is not.
- [Recommendation] Build a pasteable cheat sheet of a few KB (a "chat edition" of the kit) and publish it at a stable
  URL as well. Reasoning: the chat app cannot install the kit, and the full docs are 1.2 MB.
- [Recommendation] Add a "keep your game" step to the prompt and the homepage. For example: "When it works, ask for the
  whole file and save it. Next time, paste it back in." Reasoning: losing work is the most-reported pain, and the chat
  apps do not solve it on Free.
- [Recommendation] Do not say "any age" next to a Claude or Gemini CTA. Reasoning: their terms and feature limits
  contradict it.

## 8. Open items for human review

- Reddit could not be read. A human should skim r/aigamedev and r/ChatGPT for 2026 first-timer threads before the
  "losing work" theme goes into homepage copy.
- No live test was run in any chat app. Every "works in X" statement above is inference from documentation.
- Claude.ai chat artifacts versus the Claude Code artifacts doc: the CSP allowlist comes from code.claude.com. It
  describes the claude.ai viewer on `*.claudeusercontent.com`, which chat-made new artifacts are assumed to share
  [Inference]. Confirm with a chat-made artifact.
- ChatGPT's "blocked inline JavaScript" CSP finding conflicts with working HTML game previews. Resolve it during the
  test.
- ChatGPT minimum age, custom GPT access on Free (for LittleJS GPT), and Kontra and PICO-8-like homepages were not
  checked.
- Whether to show three chat-app logos on the homepage is a brand and legal call. Using OpenAI, Anthropic or Google
  names and logos needs a trademark check.
