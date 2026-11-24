# Behavior diagnosis: first game from the blit386.dev homepage

Date: 2026-11-24. Inputs: the owner's persona description and replies (this session), the positioning review of the
current page, npm download counts, and a local test of the engine loaded from a CDN. No funnel counts were given.

Quotes from the input:

- Q1: "Agent path is reliable, I tested it with two friends IRL, and it worked well."
- Q2: "People who never created a game because it was too complex, but always dreamed about it."
- Q3: "They have some experience with LLMs. The question is, can they use BLIT386 in pure ChatGPT?"
- Q4: "They know simple games. They understand this engine is not for building Fortnite."

## 1. Behavior specification

- **Who:** first-time makers who have used a chat AI (ChatGPT, Claude, Gemini); no game made before (Q2, Q3).
- **What:** copy the homepage prompt, paste it into their AI with a game idea, and end up playing a game that runs.
- **When and where:** first visit to blit386.dev; acting at a computer with their AI open.
- **How often:** once to start; the real win is a second session where they change the game.
- **How measured:** not measured today. Possible proxies:
  - A Plausible custom event on the "Copy prompt" button.
  - Public jsDelivr download stats for `blit386` (a proxy for the plain-chat path, if that path loads the engine from
    the CDN).
  - npm downloads of `create-blit386` (the agent path; 105 in the last month).
  - None of these proves a game ran.

Other behaviors for a later run: coming back to change the game, sharing it, and reading the docs.

## 2. Step table

No counts given. The steps, with where each path splits:

| Step | Plain-chat path (ChatGPT, Claude.ai, Gemini) | Coding-agent path (Claude Code, Codex, Cursor) |
| --- | --- | --- |
| 1 | Lands on the page | Same |
| 2 | Understands it is for them, within about 5 seconds | Same |
| 3 | Knows which AI they have and which prompt fits | Same |
| 4 | Copies the prompt | Same |
| 5 | Pastes it with a game idea | Same, plus needs Node 22.18+ and a terminal |
| 6 | The AI writes code that uses the real BLIT386 API, not an invented one | The agent runs `npm create blit386`, then `npm run dev` |
| 7 | The game runs, in the chat's preview or saved as a file and opened | The game runs in a browser tab |
| 8 | They ask for a change and it still works | Same |

Largest drop: unknown. Likely candidates are step 2 (the page does not say who it is for) and step 6 (whether a chat AI
knows the API at all). Both are assumed.

## 3. Barrier map (COM-B, L28)

| Barrier | COM-B component | Evidence | Tag | What would confirm it |
| --- | --- | --- | --- | --- |
| The page does not say it is for them; jargon on the first screen | Psychological capability | Positioning review: customer clarity 1, first-screen copy is `sr-only` | observed | 5-second test with 5 people from the persona |
| They do not know whether they have "an agent" or "a chatbot", or which prompt to use | Psychological capability | Q3 (the owner is unsure too) | assumed | Ask 5 persona people what AI they use and whether they have used a terminal |
| A plain chat AI does not know the BLIT386 API and invents calls, so the game breaks | Physical opportunity (the tool) | Small project, likely little or no training data; Q3 | assumed | Paste a candidate prompt into ChatGPT, Claude and Gemini, 5 runs each; count runs that play |
| The chat preview may block a CDN import or lack WebGPU | Physical opportunity | The engine runs from `cdn.jsdelivr.net/npm/blit386@1.9.0` in a normal browser (tested); preview limits are being researched | assumed | Same test as above; the parallel research brief |
| The agent path needs Node 22.18+, a terminal, and often a paid agent plan | Physical opportunity (money, tools) | Scaffolder requirements | observed | Count how many persona people already have Node or an agent |
| Phone visitors cannot act now (HN and short-video traffic) | Physical capability (device) | none | assumed | Plausible device split |
| No games by people like them on the page | Social opportunity | Positioning review: "no games made by real people" | observed | n/a, fix directly |
| "Too complex for me" belief | Reflective motivation | Q2 | observed (owner's description of the persona) | n/a |
| Fear of the terminal; giving up after the first broken result | Automatic motivation | none | assumed | Watch 3 first-time sessions without helping |
| Q1's success may depend on the owner being in the room | All of the above | Q1 ("IRL") | assumed | Question 1 below |

Binding barrier (ability first, L27, L32): step 6. Whether a plain chat AI can write a working BLIT386 game at all is
untested. On the agent path, the binding barrier is setup (Node, terminal, agent).

## 4. Prompt check

- **The moment they can act:** at a computer, with their AI open.
- **Current prompt:** none for an AI. The only call to action is `npm create blit386@latest my-game`, below seven
  feature cards.
- **Phone visitors:** they get no prompt that survives until they reach a computer.

## 5. Intervention functions

| Barrier | Function |
| --- | --- |
| The AI does not know the API | Enablement: give the AI the docs in the prompt, for example "read blit386.dev/llms.txt first", and a single-file starter that imports a pinned CDN version |
| Which AI, which prompt | Environmental restructuring: one prompt that works on both paths, or two clearly labeled tabs |
| Setup on the agent path | Enablement: a one-line "Need Node? Install it here" next to the agent tab |
| "For me?" and jargon | Education: a first screen with outcome, customer and action |
| No people like them | Modelling: real games with maker and time taken |
| "Too complex" | Persuasion: "small on purpose", where the limits are why a first game gets finished |
| What happens after pasting | Education: three lines (paste, the AI writes a file, you play it) |

## 6. Ranked changes

| Rank | Change | Barrier | Function | Legitimate only if | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Make the plain-chat prompt actually work: the AI reads the docs and writes one HTML file importing `blit386` from a pinned jsDelivr URL | AI does not know the API; preview limits | Enablement | It works in a majority of test runs in each named AI; otherwise name only the AIs where it works | L27, L28, L32 framework, no effect grade |
| 2 | One "Copy prompt" button with a selector ("ChatGPT, Claude or Gemini" / "Claude Code, Codex or Cursor"), each prompt tested | Which AI, which prompt | Environmental restructuring | Each prompt was tested on the current versions of those tools | Framework, no effect grade |
| 3 | Three real games, each with maker, AI used, and time taken | No people like them | Modelling | The games are real, made that way, and shown with permission | Not in this plugin's ledger as a measured effect |
| 4 | Three lines under the button: what happens after you paste | Not knowing what comes next | Education | The steps match what the tested AIs do | Framework |
| 5 | "Small on purpose" line: 256 colors and a pixel grid help a first game get finished | "Too complex" | Persuasion | The owner stands behind it (they do); no invented completion statistic | No ledger effect; judgment |

### Hypothesis card 1

```
Hypothesis: Because making it possible before persuading (L32, framework, no effect grade) addresses
"can they use BLIT386 in pure ChatGPT?" (Q3), changing the main action from
"npm create blit386@latest my-game" -> a tested paste prompt that produces one HTML file
using a pinned CDN import should raise copy-button clicks and jsDelivr downloads of blit386
for first-time makers with only a chat AI.
Legitimate only if: the prompt produces a game that runs in most test runs in each AI the page names.
Variant: one change against the current version
Guardrails: complaints (GitHub issues or social replies saying "it did not work")
Decision rule: a lift on the primary metric together with a guardrail breach counts as a failed test.
How to test: To size and read this test, use a conversion-rate-optimisation (A/B testing) skill, a sample-size tool or your experimentation platform.
Feasibility: At scale, nudge-type changes averaged +1.4 percentage points, an 8.0% relative increase (L21).
Effects that small usually take more than ten thousand visitors per version to detect. On lower traffic,
ship only honest, low-risk changes and claim no lift.
```

### Hypothesis card 2

```
Hypothesis: Because environmental restructuring (L28, framework, no effect grade) addresses not knowing
which AI they have or which prompt fits (assumed, from Q3), changing one generic prompt -> a two-choice
selector, each choice with its own tested prompt, should raise copy-button clicks for first-time makers.
Legitimate only if: both prompts are tested on current versions of the tools named.
Variant: one change against the current version
Guardrails: complaints
Decision rule: a lift on the primary metric together with a guardrail breach counts as a failed test.
How to test: To size and read this test, use a conversion-rate-optimisation (A/B testing) skill, a sample-size tool or your experimentation platform.
Feasibility: At scale, nudge-type changes averaged +1.4 percentage points, an 8.0% relative increase (L21).
Effects that small usually take more than ten thousand visitors per version to detect. On lower traffic,
ship only honest, low-risk changes and claim no lift.
```

With about 100 scaffolder downloads a month, neither change can be A/B tested. Ship them as honest changes and judge by
the hand tests (5 runs per AI) and by watching 3 first-time sessions.

## 7. Assumptions

- Plain chat AIs do not know the BLIT386 API without being given the docs.
- Chat previews may block CDN imports. The CDN import itself works: tested locally against
  `cdn.jsdelivr.net/npm/blit386@1.9.0/dist/blit386.js` with the scaffolder's Catcher game, which runs.
- A meaningful share of HN and short-video traffic arrives on phones.
- The two friends in Q1 had help, or already had Node.

## 8. Questions

1. With your two friends: were you in the room, which AI and tool did they use, and did they already have Node?
2. Do you have Plausible numbers: visits per month and the phone share?
3. Will you make the single-file CDN path official (documented, version-pinned, tested), or should the homepage promise
   only the agent path?
