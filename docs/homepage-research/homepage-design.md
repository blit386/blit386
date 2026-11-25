# Homepage design: blit386.dev for first-time game makers

Design doc for BT-855, under the umbrella BT-854. Written 2026-11-24 with the owner. The build is BT-856. This doc
covers the desktop page; the phone layout is BT-866.

Decisions are marked **owner** (decided by the owner in the design session) or **call** (decided by the writer, open to
correction). Everything else is a constraint read from the code or the research in this folder.

## 1. Intent

Today blit386.dev reads as an engine page for people who already know what a palette, WebGPU and a fallback renderer are
(`positioning-review.md`: customer clarity 1, pain 1, fit for a homepage 1). The new `/` speaks to someone who always
wanted to make a game and never did because it looked too complex. They have used a chat AI, know simple games, and know
this is not for building Fortnite.

The page has one job: get that person to copy a prompt, paste it into their AI with their own game idea, and play the
game that comes back. Everything else on the page supports that, or serves developers in one quiet line.

## 2. Goals, non-goals, anti-goals

**Goals**

- In five seconds, a first-time maker sees what this is for (making their first game), how (tell your AI), and the one
  action (copy the prompt).
- The proof is on the first screen: a real game, and the exact prompt that made it.
- Hacker News developers can still find the engine, the docs and `npm create blit386` without hunting.

**Non-goals**

- Phones (BT-866). The desktop page must not break on a phone, but it is not designed for one yet.
- A/B testing. About 100 visits a month cannot detect anything; judge by watching people (BT-862).
- Anything on ambilab.com (editor, font editor, tilemap tools).
- Engine, kit or scaffolder changes. The ones this design needs are filed separately (BT-864, BT-865).

**Anti-goals** (would make this a failure even if it ships)

- A claim the product cannot back: naming a chat app that failed the live test, "works with any AI" before BT-853 has
  data, a "grows with you" card before BT-865, a game shown as "first try, unedited" that was edited.
- Leading with "the engine built for AI agents": Phaser AE and Phaser Game Agent own that line since mid-2026
  (`competitive-intel.md`).
- Hiding the retro look. The palette and the pixel grid are a strength ("small on purpose"), not something to apologize
  for (owner).
- Moving any URL. Docs, blog and every other page stay where they are; nothing moves to a subdomain (owner).

## 3. Approaches considered

1. **Keep `content/index.mdx` as the page's content and give `/` its own page layout with `createLayoutSwitch`**
   (`fumapress/layouts/switch`). Picked. The switch replaces only the `page:` layout (`press.config.tsx`), which serves
   `/`, `/docs/*`, `/community`, `/showcase` and `/mcp-server`; everything but `/` keeps `docsPageLayout` and its
   sidebar. `/blog/*` is not affected at all: it renders through `blogPlugin`'s own `BlogLayout` and `BlogPage`. `/`
   gets a layout with no sidebar. `llms.txt`, markdown negotiation, the sitemap and share images keep reading the same
   MDX page.
2. **A hand-written React page for `/` outside the content collection.** Rejected: `/` would drop out of `llms.txt` and
   markdown negotiation, or need a second copy of its text kept in sync by hand.
3. **A separate site for the homepage.** Rejected: the owner ruled out moving URLs and subdomains, and it would
   duplicate the site's CSP, headers and analytics setup.

## 4. The page, top to bottom (desktop)

Mockups from the session are in `.superpowers/brainstorm/` (gitignored, local only). The order was approved by the
owner.

```text
+--------------------------------------------------------------------------+
| BLIT386                                     Docs  Demos  Blog  GitHub    |  slim top nav, no sidebar
+--------------------------------------------------------------------------+
|                                                                          |
|               [ example game, full width, 240-480 px tall ]              |  1. game band
|                                                                          |
+--------------------------------------------------------------------------+
| (ring) Rocks - made in <app> (<plan>) from the prompt below,   < o*o o > |  strip
|        first try, unedited                                               |
+--------------------------------------------------------------------------+
| Make your first game this weekend.  | I want to make a small game with   |
| Tell your AI what you want to play. | BLIT386, a free retro game engine  |
| Type your idea into the prompt,     | My game idea:                      |
| copy it, paste it into your AI.     | [ asteroids, but the rocks split ] |  idea line, editable
|                                     | Rules for you: ... (+40 lines)     |
| [ Copy the prompt ]                 | Click the idea to write your own   |
+--------------------------------------------------------------------------+
| Developer? npm create blit386@latest - or read the docs                  |
+--------------------------------------------------------------------------+
  2. What happens after you paste       (three steps)
  3. Small on purpose                   (palette story + small live demo)
  4. Why BLIT386                        (cards)
  5. Games made with BLIT386            (real games, whole conversations)
  6. For developers                     (engine paragraph, links)
  7. Community + footer                 (existing CommunityConnect)
```

### 4.1 Top nav

A slim bar: wordmark (links to `/`), Docs, Demos (demos.blit386.dev), Blog, GitHub. No sidebar on `/` (owner: the
changelog sidebar goes). **Call:** search stays reachable from `/docs`, not on the homepage bar; the docs layout keeps
its own nav unchanged.

### 4.2 Game band and strip (the rolling showcase)

**Owner decisions:**

- The band is edge to edge (100% width). Nothing is drawn over the game; the countdown lives in the strip, not in the
  game. The owner's first figure was about 300 CSS px tall; the height rule below replaces it until BT-864 ships.
- The band and the prompt box roll together through real examples. Each example is a game plus the idea line that
  produced it.
- Examples are **one-shot results only**: the exact prompt, the idea line shown, first try, unedited. Multi-turn
  conversations belong in section 5, not here.
- **Only runs made inside a chat app that passed the live test (BT-859) count.** The caption names the app, the plan and
  the model, for example "made in ChatGPT (free plan) from the prompt below, first try, unedited". Runs from a coding
  agent or a bare model (like the two `haiku-test/` games, made by Claude Haiku as a subagent) do not count, so a
  caption never implies that an untested or failed app works.

**Strip contents:** a countdown ring (a circle that empties, like an authenticator app's code timer), the game's name,
the caption, previous/next arrows and one dot per example. **With one example**, the strip shows only the name and the
caption: no ring, no arrows, no dots, and nothing rolls.

**Calls:**

- Interval about 20 seconds per example (the owner first suggested one minute; most visitors decide within ten seconds,
  and with dots nobody is stuck waiting).
- The rolling pauses while the pointer is over the band or the strip, while the game has focus, and while the idea field
  has focus. Typing in the idea field stops the rolling for the rest of the visit: the prompt box is the visitor's now.
- With `prefers-reduced-motion: reduce`, nothing advances by itself; arrows and dots still work. This also covers WCAG
  2.2.2 (moving content longer than five seconds needs a pause), together with the hover and focus pause.
- One game runs at a time. The next one loads just before its turn; the previous one is torn down. Each game pulls the
  engine (about 400 KB), so several at once would be heavy.
- One or two examples at launch is likely, given the rule above; more come from later runs in passing apps. The page
  needs at least one to launch. The `haiku-test/` games get re-run inside a passing app with the final prompt (BT-858).
- Each example's idea line, app, plan, model, date, prompt version and fill color are stored next to the game file, so
  the caption is generated, not typed by hand.
- **When the prompt changes** (a release that touches an API the prompt lists moves its pinned version): re-run the
  examples with the new prompt as part of the BT-858 upkeep. Until an example is re-run, it stays in the rotation and
  its caption says "made from an earlier version of this prompt", linking to that version's text. The band never goes
  empty, and no caption claims more than is true.

**Band height until BT-864 (responsive canvas) ships (owner):** the example games are fixed-size (320x240), and pixels
must stay crisp. The game is drawn at the largest whole-number scale whose height fits within half the window height: 2x
(a 480 px band) on most desktops, 1x (240 px) on short laptop screens. The band is as tall as the scaled game, full
width, the game centered, and the rest filled with the example's stored fill color (the host page cannot read the color
from inside the cross-origin iframe), so it still reads as edge to edge. The host sizes the iframe to the exact scaled
game size; the prompt's page skeleton scales the canvas to fill its own viewport (`min(100vw, 100vh*4/3)`), so an iframe
of exactly 640x480 shows the game at exactly 2x with the game's HTML left byte-for-byte. When BT-864 lands, examples
made with the responsive mode fill the band for real at the owner's original fixed height.

### 4.3 Headline, prompt box and button

**Owner:** layout B - the prompt itself is on the page, and the visitor types their idea into it before copying. It
shows there is no trick: it is just text.

- **Headline (draft):** "Make your first game this weekend." **Sub-line (draft):** "Tell your AI what you want to play.
  Type your idea into the prompt, copy it, and paste it into your AI." Final copy gets its own pass; it must name no
  chat app until BT-859 says which ones pass.
- **Prompt box:** shows the first lines of the real prompt (BT-858), the idea line as an editable field, then a
  collapsed "+N more lines" that expands in place. The text shown and the text copied are the same string, from one
  source file, so they cannot drift.
- **Idea field:** single line or short multi-line, prefilled with the current example's idea. Focusing it clears the
  example idea (with the example's text as the placeholder) and stops the rolling. If the visitor copies without typing
  an idea, the copied prompt keeps the example idea, so the paste still produces a game.
- **Button:** "Copy the prompt". On success the label changes to "Copied - now paste it into your AI" for a few seconds.
  If the Clipboard API is unavailable or refused, the prompt box text is selected and the label says "Press Ctrl+C /
  Cmd+C to copy". No silent failure.
- **"Open in Claude" / "Open in ChatGPT" links (call):** not at launch. The prompt is about 650 words, around 5 KB in a
  `?q=` link, and nobody has tested whether those apps accept that much. If BT-859 shows the full prompt survives in a
  link for an app that passes, add that app's link under the button.
- **One prompt, not two (call):** a coding agent handles the single-file prompt as well as a chat app, so there is no
  "chat app versus coding agent" switch. The agent path (`npm create blit386`) is the developer line. This changes the
  scope of BT-858, which planned two prompts; update that ticket when this doc is approved.

### 4.4 Developer line

One line under the first screen: "Developer? `npm create blit386@latest` - or read the docs", with a small copy button
on the command (owner: the first screen speaks to first-time makers; developers get one line).

### 4.5 Section 2 - What happens after you paste

Three short steps, in plain words (draft):

1. Your AI writes one HTML file. No install, no account.
2. Play it right there in the chat, or save it as `game.html` and open it in your browser.
3. Ask for changes: "make it faster", "add a high score".

Step 2 must match what the apps that passed BT-859 actually do (some show a preview, some do not).

### 4.6 Section 3 - Small on purpose

The palette story, told for makers (owner: keep it, as a strength). Draft line: "256 colors and a pixel grid. The limits
are why a first game looks deliberate and gets finished." Next to it, a small live palette demo: change one color slot
and the whole scene changes. **Call:** reuse an existing demo from demos.blit386.dev in an iframe (the current hero's
`logo-lowres` or a palette demo) rather than building a new one.

### 4.7 Section 4 - Why BLIT386 (cards)

- **"Your AI gets everything it needs in one prompt."** (Not "your AI knows the engine": the prompt teaches a small,
  checked subset.)
- **"Free and open source."** ISC license, no account, no credits, your files from minute one.
- **"Grows with you"** - **owner:** this card stays off the page until BT-865 ships a real path from a single-file chat
  game to a scaffolded project. Until then section 4 has two cards.

### 4.8 Section 5 - Games made with BLIT386

Real games with the maker's name, the AI used and the time taken, shown with permission (BT-861). Here the whole
conversation can be shown, not just the first prompt. **Until BT-861 has games:** the section is hidden, not shown with
placeholders. An empty "coming soon" block is a claim with no proof.

### 4.9 Section 6 - For developers

One paragraph on the engine (palette-first indexed color, TypeScript, WebGPU with a Canvas 2D fallback, no
dependencies), `npm create blit386@latest`, the single-file CDN snippet once BT-857 makes it official, and links to the
docs, demos.blit386.dev and GitHub. The current "Featured demos" grid (`DemoShowcase`) can move here in a smaller form.

### 4.10 Section 7 - Community and footer

The existing `<CommunityConnect title="Join the community" />` block, unchanged.

## 5. Fit with Fumapress and the site's plumbing

- **Layout switch:** in `press.config.tsx`, replace the `page:` layout with
  `createLayoutSwitch(detector, { home, docs })`. The detector receives only `page` (not `slugs`; see
  `fumapress/dist/layouts/switch.d.ts`), so it tests `page.slugs.length === 0` and returns `home` for the root page,
  `docs` otherwise. `home` renders the new layout (top nav, no sidebar, full-width content area); `docs` is today's
  `docsPageLayout` unchanged. Do not wrap `home` in fumapress's `createHomeLayoutPage`: its `<main>` is capped at
  `max-w-[1400px] px-4`, which the full-width band would have to break out of. The root layout (`createRootLayout`,
  `ChannelBanner` on next) stays as it is. Fumadocs' global CSS still loads on `/`; the new layout must not fight it.
- **`content/index.mdx` stays the source.** Its prose becomes the new sections; the first screen is a new component
  (replacing `HomeHero`) registered with the MDX components like `HomeHero` is today. `llms.txt`, markdown negotiation
  (`src/markdown-negotiation.ts`), the sitemap and the MCP server keep reading this page.
- **Markdown version of `/`:** markdown negotiation prints MDX component tags as raw text; `/` served as markdown today
  shows a literal `<HomeHero />`. So the headline, the full prompt and the developer line must exist in `index.mdx` as
  real markdown (a heading, a fenced code block, a paragraph), not only inside the first-screen component, and the
  component reads the same prompt text. How that one source is shared (a build step that expands it into the MDX, or the
  component reading the fenced block) is left to the builder; the constraint is that the shown text, the copied text and
  the markdown text are one string.
- **CSP on blit386.dev:** `script-src` is `'self'` plus Plausible, and `frame-src` is `'self'` plus
  `https://demos.blit386.dev` (`src/csp.ts`, `public/_headers`). The example games load the engine from jsDelivr, so
  they cannot run inline on blit386.dev without loosening the CSP. **Call:** host each example as its own page on
  demos.blit386.dev (served byte-for-byte, so "unedited" stays true) and show it in a sandboxed iframe in the band. Do
  not add jsDelivr to blit386.dev's `script-src`.
- **CSP on demos.blit386.dev (real work, not a check):** `packages/demos/public/_headers` sets
  `script-src 'self' 'unsafe-inline' https://plausible.io` on a site-wide `/*` rule, so the example pages cannot load
  jsDelivr there today. The examples need a path-specific rule (for example `/examples/*`) that replaces the site-wide
  CSP for those pages and adds `https://cdn.jsdelivr.net` to `script-src`. Adding a second `Content-Security-Policy`
  line beside the site-wide one does not work: both policies are enforced, so a second one can only make things
  stricter.
- **Example deploys:** demos.blit386.dev deploys to production on release tags or a manual run
  (`.github/workflows/deploy.yml`), and the next channel embeds production demos (`src/components/demo-embed.tsx`).
  **Call:** accept that adding or changing an example needs a demos deploy (a manual run is enough, no release needed);
  examples change rarely. Preview a new example locally before deploying it.
- **Share image and title:** `/` keeps its Open Graph image route. The root page gets no "BLIT386 - " title prefix
  (`packages/website/scripts/patch-html-title.mjs`), so the frontmatter title must carry the name itself: "BLIT386 -
  Make your first game this weekend". The description becomes the sub-line.
- **Analytics (BT-860):** Plausible custom events for "Copy the prompt" (with whether the idea was edited), the
  developer-line copy, and example navigation (dots and arrows). No event carries the typed idea text.

## 6. What happens to the current `index.mdx` content

| Current block | Goes to |
| --- | --- |
| `HomeHero` (`logo-lowres` demo, `sr-only` copy) | Replaced by the first screen. The `logo-lowres` demo can serve section 3 |
| Palette paragraph and RetroBlit credit | Palette part becomes section 3; the RetroBlit credit moves to the docs (Getting Started or About) |
| Seven feature cards | Section 6 in condensed form; each card's link target is already a docs page |
| Quick start (`npm create`) | Developer line and section 6 |
| `DemoShowcase` | Section 6, smaller |
| "Where to go next" links | Section 6 and the top nav |
| `CommunityConnect` | Section 7, unchanged |

## 7. Dependencies and launch states

| Depends on | Until it lands | After |
| --- | --- | --- |
| BT-858 prompt text | Page cannot ship: the prompt box needs the real text | Prompt box and copy button use it |
| BT-859 live test | Copy says "your AI"; no app named; no open-in links | Name the apps that passed; open-in links only where tested |
| BT-857 official CDN path | Section 6 omits the CDN snippet | Section 6 shows it |
| BT-864 responsive canvas | Fixed-size games, centered in the band | Examples fill the band |
| BT-865 chat-to-project path | Two cards in section 4 | "Grows with you" card added |
| BT-861 real games | Section 5 hidden | Section 5 shown |
| BT-853 model benchmark | No "works with any AI" claim | Claim only what the data shows |
| BT-866 phone layout | Desktop layout must not break on a phone; no phone design | Phone layout per BT-866 |

The page can launch with BT-858 and BT-859 done; everything else improves it later.

## 8. Ticket checklist (BT-855 "What the doc must settle")

| Point | Answer |
| --- | --- |
| First screen: outcome, customer, action in five seconds | 4.2, 4.3 (owner: first-time makers first, layout B over a full-width game band) |
| One prompt or a two-way choice | One prompt (call, 4.3) |
| Open in Claude / ChatGPT buttons | Not at launch; only after BT-859 tests the link length (call, 4.3) |
| Three lines under the button | Section 2 (4.5) |
| Three outcome cards | Two at launch, third after BT-865 (owner, 4.7) |
| Palette story as "small on purpose" | Section 3 (owner, 4.6) |
| Real games with a placeholder state | Section 5, hidden until BT-861 has games (call, 4.8) |
| Link to demos.blit386.dev | Top nav and section 6 |
| Free, open source, no account | Card in section 4 |
| Mobile | Deferred to BT-866 (owner) |
| Honest claims | Section 2 anti-goals and section 7 table |
| Fit with Fumapress | Section 5 |
| What happens to `index.mdx` | Section 6 |

## 9. Left to the builder

- Exact copy for every heading and line (drafts above), and the visual design within the site's existing look.
- The detector function and file layout for the home layout.
- How the prompt text and the example metadata are stored and loaded (one source for shown and copied text).
- Breakpoints between desktop widths; phones wait for BT-866.
