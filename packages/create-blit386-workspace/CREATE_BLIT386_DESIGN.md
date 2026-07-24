# create-blit386 – Design and Roadmap

> Status (2026-07-23): latest **published** npm release is still 1.2.1 (`@blit386/kit@1.2.1` + `create-blit386@1.2.1`;
> dist-tag `latest`). On `main`, local pins are already ahead of that cut: `blit386.engineRange` and `BLIT386_RANGE` are
> `^1.4.0` (unpublished next cut), and hot-reload content is on `main` (section 12; kit docs/skills `hot-reload.md` /
> `use-hot-reload`, Catcher `onHotReload` example). Publishing is manual-only (see the 2026-07-14 policy change below) –
> there is no CI publish workflow. 24 skill directories under `packages/kit/content/skills/`. Claude/Cursor agent
> adapters are a single shared module (`packages/kit/src/adapters.ts`, `@blit386/kit/adapters`) used by both scaffold
> and `blit agents sync` / `add` (BT-350). Full preflight green. (No `main` HEAD SHA is pinned here on purpose: it goes
> stale within days. Run `git log --oneline -1` for the current one.)
>
> History: first published as `@blit386/kit@0.1.0` + `create-blit386@0.1.1` (section 11); 1.0.0 shipped 2026-06-14 (see
> below). All Phase 1.x code items merged to `main` (PRs #7–#10). All Phase 2 "Agents on tap" work is merged to `main` –
> the full `blit agents sync` write path (PR #15) plus the review-driven bug fixes (sync baseline / manifest pruning /
> vars persistence; shared-file note preservation across repeated syncs; test exit-code assertions) and the docs sweep.
> The fully-qualified docs-sync-path commit (`9c37894`) is already in `main` – it merged as the second parent of the PR
> #16 merge commit, so there is no pending `agent-docs` follow-up (the earlier "not yet merged" note was stale).
> `blit agents add <claude|cursor>` (Round 18, PR #17) and the kit-owned clean-merge drift fix (Round 19, PR #18) are
> both on `main`.
>
> Release status: 1.0.0 SHIPPED (2026-06-14). Both packages are published to npm at `1.0.0` (dist-tag `latest`):
> `@blit386/kit@1.0.0` and `create-blit386@1.0.0` (the published scaffolder manifest pins `@blit386/kit: 1.0.0`,
> confirming the pnpm `workspace:*` rewrite). Landed via PR #19 (squash) to `main` (`0eac7aa`); annotated git tag
> `1.0.0` (no `v` prefix, matching `0.1.0`) created on that merged commit. Pre-1.0 features included before cutting:
> `blit agents add` (Round 18) and the clean-merge drift fix (Round 19), plus a packaging-metadata pass
> (repository/bugs/homepage, author object, keywords). End-to-end smoke test from npm passed (`blit doctor` green;
> engine `1.1.1` compatible with kit `^1.1.1`; 7 kit files up to date). `BLIT386_RANGE` stays `^1.1.1`. Release notes:
> the GitHub Release at <https://github.com/blit386/create-blit386/releases/tag/1.0.0>. Note: `main` is protected, so
> releases land through a PR and the tag is created on the merged commit (not the pre-merge branch SHA).
>
> Release status: 1.1.0 SHIPPED (2026-06-14). Minor bump over 1.0.0, bundling everything merged to `main` since the
> 1.0.0 tag (PRs #20–#22): (1) the `blit migrate` codemod feature – typed migration registry + a dependency-free
> anchored codemod engine + `blit upgrade` wiring, with the auto-vs-review split (Round 21); and (2) the generated-game
> skills – the `migrate` AI skill (Round 22) plus the game-author capability skills and `share-the-game` (Round 23; 14
> at the time; 24 skill directories on disk today), with Claude keeping skill YAML frontmatter and Cursor commands
> stripping it. Both packages published to npm at `1.1.0`; the scaffolder manifest pins `@blit386/kit: 1.1.0` (pnpm
> `workspace:*` rewrite confirmed). Landed via PR #22 (squash) to `main`; annotated git tag `1.1.0` (no `v` prefix) on
> merged commit `a9e77fd`. `engineRange` and `BLIT386_RANGE` stay `^1.1.1`. Release notes: the GitHub Release at
> <https://github.com/blit386/create-blit386/releases/tag/1.1.0>.
>
> Release status: 1.2.0 SHIPPED (2026-06-19). Both packages published to npm at `1.2.0` (dist-tag `latest`):
> `@blit386/kit@1.2.0` + `create-blit386@1.2.0`. Headline change: the package/repo rename from `create-blit-tech` +
> `@blit-tech/kit` to `create-blit386` + `@blit386/kit` (GitHub repo `blit386/create-blit386`), plus a Claude
> skills/rules refresh and the design doc landing in-repo (PR #34). This release also moves the engine pin forward:
> `engineRange` and `BLIT386_RANGE` are now `^1.2.0` (was `^1.1.1`), tracking engine `blit386@1.2.0`. Landed via PR #39
> (`chore(release): 1.2.0`) on merged commit `ec563aa`; annotated git tag `1.2.0` (no `v` prefix). Release notes: GitHub
> Release at <https://github.com/blit386/create-blit386/releases/tag/1.2.0>.
>
> Engine update (2026-07-13): `blit386@1.3.0` is now live on npm (`latest`), which is the version carrying the audio
> subsystem. This opens the release-order gate in section 0 – the kit's audio content (`content/docs/audio.md`,
> `content/skills/play-a-sound/`, plus audio rows added to `content/AGENTS.md`, `blit-api-names.md`, and
> `show-debug-overlay`) can now be published.
>
> Release status: 1.2.1 SHIPPED (2026-07-14). Both packages published to npm at `1.2.1` (dist-tag `latest`):
> `@blit386/kit@1.2.1` + `create-blit386@1.2.1`. Headline change: the audio content gated above ships (PR #56), and
> `engineRange` / `BLIT386_RANGE` move to `^1.3.0` (was `^1.2.0`) – not cosmetic, `engineRange` feeds `blit doctor`'s
> D14 compatibility check against an already-installed engine, and leaving it at `^1.2.0` would have made `blit doctor`
> report a false "compatible" for a project still on `blit386@1.2.0` after syncing in the new audio docs. Landed via PR
> #60 (`chore(release): 1.2.1`) on merged commit `f19fafc`; tag `1.2.1` (no `v` prefix) on that commit. Smoke test
> passed (`blit doctor` green; `blit386 1.3.0 is compatible with this kit (^1.3.0)`). Release notes: the GitHub Release
> at <https://github.com/blit386/create-blit386/releases/tag/1.2.1>.
>
> Publishing policy change (2026-07-14): this release exposed that the `NPM_TOKEN` repository secret the tag-driven
> `publish.yml` workflow depended on was missing, so the workflow failed with `ENEEDAUTH` and `1.2.1` was published by
> hand instead (`pnpm publish`, kit first, per the now-only path in `PUBLISHING.md`). Rather than re-provision the
> secret, the decision is to never publish from CI again – `.github/workflows/publish.yml` is deleted, and every future
> release is a manual `pnpm publish` from vancura's machine. `PUBLISHING.md` and the `cbt-release` skill are rewritten
> to describe manual publishing as the only path, not a fallback. Tags are still pushed after a manual publish so the
> repo history keeps recording releases the same way; they no longer trigger anything.
>
> Dogfood finding (Round 15, still holds): the kit IR is game-author altitude; the `blit386` / `blit386-demos` repos are
> the kit's upstream maintainers, not consumer games – regenerating their `.cursor/`/`.claude/` from the current IR
> would delete library-maintenance tooling, so those configs were left untouched (a maintainer-profile IR is future
> work). Phase 3 migrations (Round 21–22): the kit ships a structured migration registry + codemod engine
> (`packages/kit/src/migrations/`), a `blit migrate` command (preview by default, `--write` to apply), and
> `blit upgrade` runs the applicable codemods after a version change. Safe renames auto-apply; ambiguous ones (`equals`,
> `tick`, ...) are reported for review, and the `migrate` AI skill (`content/skills/migrate/`) teaches the assistant to
> resolve them. 24 skill directories under `content/skills/` cover the full renderer / input / palette / timing / audio
> / post-process / hot-reload surface (plus `run`, `fix`, `migrate`, `share-the-game`). `npx blit` verified
> (2026-06-14): `blit doctor` + `blit run` pass on npm, pnpm, and yarn for a freshly scaffolded project (bun
> intentionally out of scope; see section 7). Still open (roadmap only – do not treat deleted GitHub issues as live
> links): generate engine `docs/deprecations.md` from the kit migration registry; auto-stamp `blit386.engineRange` at
> release; section 7 verification TODOs (StackBlitz, Windows, iPad/Safari); Catcher starter catch/miss sounds (deferred
> product work). Repo: <https://github.com/blit386/create-blit386> (public). Owner: Václav (vancura). First external
> user: Filipek. Started: 2026-06-07. Purpose: shared source of truth for the BLIT386 project scaffolder. We return to
> this across sessions so we do not lose decisions, findings, or deferred ideas.

This is the planning doc: roadmap, decisions, and monetization notes. It moved into the scaffolder repo in PR #34 and
now lives at the root of `blit386/create-blit386`, which is public – so write it as a doc a stranger may read, and keep
anything genuinely private out of it.

---

## 0. Release-order constraint: audio (READ BEFORE PUBLISHING THE KIT)

> Status (2026-07-14): CLOSED – the gate is satisfied and the kit's audio content has shipped. `blit386@1.3.0` (the
> audio-bearing engine release) went live on npm on 2026-07-13; PR #56 (`content/docs/audio.md`,
> `content/skills/play-a-sound/`, plus edits to `content/AGENTS.md`, `content/rules/blit-api-names.md`,
> `content/skills/show-debug-overlay/SKILL.md`, `content/skills/share-the-game/SKILL.md`,
> `content/skills/structure-a-game/SKILL.md`, `content/docs/getting-started.md`, and
> `content/docs/when-something-breaks.md`) merged to `main`; `@blit386/kit` and `create-blit386` published to npm at
> `1.2.1` on 2026-07-14 (PR #60, manual `pnpm publish` – see the top status block for why manual). Correction
> (2026-07-14): the "no version-pin bump needed" call originally made here was wrong for `engineRange` – see the "why
> this is safe" paragraph below, now corrected. `blit386.engineRange` in `packages/kit/package.json` and `BLIT386_RANGE`
> in `scaffold.ts` both shipped at `^1.3.0` in the `1.2.1` release. Catcher starter catch + miss sounds did not ship in
> `1.2.1` and remain deferred product work (the starter game has no `BT.soundPlay`/`synthPreset` calls yet); tracked
> historically under closed [#50](https://github.com/blit386/create-blit386/issues/50). Local pins on `main` have since
> moved to `^1.4.0` (unpublished next cut) – see the top status block.

The kit now documents the engine's audio subsystem – `content/docs/audio.md`, the `play-a-sound` skill, the audio rows
in `content/AGENTS.md` and `content/rules/blit-api-names.md`, and the audio overlay flags in `show-debug-overlay`. All
of it describes API that exists in the `blit386` source tree under `## 1.3.0 - Unreleased` and, at the time this section
was written, was NOT on npm yet (`latest` was `blit386@1.2.1`, which had no audio) – see the status line above for where
that stands now.

The rule:

> Do NOT publish `@blit386/kit` with the audio content until `blit386@1.3.0` is live on npm. Publish the engine first,
> then the kit.

Correction (2026-07-14): the paragraph below originally argued no version-pin change was needed. That conflated two
different mechanisms and was wrong for one of them.

`BLIT386_RANGE` (in `scaffold.ts`) is written into a freshly scaffolded game's `package.json` as its `blit386`
dependency range. Leaving it at `^1.2.0` really would have been harmless: `npm install` always resolves to the latest
version satisfying the range, so a fresh scaffold gets `1.3.0` regardless of whether the pin reads `^1.2.0` or `^1.3.0`.

`engineRange` (in `packages/kit/package.json`) is a different mechanism entirely – it does not describe what a fresh
install resolves to. `blit doctor` reads it via `kitEngineRange()` (`packages/kit/src/env.ts`) and compares it against
an **already-installed** `blit386` via `satisfiesCaretRange()`, which only checks "same major, and installed >= floor"
(`packages/kit/src/commands/doctor.ts`, the D14 compatibility check). Leaving `engineRange` at `^1.2.0` while the kit's
own content documents 1.3.0-only API means an existing project that syncs in the new audio docs (`npx blit agents sync`
/ `blit upgrade`) but still has `blit386@1.2.0` installed gets told "blit386 1.2.0 is compatible with this kit (^1.2.0)"
– a false green light, while `docs/audio.md` describes `BT.soundPlay`, which does not exist on their installed engine.
That is the exact "docs lied to me" failure D14 exists to catch; the stale `engineRange` just made D14 blind to this
particular drift. Bumping `engineRange` to `^1.3.0` puts that same user in the correct "needs update" branch of
`blit doctor` instead.

Conclusion: `BLIT386_RANGE` and `engineRange` are bumped to `^1.3.0` together for the `1.2.1` release – required for
`engineRange` (the D14 compatibility check needs it), harmless-but-consistent for `BLIT386_RANGE`.

If the kit shipped first, a kid would follow `docs/audio.md`, call `BT.soundPlay`, and get "not a function" – the exact
"the docs lied to me" failure this repo exists to prevent. The audio doc and skill each carry a line telling the reader
to run `npx blit upgrade` if `BT.soundPlay` is missing, which covers an existing project that upgrades the kit while
sitting on an older engine, but it is a safety net, not a substitute for the publish order.

---

## 1. The problem (grounded in what is on disk today)

- There is no path from "blit386 installed" to "a project." The proof is `filipek-basics.js` sitting loose at the
  workspace root: a single file, no `package.json`, no `index.html`, no agent config. It has `var`, commented-out
  experiments, a dead statement (`this.pos.y - 10;` computes nothing), and a stray `console.log('HEY')`. A real kid,
  with no scaffold at all. This is the pain to remove. Filipek's environment (confirmed): no Node.js installed, editor
  is Zed, no AI agent. So v0.1 must (a) teach installing Node.js in the README, (b) nail the no-agent path, and (c)
  document running the game from Zed's built-in terminal.
- Multi-agent config is already duplicated by hand. Both `blit386` and `blit386-demos` carry near-identical `.claude/`
  (3 rules + 12 `bt-*` skills), `.cursor/` (`.mdc` rules + `hooks.json` + shell hooks), `.zed/`, and an empty
  `.agents/`. `.cursor/rules/claude-canonical.mdc` documents the current strategy: CLAUDE.md is canonical, the rest are
  hand-written mirrors. No generator exists. The scaffolder must solve a problem the engine repos have not solved for
  themselves yet. Build it once, reuse it in three places (engine, demos, every scaffolded game).
- `docs/deprecations.md` is already a codemod table. It is a clean one-to-one old-to-new map (`BT.keyDown()` ->
  `BT.isKeyDown()`, `canvasId` -> `canvasID`, ...) with dated `@deprecated` markers in source. The "migration skill" we
  want is closer than it looks: that prose table wants to become machine-readable data.

---

## 2. Locked decisions (round 1, 2026-06-07)

| #   | Decision                              | Choice                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Versioning model                      | Independent kit version                                              | Engine on npm semver. The "kit" (AI files, docs, skills, hooks, templates) has its own version, pulled and regenerated by a project-local command. Engine and AI guidance evolve at different speeds.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D2  | Cloud strategy                        | Local-first now, cloud after verify                                  | Ship `npm create blit386` for desktop first. StackBlitz is wanted and low-risk (see finding F3). Hosted playground is deferred to Ambilab (section 6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D3  | Agent support                         | AGENTS.md generic is canonical; generate per-agent files from it     | Support all viable agents. Claude Code and Cursor files are generated from the canonical source. Generation is capability-aware, not lowest-common-denominator (Cursor hooks and contextual rules are more powerful than Claude's; use each agent's full power).                                                                                                                                                                                                                                                                                                                                                                             |
| D4  | Default UX                            | Short wizard                                                         | No silent default. 2–3 questions (JS or TS, which agent or none). Kid-friendly copy for the unsure. Pros pass flags to skip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D5  | Starter game                          | Catcher                                                              | A real tiny game (~80 lines): move a paddle, catch falling items for points, miss and lose a life. Teaches input, score, lose condition, palette. Must not depend on post-process effects (works on software fallback per F3).                                                                                                                                                                                                                                                                                                                                                                                                               |
| D6  | Kit packaging + name                  | `@blit386/kit`                                                       | Its own independently-versioned package (D1). Name resolved: create a free `blit386` npm org (sole owner) for the `@blit386/*` scope; no collision with the unscoped `blit386` engine (F5). Not Ambilab.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D7  | MVP build approach                    | Thinnest no-agent path, on the adapter pipeline                      | Filipek uses no agent, so v0.1 must nail the no-agent scaffold (JS + Catcher + `blit run` / `blit upgrade` + local docs). The generator's only v0.1 target is its cheapest one: emit `AGENTS.md` (useful as a plain doc) + `docs/`. Real Claude/Cursor adapters are phase 2. Built on the pipeline so adapters slot in without re-architecture.                                                                                                                                                                                                                                                                                              |
| D8  | Language support                      | JS in v0.1, TS in phase 2                                            | Template = shared base + thin language layer, so TS is an added layer later, not a fork. JS path still gets editor type-checking via JSDoc `@typedef` against the published `.d.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D9  | Repo layout                           | Hybrid: new repo for scaffolder + kit                                | `create-blit386` and `@blit386/kit` live in one new repo. Leave `blit386` and `blit386-demos` as their own repos, histories, and CI. Least disruption to what already publishes.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D10 | End-user package manager              | Auto-detect; npm default                                             | Scaffolder detects the manager that invoked it (`npm_config_user_agent`, like create-vite) and uses it for install + lockfile + documented run commands. Docs default to npm (ships with Node; zero extra install for kids). pnpm-only remains Václav's own-repo rule, not forced on end users.                                                                                                                                                                                                                                                                                                                                              |
| D11 | Pre-Node onboarding (chicken-and-egg) | Install instructions live OUTSIDE the project                        | A scaffolded README cannot teach installing Node, because running the scaffolder already requires Node. The Node install steps live on pages a brand-new user sees first: the `create-blit386` GitHub README (done 2026-06-12, including a copy-pasteable "send this to a friend" message) and later a docs site. Once StackBlitz is verified (section 7), the browser path becomes the lead option for users without Node: all onboarding docs must be written with two paths in mind – "in your browser (nothing to install)" first, "on your computer" second.                                                                            |
| D12 | `blit` CLI invocation                 | Document `npx blit ...` everywhere; lead with `npm run dev`          | `blit` is a bin inside `@blit386/kit`, a project dependency. Local bins are only on PATH inside package scripts, so plain `blit run` typed in a terminal fails with "command not found." All shipped docs (template README, AGENTS.md, kit docs, CLAUDE.md template) say `npx blit ...` and explain why in one beginner-friendly line. The scaffolded README leads with `npm run dev`; `blit` is presented as the helper, not the primary interface. Docs updated 2026-06-12; verify `npx blit` under npm/pnpm/yarn/bun (section 7).                                                                                                         |
| D13 | User edits vs `blit agents sync`      | Ownership model: manifest + three file classes; never clobber        | Without a plan, sync destroys user edits and people stop running it. Full spec in section 4.10. Summary: `.blit/manifest.json` records what the kit generated (with hashes and pristine bases); every emitted file is kit-owned (regenerate freely), shared (managed region between markers; user content preserved), or user-owned (scaffolded once, never touched again). On conflict: three-way merge when git is available, `<file>.new` + a friendly report otherwise. AGENTS.md managed markers + a "Your notes" section ship from v0.1.x so projects scaffolded today survive future syncs (markers added to kit content 2026-06-12). |
| D14 | Kit-engine compatibility              | Kit declares a supported engine range; `blit doctor` checks the pair | D1 (independent versioning) is about cadence, not content: the kit's docs describe the engine API, so a stale kit actively misleads an agent after an engine major. The kit's `package.json` gains a `blit386.engineRange` semver range; `blit doctor` and `blit upgrade` compare it against the installed `blit386` and report drift in Tier-1 voice ("Your local guides describe an older BLIT386 than the one installed. Update @blit386/kit, then run npx blit agents sync."). Phase 3 doc generation stamps the range automatically.                                                                                                    |

---

## 3. Research findings (2026-06-07, web-verified)

- F1. `npm create blit386@latest` is the correct, current convention. Vite, Next, etc. all use `create-*` /
  `npm create`. Not dated. SvelteKit's branded `sv create` is the only notable alternative pattern. We will support
  `npm create`, `pnpm create`, and `npx create-blit386`, plus a flags form for non-interactive use.
- F2. AGENTS.md is the cross-agent standard. Read natively by Cursor, Copilot, Zed, Gemini CLI, Windsurf, Aider, Codex
  (stewarded under the Linux Foundation). Caveat: Claude Code does not read AGENTS.md natively as of early 2026; the
  accepted workaround is AGENTS.md as source of truth with `CLAUDE.md` symlinked or generated from it. Implication: flip
  the current `claude-canonical` model – AGENTS.md becomes canonical, CLAUDE.md becomes generated.
- F3. WebGPU is not a blocker for the cloud story. WebGPU shipped across Chrome, Firefox, Safari, Edge as of Jan 2026,
  including Safari on iPadOS 26+. More importantly (Václav's correction): WebGPU is a client capability, not something
  StackBlitz provides or withholds, and BLIT386 already runs without WebGPU via the Canvas 2D software fallback. The
  only features unavailable on the fallback are fullscreen post-process effects (CRT, bloom, etc.). So the worst case in
  any sandbox or on any older device is "no post-process effects," never a broken canvas. This de-risks both the
  StackBlitz path and the iPad path. The starter game must therefore not depend on post-process effects.
- F4. StackBlitz WebContainers can run a Vite dev server in-browser. Whether the preview iframe exposes WebGPU was not
  confirmed by search, but per F3 it does not matter – software fallback covers it. Still worth a 30-minute manual test
  before we advertise StackBlitz, recorded in section 7.
- F5. The kit can be a scoped package without an npm "team." Václav owns the unscoped `blit386` package under user
  `vancura`. A free npm organization can have a single member, and an org named `blit386` grants the `@blit386` scope.
  The unscoped package `blit386` and the scope `@blit386` are separate namespaces, so there is no collision. Three
  options: (a) create the free `blit386` org and publish `@blit386/kit` (reserves the whole `@blit386/*` scope;
  tidiest); (b) unscoped sibling `blit386-kit` (zero setup, matches the existing unscoped names); (c) user scope
  `@vancura/blit386-kit` (works now, least on-brand). The `blit` CLI ships as a `bin` inside the kit package, so it
  needs no npm name of its own.

---

## 4. Architecture

### 4.1 Three independently-versioned things (do not conflate)

| Thing      | What                                                | Distribution                   | Cadence                              |
| ---------- | --------------------------------------------------- | ------------------------------ | ------------------------------------ |
| Engine     | `blit386` npm package (v1.1.1)                      | npm, semver                    | when the API changes                 |
| Kit        | AGENTS.md + local docs + skills + hooks + templates | see open question Q-KIT        | when AI guidance or tooling improves |
| Scaffolder | `create-blit386` CLI                                | npm, run once via `npm create` | rarely                               |

This resolves the "does it pull the package or the scaffolder?" question. The engine updates via npm. The kit updates
via a project-local command that re-pulls and regenerates the AI files. They move at different speeds.

### 4.2 Two skill audiences (do not reuse the engine's skills)

The engine's 12 `bt-*` skills (release, pr, issue-audit, security-run, perf, knip, spellcheck, ...) are
library-maintenance skills. A scaffolded game needs none of them. It needs game-author skills that do not exist yet:

- `run` – start the dev server, open the game.
- `add-sprite`, `play-a-sound`, `draw-shapes`, ... – guided feature recipes, one per engine capability.
- `fix` – diagnose a runtime error (e.g. forgot `await`, palette index out of range) using the local docs.
- `migrate` – bump blit386, run codemods, resolve the ambiguous renames (section 4.6).
- `share-the-game` – ship the game (build `dist/`, upload it to any static host).

Design these fresh. Do not copy the library skills into the template.

Built out (19 skills, see Phase 3). Two of the original sketch names were deliberately dropped: `add-enemy` and
`add-scene` – the engine has no physics, collision, entity, or scene system, so those skills would have to invent one.
`add-sound` shipped as `play-a-sound` (the engine's audio subsystem landed in blit386 1.3.0).

### 4.3 Canonical source -> capability-aware per-agent generation

The kit holds one canonical, human-readable source. A generator renders per-agent files from it. Because agents differ
in capability (D3), generation is capability-aware, not a dumb copy.

Confirmed canonical kit layout (intermediate representation; Q-GROUND-TRUTH-FORMAT resolved 2026-06-07):

```text
kit/
  AGENTS.md                 # canonical prose: persona, lifecycle, hard rules, the "router" map
  rules/*.md                # one rule per file, frontmatter declares scope (globs, alwaysApply, which agents)
  skills/<name>/SKILL.md     # game-author skills (name, description, when-to-use, steps)
  hooks/                    # hook scripts + hooks.manifest.json declaring intent in a neutral schema
  docs/*.md                 # progressive-disclosure deep dives (trimmed from engine docs/api-*.md)
  agents.config.json        # capability matrix: which adapter renders what, and how
```

Capability matrix (what each adapter emits from the same source):

| Capability                       | AGENTS.md (generic) | Claude Code                                                    | Cursor                                                                             | Zed                                   |
| -------------------------------- | ------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| Persona / hard rules             | the file itself     | `CLAUDE.md` (symlink or generated copy) + `.claude/rules/*.md` | `.cursor/rules/*.mdc` (globs, `alwaysApply`)                                       | reads `AGENTS.md`                     |
| On-demand actions (skills)       | described in prose  | `.claude/skills/<name>/SKILL.md`                               | `.cursor/commands` or scoped rules                                                 | reads `AGENTS.md`                     |
| Deterministic guardrails (hooks) | prose warning only  | `.claude/settings.json` hooks (PreToolUse / PostToolUse)       | `.cursor/hooks.json` (afterFileEdit, beforeShellExecution, `failClosed`) – richest | `.zed/settings.json` tool_permissions |
| Lockfile / .env block            | prose warning       | settings.json PreToolUse                                       | hooks.json `failClosed`                                                            | settings.json `always_deny`           |

This formalizes exactly what the engine repos do by hand today. Reuse the output to clean up the engine repos too.

The ground truth expresses INTENT; each adapter expresses its agent's CAPABILITY. Content differs per agent, not just
file location. Worked example – one guardrail ("never let the agent edit lockfiles or secrets"), four renderings:

Canonical intent (`kit/hooks.manifest.json`):

```json
{
  "id": "block-sensitive-writes",
  "intent": "Never let the agent edit lockfiles or secrets",
  "event": "before-file-write",
  "deny": ["pnpm-lock.yaml", "*.lock", ".env*"],
  "failClosed": true
}
```

- AGENTS.md (generic): a prose line under hard rules – "Never modify pnpm-lock.yaml, \*.lock, or .env files."
  Instruction only; most generic readers cannot enforce.
- Claude Code: a `.claude/settings.json` PreToolUse hook matching `Write|Edit` that blocks those paths.
- Cursor: a `.cursor/hooks.json` entry with `failClosed: true` – actually refuses the write. Richest enforcement.
- Zed: `.zed/settings.json` `tool_permissions.{edit_file,write_file}.always_deny` patterns.

Same intent; four formats; differing enforcement power (AGENTS.md only instructs, the others truly block). Rules and
skills follow the same pattern: a "rule" becomes an AGENTS.md bullet, a `.claude/rules/*.md`, and a glob-scoped
`.cursor/rules/*.mdc`; a "skill" becomes a `.claude/skills/<name>/SKILL.md`, a `.cursor/commands/<name>.md`, and a "read
docs/<topic>.md" pointer for agents without a skill mechanism. Adding a new agent = writing one adapter that maps these
intent types to that agent's files and capabilities.

### 4.4 Progressive disclosure (the "good student" model)

- AGENTS.md = thin router (~150 lines). Persona, the four lifecycle methods (`configure`, `init`, `update`, `render`),
  hard rules (integer coords via `Vector2i`/`Rect2i`, palette indices, `BT` namespace, no floats), and a map: "Need
  sprites? read `docs/sprites.md`. Need input? read `docs/input.md`." It points; it does not contain the API.
- docs/ = task-scoped deep dives, trimmed from the engine's existing `docs/api-*.md` to game-author altitude. The agent
  reads one on demand, spending minimal context.
- skills = the actions, loaded on demand. This is the proven Claude Code skill mechanism.

Net effect: the agent "just knows" how to start and where to look, without preloading the whole API.

### 4.5 Project-local CLI (lives in the scaffolded game)

A small CLI (name confirmed: `blit`, a `bin` of `@blit386/kit`) the user runs inside their game. Invocation is
`npx blit ...` (D12): the bin is project-local, not on the system PATH, so plain `blit` fails outside package scripts.
Every doc that mentions it uses the `npx` form and explains why once, kindly.

- `npx blit run` – dev server (thin wrapper over `npm run dev` / vite).
- `npx blit upgrade` – bump blit386, detect version delta, run codemods, show a diff, escalate non-mechanical changes to
  the AI migration skill (section 4.6). Refuses-with-kindness if unversioned (section 4.7).
- `npx blit agents add <name>` – generate config for a newly discovered agent from the canonical kit. Implemented Round
  18 for `claude` and `cursor`: regenerates that assistant's adapter output from the installed kit, writes the new
  files, and records them in the manifest (so later `sync` keeps them fresh). All-or-nothing: if any generated file
  would collide with an existing untracked user file, it writes only `<file>.new` copies, leaves the project and
  manifest untouched, and exits non-zero. (A half-add would let a later `sync` regenerate the colliding path, find no
  manifest entry, and clobber the user file – so the command refuses to partially activate the assistant.) A friendly
  no-op pointing at `sync` when the assistant is already set up.
- `npx blit agents sync` – regenerate kit-managed files after a kit update, honoring the ownership model (4.10).
  `--check` exits non-zero on drift without writing (CI-friendly; also surfaced by `blit doctor`).
- `npx blit doctor` – environment + project health check (node version, git presence, blit386 version, kit-engine
  compatibility per D14, agent-file drift per 4.10).

Short commands, copy-pasteable – matches the "I appreciate the commands are short" goal. The scaffolded README leads
with `npm run dev`; `blit` is the helper layer on top.

### 4.6 Migration and codemods (turn deprecations.md into a feature)

- Ship structured migrations with the engine (or kit): each dated migration exports (a) a machine-applicable codemod for
  mechanical renames (the one-to-one table – regex or ts-morph/jscodeshift) and (b) a human-readable summary of intent.
- Flip the source of truth: `docs/deprecations.md` becomes generated FROM the migration data, not hand-written.
- `blit upgrade` runs applicable codemods automatically, shows a diff, and for non-mechanical changes invokes the AI
  migration skill with only the relevant migration notes loaded into context.
- The AI skill is the fallback for what codemods cannot do safely. Precedent: React / Next ship `npx ...codemod`.

Status (Round 21–22): built kit-side. `packages/kit/src/migrations/` holds the typed registry (`registry.ts`, seeded
from `deprecations.md`) and a dependency-free, anchored codemod engine (`codemod.ts`). Each rename is classified `auto`
(receiver-anchored `BT.*`, distinctive `configure()` keys, distinctive method names) or `review` (generic names that
could match unrelated code: common method words `equals`/`contains`/`intersects`/`tick` and generic bootstrap keys
`canvasId`/`containerId`/`waitForDOMReady` – reported with a suggestion, never auto-rewritten). `blit migrate` previews
by default and writes only with `--write` (kid-safe: warns + confirms when the project is not under git); `blit upgrade`
runs the applicable codemods after a real version change and offers to apply them. Decisions / still open: (1) the
migration data lives in the kit, not the engine, so the feature ships without an engine release – the long-term "flip
`deprecations.md` to be generated from this data" is cross-repo and deferred (the two are mirrored by hand for now); (2)
no `ts-morph`/`jscodeshift` dependency yet – anchored string matching covers the current one-to-one table; (3) the AI
migration skill (`content/skills/migrate/SKILL.md`, Round 22) ships into generated games as a Claude skill and a Cursor
command: it runs `blit migrate --write` for the autos and resolves each `review` hit by checking the receiver type
(`equals`/`contains`/`intersects`/`tick`, generic bootstrap keys).

### 4.7 The no-git nag (kind, not scary)

Follow the engine's voice guide Tier 1 (plain English, one sentence on what is wrong, one concrete next step, no jargon,
no emoji, sentence case). Trigger on first run, `blit doctor`, and especially before `blit upgrade`.

Draft copy (refine later):

> Your game is not saved with version control yet. If a BLIT386 update ever changes something, you could lose your work.
> Run `git init` to start saving snapshots, or keep a copy of your folder somewhere safe before upgrading.

Before an upgrade on an unversioned project: strongly suggest a backup, or proceed only after explicit confirmation.
Never block a kid mid-flow without a clear, friendly way forward.

### 4.8 Wizard flow (zero flags)

As built in v0.1 (slightly richer than the original three-question sketch):

1. `npm create blit386@latest my-game` (or no folder argument – the wizard asks for a name).
2. "Which language do you want?" – JavaScript (recommended) or TypeScript. Both ship (the TS layer landed in phase 2);
   `--ts` skips this prompt.
3. "Do you use an AI coding assistant?" – None (recommended to start) / Claude Code (adds `CLAUDE.md`) / Cursor (adds
   `.cursor/rules`). "None" still emits `AGENTS.md` + local `docs/` (see 4.9).
4. "Add GitHub Actions CI (build + format check)?" – optional, default no.
5. Scaffold, `git init` + first commit (skippable), install, print the next steps.

Flags for pros and CI (built): `--yes`/`-y` (skip prompts, defaults), `--ts` (TypeScript layer), `--no-install`,
`--no-git`. Still unimplemented: `--agent=<name>` (the assistant can only be chosen in the wizard, or added afterwards
with `blit agents add`).

Robustness rules (v0.1.x backlog, required for agent-driven and CI use):

- Non-TTY input: when `stdin` or `stdout` is not a TTY (an AI agent or CI invoked the scaffolder), do not start the
  clack wizard – it would hang. Behave as `--yes` and print one informational line saying defaults were used and which
  flags exist. This is the single most common way scaffolders break under agents.
- Node version gate: check `process.versions.node` against the engine's floor (>= 22.18.0) as the very first step,
  before any prompt. On failure print one Tier-1 sentence ("BLIT386 needs Node 22.18 or newer; yours is X. Download the
  LTS from nodejs.org.") and exit. Do not let a kid discover this as an `EBADENGINE` wall of text mid-install.

### 4.9 Output structure (what gets emitted)

A minimal, real game (Catcher per D5), plus:

- `package.json` (blit386 from npm, dev/build scripts), `index.html` (canvas + container per `bootstrap` contract),
  `vite.config`, `public/`, the starter game file, `.gitignore`, `.editorconfig`, `biome.json`, `jsconfig.json`.
- `README.md` written for the chosen persona. Leads with `npm run dev` (D12); includes the overlay-key explanation
  (position-based Backquote + tap-the-corner fallback), a "Share your game" section (`npm run build` + drag `dist/` to a
  static host), and a pointer to `docs/when-something-breaks.md`.
- `docs/` local copies – always, even in no-AI mode (they are human docs first). Includes `when-something-breaks.md`,
  the beginner troubleshooting guide (added 2026-06-12).
- `AGENTS.md` – always emitted (it doubles as a human doc and carries the managed-region markers per 4.10). Generated
  agent dirs (`.cursor/`, `CLAUDE.md`, ...) only if an agent was chosen.
- The `blit` project-local CLI (via the `@blit386/kit` dependency).
- From v0.1.x: `.blit/manifest.json` seeding the sync ownership model (4.10).

### 4.10 User edits vs `blit agents sync`: the ownership model (D13)

The failure mode to design against: a user (or their agent) customizes `AGENTS.md` or a generated rule, later runs
`sync` to get kit improvements, and loses their edits. After that happens once, nobody runs `sync` again and the whole
"stays fresh" story dies. The fix is an explicit ownership model, enforced by a manifest, with a no-clobber guarantee.
This is the Debian conffile / `git merge-file` model adapted to kid-friendly output.

Three file classes. Every file the scaffolder or sync emits belongs to exactly one:

| Class                   | Examples                                                                                                 | Sync behavior                                                                                                                                                                                                  | How users customize                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kit-owned               | `docs/*.md` (kit names only), `.cursor/rules/kit-*.mdc`, `.claude/skills/kit-*/`, generated hook entries | Regenerated freely when unmodified; never clobbered when modified (see conflict rule)                                                                                                                          | Don't edit these; add sibling files with your own names (`.cursor/rules/my-*.mdc`). Kit files carry a one-line header: "Generated by @blit386/kit – your edits will be flagged on sync; put your own rules in a new file." |
| Shared (managed region) | `AGENTS.md`, generated `CLAUDE.md`                                                                       | Only the content between `<!-- blit-kit:managed:start -->` and `<!-- blit-kit:managed:end -->` is rewritten; everything outside (the seeded "Your notes" section and anything else) is preserved byte-for-byte | Write below the end marker. The file says so in plain language.                                                                                                                                                            |
| User-owned              | `README.md`, `src/game.js`, `index.html`, `vite.config`, `package.json`                                  | Scaffolded once; sync never touches them (engine bumps go through `blit upgrade`, not sync)                                                                                                                    | Edit freely.                                                                                                                                                                                                               |

Reserved namespace. Kit-owned files use a reserved prefix (`kit-*`) or fixed, documented names so user files can never
collide with a future kit file. Sync refuses to write outside its manifest + reserved names.

The manifest. Sync needs to know "did the user touch this?" without guessing. `.blit/manifest.json` (committed) records,
per generated file: path, file class, kit version that wrote it, and the SHA-256 of the reconciled on-disk content from
the last sync (at scaffold time this is just the as-generated content). Pristine as-generated copies are kept under
`.blit/base/` (small text files; also committed) so a real three-way merge is possible later. Two distinct references,
do not conflate them (Round 19): the recorded SHA-256 is the drift reference – `sync --check`/`doctor` compare the
current file against it, so a clean-merged file reads as in-sync rather than drifting forever. The `.blit/base/<path>`
copy is the pristine merge ancestor and the reference for "did the user change this kit file?" in the full-sync write
path. After a clean three-way merge the on-disk file holds the user's edits, so the recorded SHA-256 becomes the merged
hash while the base copy stays the pristine kit version (shared files already worked this way; Round 19 made kit-owned
files consistent).

Sync algorithm (deterministic, no AI involved):

1. For each file the new kit wants to emit:
   - Not in manifest and exists on disk -> never touch; report ("exists, not kit-managed, skipped").
   - In manifest, current hash == recorded hash (user never modified) -> overwrite with the new version; update
     manifest + base.
   - In manifest, hashes differ (user modified):
     - Shared file -> rewrite only the managed region; preserve the rest; update manifest.
     - Kit-owned file -> no clobber. If git is available: three-way merge (`git merge-file` semantics) using
       `.blit/base/<file>` as the ancestor; clean merge applies, conflict markers do not – fall through to `.new`.
       Without git or on conflict: write the incoming version as `<file>.new`, keep the user's file, and report one
       friendly line per file ("You changed docs/input.md, so I saved the new version next to it as docs/input.md.new.
       Compare them and keep what you like.").
2. Files in the manifest that the new kit no longer ships -> list them and suggest deletion; never auto-delete.
3. Exit summary in Tier-1 voice: N updated, N preserved, N need your eyes (with paths).

Modes. `npx blit agents sync --check`: report-only, non-zero exit on drift (CI; also run inside `blit doctor`).
`--force <path>`: explicit per-file clobber for users who want the kit version back.

Seeding now (v0.1.x), implementing later (phase 2): the markers in `AGENTS.md` and the manifest writing cost almost
nothing today and make every project scaffolded from now on sync-safe. The merge machinery lands with the real adapters
in phase 2.

---

## 5. Engine vs kit update flow (the answer to "Or, BLIT386?")

- Engine update: `pnpm up blit386` (or `blit upgrade`, which wraps it). Pulls the new npm package. May trigger codemods
  (4.6).
- Kit update: a separate step (`blit agents sync` after pulling a new kit version). Regenerates AGENTS.md, docs, skills,
  hooks, agent dirs. Independent of the engine version (D1).
- Open: how the kit reaches the project (Q-KIT below).

---

## 6. Deferred / future (do not forget)

- Cloud editor (StackBlitz): offer a one-click "open in StackBlitz" for a hosted edit + dev-server experience. Low-risk
  per F3 (software fallback covers any missing WebGPU). Good for the iPad-on-a-train user. Verify once (section 7), then
  add a button to the README and docs site. Doc rule (D11): once verified, the browser path becomes the FIRST option in
  all onboarding copy ("in your browser – nothing to install"), with the local path second; it fully sidesteps the
  pre-Node chicken-and-egg for new users. Note the starter game must be playable without a keyboard for this audience
  (pointer/touch input, section 9 phase 1.x).
- Hosted BLIT386 playground = Ambilab. This is Václav's monetization strategy, under a separate team and brand: domain
  ambilab.games, where users host their games (CodePen-style editor + live WebGPU preview + fork + hosting). Distant
  future, separate from the open-source scaffolder. The scaffolder should leave a clean seam so a game can later
  "publish to Ambilab" via the `blit publish` skill. Keep this out of the public `blit386` repo.

---

## 7. Verification TODOs and one-time actions

- [x] Create the free `blit386` npm org. Done 2026-06-07: npmjs.com/org/blit386 is live; engine package left unscoped.
      Steps in section 10.
- [ ] Manually confirm a Vite + blit386 project boots in a StackBlitz WebContainer and renders (WebGPU or software
      fallback). 30 minutes. Record result here. →
      [BT-301](https://linear.app/vancura/issue/BT-301/stackblitz-webcontainer-boot-and-render-verification)
- [ ] Confirm Safari on iPadOS 26 runs a scaffolded game (WebGPU or fallback). Requires touch input in Catcher first
      (phase 1.x) or the game is technically rendering but unplayable. →
      [BT-302](https://linear.app/vancura/issue/BT-302/safari-ipados-26-scaffold-and-play-verification)
- [x] Verify `npx blit run` / `npx blit doctor` work in a freshly scaffolded project under each detected package manager
      – the docs now promise the `npx` form (D12). DONE 2026-06-14 (macOS, Node 26.3.0) for npm, pnpm, and yarn. Tested
      against published `create-blit386@1.0.0` -> `@blit386/kit@1.0.0` + `blit386@1.1.1`. For each manager `blit doctor`
      detects the package manager from the lockfile, reports the engine version, the kit-compatibility line (`^1.1.1`),
      and "7 kit-managed files up to date"; `blit run` starts Vite v8.0.16 and serves the game on
      <http://localhost:5173> (HTTP 200, correct `<title>`, "Starting your game with <pm>"). yarn is Corepack classic
      1.22.22 and runs `yarn dev` (no `run` keyword) correctly. bun is intentionally not verified – it is a niche choice
      for this audience and the cost/benefit is poor; if a bun user hits a problem they can file an issue. Two
      environment notes, NOT product bugs: (1) Vite binds IPv6 `::1` only by default, so `127.0.0.1` curls refuse while
      `localhost`/`[::1]` return 200. (2) A local pnpm `minimumReleaseAge` gate made `pnpm create blit386@latest`
      resolve the SCAFFOLDER to the older `create-blit386@0.1.0`; a clean pnpm install of a kit `^1.0.0` project
      installs 1.0.0 (auto-recorded in `minimumReleaseAgeExclude`) and `doctor`/`run` both pass.
- [ ] Scaffold and run a game on Windows (PowerShell + cmd): wizard, `git init` absent-git path, install,
      `npm run     dev`, `npx blit doctor`. Most beginners are on Windows and nothing has been tested there. Record
      result here. → [BT-300](https://linear.app/vancura/issue/BT-300/windows-end-to-end-scaffold-and-play-verification)
- [x] Prototype `blit agents sync` from the canonical kit IR (phase 2), implementing the ownership model in 4.10. Done
      2026-06-13 (Round 15): full write path in `packages/kit/src/commands/agents.ts` + generate-to-memory
      `packages/kit/src/adapters.ts`, manifest `vars` for deterministic regeneration, git three-way merge + `.new`
      fallback, `--force`.

---

## 8. Open questions (next rounds)

Resolved:

- Q-NAME (resolved): `create-blit386` (so `npm create blit386`); project CLI `blit`, shipped as a `bin` inside the kit
  package (no npm name of its own).
- Q-GAME (resolved -> D5): Catcher.
- Q-KIT (resolved -> D6): its own package. Mechanism = a kit dependency the project installs; `blit agents sync`
  regenerates from the installed version; `pnpm up` updates it. (Not bundled in the engine, not GitHub-fetch.)
- Q-MVP (resolved -> D7): thinnest, on the adapter pipeline.
- Q-KIT-NAME (resolved -> D6): `@blit386/kit` via a free `blit386` npm org.
- Q-REPO (resolved -> D9): hybrid – new repo for scaffolder + kit; engine and demos stay separate.
- Q-FILIPEK-AGENT (resolved): Filipek uses no AI agent (and no Node.js yet; editor is Zed). v0.1 ships the no-agent
  path; no agent dirs emitted; README teaches Node.js install and running from Zed's terminal.
- Q-GROUND-TRUTH-FORMAT (resolved): canonical kit IR = `AGENTS.md` prose + `rules/*.md` + `skills/*/SKILL.md` +
  `hooks.manifest.json` + `agents.config.json` (see 4.3).
- Q-PKGMGR (resolved -> D10): auto-detect the package manager that invoked `create-blit386` (via
  `npm_config_user_agent`, like create-vite); default docs/examples to npm (ships with Node). pnpm-only stays Václav's
  own-repo rule.
- Q-ONBOARDING (resolved -> D11, 2026-06-12): pre-Node install instructions live outside the project (repo README +
  send-to-a-friend snippet; later the StackBlitz browser path leads).
- Q-CLI-PATH (resolved -> D12, 2026-06-12): all docs use `npx blit ...`; README leads with `npm run dev`.
- Q-SYNC (resolved -> D13, 2026-06-12): sync ownership model specified in 4.10 (manifest + three file classes +
  no-clobber merge). Markers seeded in the kit's AGENTS.md now.
- Q-KIT-ENGINE-COMPAT (resolved -> D14, 2026-06-12): kit declares `blit386.engineRange`; doctor/upgrade check it.

Still open: none.

---

## 9. Phase roadmap (sequencing)

Phase 0 – Design (now): this doc. Largely done; remaining: Q-GROUND-TRUTH-FORMAT, then a concrete v0.1 spec.

Phase 1 – v0.1 "Filipek can start" (no agent, JS): BUILT 2026-06-07 at `/Users/vancura/Repos/_BLIT386_/create-blit386`
(own git repo; not published; not committed by Claude).

- Hybrid repo (D9); pnpm monorepo with `@blit386/kit` + `create-blit386` (strict TS, built with tsup). The `blit386` npm
  org is created.
- Wizard (clack): language (JS; TS "coming soon"), agent (None; Claude/Cursor "coming soon"). `--yes` skips prompts.
- Emits: the JS Catcher game (uses `BT.systemPrint`, so NO font asset is shipped), `index.html` (pixel-perfect CSS),
  `vite.config.js`, a rendered `package.json` (blit386 from npm), `.gitignore`, a kid-friendly `README.md`, and the
  kit's `AGENTS.md` + local `docs/`. Auto `git init` + first commit (skippable). Package manager auto-detected.
- `blit run`, `blit doctor` (node/git/version), `blit upgrade` (bump + kind no-git nag + gated confirm), `blit agents`
  (friendly stub).
- Verified end-to-end: build + typecheck + lint pass; the scaffolder produces a correct tree with all placeholders
  rendered; the generated game runs in a browser on the published `blit386` 1.1.1 (WebGPU backend, clean console,
  score/lives logic working); `blit doctor` / `upgrade` nag / `agents` stub all behave. The pre-publish test linked the
  kit via a `file:` path; the template itself ships `@blit386/kit@^0.1.0`.
- PUBLISHED 2026-06-09: `@blit386/kit@0.1.0` then `create-blit386@0.1.0` are both live on npm (verified 2026-06-13 via
  the registry). Hand Filipek the one-line command once the next release ships (number TBD – see the status header; the
  Phase 1.x batch may go out as `0.1.1`, `0.2.0`, or `1.0.0`).
- Done when: `npm create blit386 my-game` -> installs -> runs -> Filipek plays Catcher and edits it.
- Built beyond the original v0.1 sketch (recorded 2026-06-12): `--no-install` / `--no-git` flags, an optional CI
  question, and light Claude (`CLAUDE.md`) / Cursor (`.cursor/rules`) templates in the wizard. These are static
  templates, not the phase-2 generator.

Phase 1.x – v0.1.x polish (from the 2026-06-12 review; small, do before or right after first real users):

Docs, DONE 2026-06-12 (in the repo, unpublished until the next kit/scaffolder release):

- [x] `docs/when-something-breaks.md` – beginner troubleshooting guide (console reading, blank screen, forgotten
      `await`, empty palette slot, `command not found`, port in use, undo/git restore). Shipped in kit `content/docs/`.
- [x] All docs use `npx blit ...` with a one-line why (D12); template README leads with `npm run dev`.
- [x] Template README: overlay key explained by position (below Esc; the symbol printed there varies by layout – on some
      keyboards `~` sits left of Z) with the Quake-console heritage, plus the no-keyboard fallback (tap the bottom-left
      corner; phones, tablets, Steam Deck).
- [x] Template README: "Share your game" section (`npm run build` + drag `dist/` to Netlify Drop / Cloudflare Pages).
- [x] Repo README: "Never used Node.js before?" section + send-to-a-friend snippet (D11 chicken-and-egg fix).
- [x] Kit `AGENTS.md`: `blit-kit:managed:start/end` markers + seeded "Your notes" user section (D13 groundwork).

Code, TODO (each is small and independently shippable):

- [x] Non-TTY guard in `create-blit386` (4.8): DONE 2026-06-13. When `stdin`/`stdout` is not a TTY, the CLI behaves as
      `--yes` and prints one Tier-1 info line naming the defaults used and the flags (`--yes`, `--no-install`,
      `--no-git`). Covered by an end-to-end test that runs the CLI with `stdio: 'ignore'` (with a timeout that fails if
      it ever hangs on a prompt). Logic in `src/env.ts` (`isInteractive`), wired in `src/index.ts`.
- [x] Node version gate at CLI start (4.8): DONE 2026-06-13. The very first step of `main()` checks
      `process.versions.node` against the engine floor (`NODE_FLOOR = 22.18.0`) and, on failure, prints one Tier-1
      sentence pointing at nodejs.org and exits before any prompt – no `EBADENGINE` wall. Pure comparison
      (`meetsNodeFloor`) lives in `src/env.ts` with unit tests across the boundary, pre-release tags, and short version
      strings.
- [x] Touch/pointer input for Catcher: DONE 2026-06-13. Paddle follows `BT.pointerPos(0)` when `BT.isPointerActive(0)`
      is true (mouse or touch); arrow keys / BTN_LEFT/RIGHT remain the fallback when no pointer is active.
      Beginner-friendly comments explain the slot-0 concept (multiple fingers; 0 = first), the center-under-pointer
      math, and why each branch exists. File: `templates/js/src/game.js`.
- [x] Write `.blit/manifest.json` + `.blit/base/` at scaffold time (4.10): DONE 2026-06-13. After emitting all project
      files, `scaffold()` in `src/scaffold.ts` computes a SHA-256 digest for each file, classifies it (`kit-owned` /
      `shared` / `user-owned` via a `classifyFile` helper), writes `.blit/manifest.json` with path / class / kitVersion
      / sha256 per entry, and copies pristine kit-owned + shared files to `.blit/base/` for future three-way merge.
      `collectTree` handles the `cpSync` docs tree (which returns void). Test asserts manifest presence, AGENTS.md
      classified as `shared`, a 64-char sha256, and the `.blit/base/AGENTS.md` base copy.
- [x] Kit-engine compatibility check (D14): DONE 2026-06-13. Added `"blit386": { "engineRange": "^1.1.1" }` to
      `packages/kit/package.json`. New helpers in `packages/kit/src/env.ts`: `satisfiesCaretRange` (installed major
      matches and version >= floor), `exceedsCaretRange` (installed major > range major = kit is stale), and
      `kitEngineRange` (reads the field from the kit's own package.json via `import.meta.url`). `blit doctor` now prints
      a success line when compatible, or a Tier-1 warn + info pair directing to `npx blit upgrade` (stale kit) or
      `npm update blit386` (stale engine). No third-party semver package added.

Phase 2 – "Agents on tap" (COMPLETE 2026-06-13, all merged to `main`):

- [x] TS language layer (`templates/ts/`, `--ts` flag, `ScaffoldOptions.language`; PR #11).
- [x] Claude adapter (generated from kit IR into `CLAUDE.md` + `.claude/rules/` + `.claude/skills/`; PR #12). Later
      parity with Cursor guardrails: `.claude/settings.json` + `.claude/hooks/` from `hooks.manifest.json` `claude:`
      blocks (BT-254).
- [x] Cursor adapter (generated into `.cursor/rules/*.mdc` + `.cursor/hooks.json` + `.cursor/hooks/` +
      `.cursor/commands/`; PR #13).
- [x] `blit agents sync --check`: drift detection, report-only, non-zero exit on drift (CI-safe); also integrated into
      `blit doctor`. Manifest shape validation and path-traversal guard added in follow-up (PR #14).
- [x] Dogfood: ran the generators against the engine repos (Round 15). Outcome: do not replace. The kit IR is
      game-author altitude (2 game rules, `run`/`fix` skills, 5 beginner docs, one shell-safety hook); the engine repos
      carry library-maintenance config (6+ repo-specific `.mdc` rules, 12 `bt-*` / 9 `demos-*` skills, RTK/format
      hooks). The engine repos are the kit's _upstream source_, not scaffolded games – overwriting their configs would
      delete maintenance tooling. A separate "maintainer profile" IR would be needed before any reuse; deferred (Phase
      3+).
- [x] Full `blit agents sync` write path (Round 15): regenerates kit output in memory from the installed kit IR,
      overwrites unmodified kit-owned files, managed-region merge for shared files (`AGENTS.md`/`CLAUDE.md`), git
      three-way merge for user-edited kit-owned files with a `<file>.new` fallback, manifest + base refresh, and
      `--force [path...]`. The scaffolder now records the template vars in `.blit/manifest.json` so regeneration is
      deterministic. Four new tests (clean Claude/Cursor parity, `--force` restore, shared managed-region merge).
- [x] Cut `1.0.0` release (2026-06-14, Round 20): both packages published to npm; `1.0.0` tag on the merged `main`
      commit (no `v` prefix); GitHub Release live. End-to-end smoke test green.

Phase 3 – "Stays fresh":

- [~] Structured migrations derived from `deprecations.md`; `blit upgrade` runs codemods + shows a diff; AI migration
  skill for non-mechanical changes. Round 21: registry + codemod engine + `blit migrate` + `blit upgrade` wiring shipped
  kit-side (auto vs review split). Round 22: AI migration skill (`content/skills/migrate/`) ships into generated games
  for Claude and Cursor, teaching the assistant to apply `--write` autos and resolve `review` hits by receiver type.
  Remaining (roadmap): generate engine `docs/deprecations.md` from this data (cross-repo). →
  [BT-299](https://linear.app/vancura/issue/BT-299/cross-repo-ci-to-generate-deprecationsmd-from-kit-migration-registry)
- Auto-stamp `blit386.engineRange` during release + kit docs drift detection CI (replaces the original "generate kit
  docs FROM engine `docs/api-*.md`" plan; full prose generation is not feasible). →
  [BT-293](https://linear.app/vancura/issue/BT-293/auto-stamp-enginerange-and-kit-docs-drift-detection-ci)
- [x] More game-author skills. Round 23 shipped 14 capability skills in `content/skills/` (`structure-a-game`,
      `draw-shapes`, `add-sprite`, `add-text`, `use-palette`, `animate-the-palette`, `move-and-time`,
      `scroll-with-camera`, `read-keyboard`, `read-pointer`, `read-gamepad`, `add-crt-effect`, `save-a-screenshot`,
      `show-debug-overlay`), later joined by `play-a-sound` and `share-the-game`, and by `smooth-the-motion`,
      `design-a-sound`, and `keep-it-fast` in Round 24, then `use-hot-reload` and `show-a-loading-screen` with the 1.4.0
      hot-reload work. With `run`, `fix`, and `migrate`, that is 24 skill directories today, covering the full renderer
      / input / palette / timing / audio / post-process / hot-reload surface. `share-the-game` IS the publish skill and
      it shipped: it teaches `build` + `preview` + upload `dist/` to a static host, which needs no deploy config in the
      scaffold. Still no `add-enemy`/physics skill – the engine has no game systems, and inventing one in a skill would
      be a lie. The current list is the directory itself, mirrored for humans in `packages/kit/README.md` – do not
      re-enumerate it here.

Phase 4 – "Reach":

- StackBlitz one-click (after the section 7 verify); iPad path. →
  [BT-292](https://linear.app/vancura/issue/BT-292/stackblitz-one-click-link-and-browser-first-onboarding-copy-rewrite)
  (blocked by [BT-301](https://linear.app/vancura/issue/BT-301/stackblitz-webcontainer-boot-and-render-verification))
- More agents (Zed, Gemini CLI, Windsurf) – cheap once the pipeline exists. →
  [BT-295](https://linear.app/vancura/issue/BT-295/multi-agent-adapter-support) (umbrella; sub-issues:
  [BT-296](https://linear.app/vancura/issue/BT-296/research-and-define-agent-adapter-spec-for-zed-gemini-cli-and-windsurf)
  research, [BT-297](https://linear.app/vancura/issue/BT-297/zed-agent-adapter) Zed,
  [BT-298](https://linear.app/vancura/issue/BT-298/gemini-cli-agent-adapter) Gemini CLI,
  [BT-294](https://linear.app/vancura/issue/BT-294/windsurf-agent-adapter) Windsurf)

Separate product (later): Ambilab (ambilab.games) hosted editor + game hosting; `blit publish` seam (section 6).

---

## 10. npm org setup steps (one-time, for `@blit386/kit`)

1. Sign in to npmjs.com as `vancura` (the account that owns `blit386`). Ensure 2FA is enabled – npm may require it to
   create an org and to publish.
2. Open the create-org page: avatar menu (top-right) -> "Add Organization", or go to `npmjs.com/org/create`.
3. Org name: `blit386`. This becomes the scope `@blit386`. Org names share a namespace with usernames, not with package
   names, so the existing `blit386` package does not block it. If the org name is somehow taken, fall back to unscoped
   `blit386-kit` (no org needed) or a variant like `blittech`.
4. Plan: choose Free ("unlimited public packages"). The paid tier is only for private packages; not needed.
5. If npm offers to add the existing `blit386` package to the org, skip it. The engine must stay published as unscoped
   `blit386`; never let a step rename it to `@blit386/blit386` or `pnpm add blit386` breaks for every consumer.
6. Finish. You now own `@blit386/*`. Leave membership as just you.
7. When publishing the kit: in its `package.json` set `"name": "@blit386/kit"` and
   `"publishConfig": { "access": "public" }` (scoped packages default to private; public access keeps it free – same
   pattern already used on the engine). Publish from a logged-in shell.

---

## 11. Publishing to npm (procedure + status)

Status (verified 2026-07-14 against the npm registry): `@blit386/kit@1.2.1` and `create-blit386@1.2.1` are published and
live (`dist-tags.latest = 1.2.1` on both). Prior releases: `0.1.0` / `0.1.1`, then `1.0.0` (2026-06-14), then `1.1.0`
(2026-06-14; migrate codemods + game-author skills), then `1.2.0` (2026-06-19; `create-blit-tech`/`@blit-tech/kit`
rename to `create-blit386`/`@blit386/kit`), then `1.2.1` (2026-07-14; audio content + `engineRange` fix, see the top
status block). Git tag `1.2.1` (no `v` prefix) on merged commit `f19fafc`; release notes live in the GitHub Release at
<https://github.com/blit386/create-blit386/releases/tag/1.2.1> and, as of this release, also in a `RELEASE.md` at the
repo root (earlier text here said no such file existed – that was true until 1.2.1 added one).

Publishing is manual-only (policy change 2026-07-14, see the top status block): there is no
`.github/workflows/publish.yml` and no `NPM_TOKEN` secret. Nothing publishes on a tag push. Tags are still cut and
pushed after a manual publish, purely as a release marker for the repo history.

Procedure (repeat for each release; bump versions first – a version, once published, is permanent):

1. Commit first (`pnpm publish` refuses a dirty tree; otherwise pass `--no-git-checks`).
2. `npm login`, then `npm whoami` must print `vancura` (sole owner of the free `blit386` org).
3. `pnpm install && pnpm -r build` (the `prepack` script also rebuilds on publish).
4. Publish the KIT FIRST (the scaffolder depends on it): `pnpm --filter @blit386/kit publish` (try `--dry-run` first;
   add `--otp=<code>` if 2FA). It is scoped; `publishConfig.access: public` keeps it a free public package.
5. Publish the SCAFFOLDER SECOND: `pnpm --filter create-blit386 publish`. In `--dry-run`, confirm the manifest shows
   `"@blit386/kit": "<version>"`, NOT `"workspace:*"`.
6. Verify: `npm view @blit386/kit version`; smoke test `npm create blit386@latest smoke-test` -> install -> run.
7. Tag the merged commit on `main` (`git tag <version> && git push origin <version>`) and publish a GitHub Release
   (`gh release create <version> --title "Release <version>" --notes-file ...`) – this records the release; it does not
   trigger anything.

Critical rules: ALWAYS `pnpm publish`, never `npm publish` (only pnpm rewrites `workspace:*` to a real version); kit
before scaffolder; with 2FA publish one package at a time (each needs a fresh OTP).

---

## 12. Hot reload (engine 1.4.0+)

### What shipped

New games from `create-blit386` get the `blit386()` Vite plugin in `templates/base/vite.config.js`. That plugin is a
subpath export of the engine (`blit386/vite`). In dev it:

1. Appends a tiny snippet to the game entry module (the file that imports `blit386` and calls `bootstrap(`).
2. Watches `public/` and broadcasts asset-change events so images, audio, and `.btfont` files replace in place.

The snippet's job is registration only. The literal `import.meta.hot.accept()` must appear in the transformed module
source (Vite marks self-accepting modules by static analysis). The engine owns all swap logic after
`registerHotReload(import.meta.hot)` runs. Game authors never call `registerHotReload` by hand.

Tiered swap (Defold-style), decided once and kept as the product model:

| Edit                                              | Behavior                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `update()` / `render()` / related method bodies   | Prototype swap; instance fields kept                                     |
| `init()` / constructor / class field initializers | Fresh instance + `init()`; optional `onHotReload` can restore a snapshot |
| `configure()` hardware settings                   | Full page reload via `hot.invalidate()`                                  |

Kit docs (`content/docs/hot-reload.md`), the `use-hot-reload` skill, `AGENTS.md`, and the Catcher templates (commented
`onHotReload` example) teach the same model.

### Delivery: new games in the template; existing games opt in

**Decision:** scaffold template changes apply to **new games only**. The starter `vite.config.js`, `index.html`,
`src/game.*`, and `package.json` are user-owned – `blit agents sync` never rewrites them. Existing projects therefore
keep full-page-reload behavior until the owner opts in.

**Rationale:** rewriting a user's Vite config from sync would surprise people who customized it, and a forced migrate as
part of every kit sync would blur ownership. Documenting a one-line (plus import) opt-in is enough for anyone who wants
the feature.

**How existing games opt in:**

- Prefer: add `import { blit386 } from 'blit386/vite'` and `plugins: [blit386()]` to `vite.config.js`, then restart the
  dev server (needs blit386 1.4.0+).
- Or: `npx blit migrate --write` / `npx blit upgrade`, which can enable the same plugin on a standard `defineConfig`
  when the engine range supports it.

Kit `docs/` and skills **are** kit-owned, so `npx blit agents sync` delivers the hot-reload documentation to existing
games even before they enable the plugin.

Engine range pins (`BLIT386_RANGE`, kit `blit386.engineRange`) are release concerns – bump them when publishing a kit /
scaffolder cut that expects 1.4.0 on npm, not as a silent side effect of a docs PR.

---

## Changelog

- 2026-07-23: Status accuracy pass (BT-341). Top banner now states published npm is still `1.2.1` while local
  `engineRange` / `BLIT386_RANGE` on `main` are already `^1.4.0` (unpublished next cut), hot-reload content/section 12
  is on `main`, skill count is 24, and tests are 47 (25 scaffolder + 22 kit). Deleted GitHub issue links #23–#33
  (HTTP 410) replaced with Linear trackers (BT-300/301/302 for section 7 verifies; BT-299/293 for remaining Phase 3
  roadmap; BT-292/295–298/294 for Phase 4). Catcher starter catch/miss sounds stay deferred product work. The 2026-07-13
  changelog entry below is historical and superseded by later entries / this pass.
- 2026-07-23: Section 12 added – hot reload for scaffolded games (engine 1.4.0+): snippet ↔ engine contract, tiered swap
  model, and the explicit "new games only" delivery decision (existing games opt in via a one-line `vite.config.js` edit
  or `blit migrate`). Kit docs/skills (`hot-reload.md`, `use-hot-reload`) and the Catcher commented `onHotReload`
  example teach the same model.
- 2026-07-14: `1.2.1` shipped (PR #56 audio content, PR #60 release). The tag-driven `publish.yml` workflow failed on
  the `1.2.1` tag push with `ENEEDAUTH` – the `NPM_TOKEN` repository secret was missing. Rather than re-provision it,
  the decision is publishing is manual-only from now on: `.github/workflows/publish.yml` is deleted, `PUBLISHING.md` and
  the `cbt-release` skill are rewritten so manual `pnpm publish` is the only documented path (not a fallback), and
  `1.2.1` itself was published that way. Tags are still cut and pushed after a manual publish as a release marker; they
  no longer trigger anything. See the top status block and section 11 for details.
- 2026-07-14: Correction to the 2026-07-13 entry below and to section 0. That entry's "no version-pin bump needed –
  `BLIT386_RANGE` / `engineRange` stay `^1.2.0`" call was wrong for `engineRange`: it conflated the scaffold-pin
  mechanism (`BLIT386_RANGE`, harmless to leave since `npm install` always resolves to the latest satisfying version)
  with the kit's own `blit386.engineRange` field, which `blit doctor`'s D14 compatibility check
  (`packages/kit/src/commands/doctor.ts`, `env.ts`) compares against an already-installed engine. Leaving it at `^1.2.0`
  meant `blit doctor` would report a false "compatible" for a project on `blit386@1.2.0` after syncing in the new
  1.3.0-only audio docs. Fixed for the `1.2.1` release: `packages/kit/package.json`'s `blit386.engineRange` and
  `scaffold.ts`'s `BLIT386_RANGE` both bumped to `^1.3.0`. See the corrected "why this is safe" paragraph in section 0.
- 2026-07-13: Status audit (no code changes). Verified current state against npm and GitHub rather than trusting the doc
  at face value. Findings: (1) `blit386@1.3.0` (the audio-bearing release) is live on npm as `latest` – confirmed via
  `npm view blit386 dist-tags`. This satisfies the section 0 release-order gate for the first time. (2) `@blit386/kit`
  and `create-blit386` are still published at `1.2.0`; the audio content described in section 0
  (`content/docs/audio.md`, `content/skills/play-a-sound/`, and edits to `content/AGENTS.md`,
  `content/rules/blit-api-names.md`, `content/skills/show-debug-overlay/SKILL.md`,
  `content/skills/share-the-game/SKILL.md`, `content/skills/structure-a-game/SKILL.md`,
  `content/docs/getting-started.md`, `content/docs/when-something-breaks.md`) is committed on the open, unmerged
  `chore/kit-update` branch (PR #56) – none of it is on `main` yet. (3) Tracking issue
  [#50](https://github.com/blit386/create-blit386/issues/50) is open with its four checklist items unchecked. (4) Phase
  3 items #26 (generate `deprecations.md` from migration data) and #27 (auto-stamp `engineRange` + drift CI) remain
  open, as does all of Phase 4 (#23–25, #28–33 – StackBlitz, iPad, Windows, and the Zed/Gemini CLI/Windsurf adapters).
  (5) #37 (non-interactive scaffolding support) is already implemented and tested in code – the `isInteractive` TTY
  check plus `--yes`/`--ts`/`--no-install`/`--no-git` flags in `src/index.ts`, covered by the "scaffolds without --yes
  when no interactive terminal is attached" test in `scaffold.test.mjs` – the GitHub issue just hasn't been closed yet.
  Updated section 0's status line and the top status header to record this; otherwise this doc was already current with
  the `/kit` → `@blit386/kit` naming fixes from a prior session. Next actions for whoever picks this up: merge PR #56,
  then publish the kit before the scaffolder (section 11); no version-pin bump needed – `BLIT386_RANGE` / `engineRange`
  stay `^1.2.0` (the existing caret range already admits `1.3.0`).
- 2026-06-07: Created. Round 1 decisions D1-D4 locked. Findings F1-F4 recorded. Architecture drafted. Open questions
  Q-NAME, Q-GAME, Q-KIT, Q-MVP, Q-REPO queued.
- 2026-06-07: Round 2. Decisions D5 (Catcher), D6 (kit as own package), D7 (thinnest MVP on adapter pipeline). Finding
  F5 (npm scope without a team). Added the intent-vs-capability worked example to 4.3. Resolved Q-NAME, Q-GAME, Q-KIT,
  Q-MVP. New open questions: Q-KIT-NAME, Q-GROUND-TRUTH-FORMAT, Q-FILIPEK-AGENT (Q-REPO still open).
- 2026-06-07: Round 3. D6 name resolved (`@blit386/kit` via free org), D7 refined (Filipek = no agent), D8 (JS in v0.1,
  TS phase 2), D9 (hybrid repo). Added section 9 phase roadmap. Resolved Q-KIT-NAME, Q-REPO, Q-FILIPEK-AGENT. Only
  Q-GROUND-TRUTH-FORMAT remains open.
- 2026-06-07: Round 4. Q-GROUND-TRUTH-FORMAT resolved (kit IR confirmed). Recorded Filipek's environment (no Node.js,
  Zed editor). Added section 10 (npm org setup steps). New open question Q-PKGMGR (auto-detect package manager,
  npm-default for end users). Engine requires Node >= 22.18.0.
- 2026-06-07: Round 5. Q-PKGMGR resolved -> D10 (auto-detect, npm default for end users). npm org `blit386` created
  (npmjs.com/org/blit386). All design questions resolved; moving to build planning for v0.1.
- 2026-06-07: Round 6. v0.1 BUILT and verified end-to-end at `create-blit386/` (two strict-TS packages, the Catcher
  game, the `blit` CLI, the kit's AGENTS.md + docs). The generated game was confirmed rendering on WebGPU via Vite
  against published `blit386` 1.1.1, with working score/lives logic and a clean console. Not published; not committed by
  Claude. Catcher uses `BT.systemPrint` (no font asset). Remaining: the manual npm publish step.
- 2026-06-09: Round 7. Pre-publish polish: added ISC `LICENSE` (root + both packages), a `README.md` per package,
  `prepack` build scripts, and a hardened `.gitignore` (re-verified no build/dep artifacts are staged). Documented the
  npm publish procedure (section 11). Began publishing: `@blit386/kit@0.1.0` is up (read-API propagating);
  `create-blit386` to follow. Repo at `create-blit386/` is git-init'd; initial commit message drafted via `/commit-msg`
  (not yet committed by Claude).
- 2026-06-09: Round 8. Repo committed and pushed to GitHub: <https://github.com/blit386/create-blit386> (public).
- 2026-06-12: Round 9. Design review (all-audiences pass: beginners, experts, no-AI, AI, agents). New decisions D11
  (pre-Node onboarding lives outside the project; StackBlitz leads once verified), D12 (`npx blit ...` everywhere;
  README leads with `npm run dev`), D13 (sync ownership model – full spec in new section 4.10), D14 (kit declares a
  supported engine range; doctor checks). Section 4.8 rewritten to match the built wizard + non-TTY and Node-gate rules;
  4.9 fixed (AGENTS.md is always emitted) and updated. Section 7 gained Windows, `npx blit`, and touch-input
  verification TODOs. Section 9 gained the Phase 1.x backlog. Docs shipped same day: `when-something-breaks.md` (new kit
  doc), `npx blit` sweep across template README / AGENTS.md / getting-started / CLAUDE.md template / package README,
  overlay-key explanation (position-based Backquote, Quake heritage, tap-the-corner fallback), "Share your game" README
  section, repo-README Node onboarding + send-to-a-friend snippet, and the AGENTS.md managed markers + "Your notes"
  section. Code items (non-TTY guard, Node gate, Catcher touch input, manifest seeding, engine-range check) recorded as
  Phase 1.x TODOs, not yet implemented.
- 2026-06-13: Round 10. Verified actual state against npm + the repo: both packages are published at `0.1.0` (the Phase
  1 "REMAINING: publish" and section 11 "confirm/pending" lines were stale – corrected). Implemented the first two Phase
  1.x code items in `create-blit386`: the Node-version gate (friendly Tier-1 message + exit before any prompt when below
  `22.18.0`) and the non-TTY guard (no TTY -> act as `--yes` and print one info line). Both back pure helpers in a new
  `packages/create-blit386/src/env.ts` (`meetsNodeFloor`, `isInteractive`, `NODE_FLOOR`), emitted as its own dist entry
  via `tsup.config.ts` so tests import it without running the CLI. Added unit tests for `meetsNodeFloor` and an
  end-to-end non-TTY test (timed, fails if the wizard hangs); added `EBADENGINE` to `cspell.json`. Full preflight green
  (format, lint, typecheck, spellcheck, knip, docs:links, build, 7/7 tests). Merged to `main` as PR #7
  (CodeRabbit-approved) and unpublished. `package.json` bumped to a provisional `0.1.1`, but the release number is
  deferred until the Phase 1.x batch is done (could be `0.1.1` / `0.2.0` / `1.0.0`). Remaining Phase 1.x code: Catcher
  touch input, `.blit/` manifest seeding, engine-range check (D14).
- 2026-06-13: Round 11. Implemented the remaining three Phase 1.x code items (see Round 10 for the first two). Catcher
  touch/pointer input (PR #8): `update()` in `templates/js/src/game.js` now checks `BT.isPointerActive(0)` first; when
  true, centers the paddle on `BT.pointerPos(0).x`; arrows are the fallback. File-level header and template `README.md`
  "Run it" section updated to document pointer-first behavior. `biome.json` extended to cover `templates/**/*.js`;
  `cspell` lint-staged invocation gained `--no-must-find-files` (templates are in cspell's `ignorePaths`; without the
  flag, pre-commit hooks failed with "0 files checked"). `.blit/` manifest seeding (PR #10): `scaffold()` collects every
  written file path, classifies as `kit-owned` / `shared` / `user-owned`, computes SHA-256, writes
  `.blit/manifest.json` + `.blit/base/` pristine copies. Test strengthened to compute a fresh sha256 from the actual
  file and `deepStrictEqual` the base copy bytes. D14 engine-range check (PR #9):
  `"blit386": { "engineRange": "^1.1.1" }` in `packages/kit/package.json`; new helpers `satisfiesCaretRange`,
  `exceedsCaretRange`, `kitEngineRange`; `blit doctor` reports compatibility in Tier-1 voice. `kitEngineRange` URL path
  bug fixed (was `../../package.json` resolving to non-existent `packages/package.json`; corrected to `../package.json`
  → `packages/kit/package.json`). All four PRs merged to `main`. Release version not bumped yet.
- 2026-06-13: Round 12. Phase 2 Items 1–3 implemented. Item 1 (TypeScript language layer, PR #11): added `templates/ts/`
  (thin layer with `package.json.tmpl`, `tsconfig.json`, `src/game.ts`); wired `language: 'js' | 'ts'` through
  `ScaffoldOptions`, wizard, and `--ts` CLI flag; `index.html` and `README.md` in `base/` use
  `{{entryFile}}`/`{{gameFile}}` placeholders. Item 2 (Claude adapter, generated, branch `agents-claude`): replaced
  static `templates/optional/claude/CLAUDE.md.tmpl` with `generateClaudeAdapter()` that reads kit IR
  (`content/AGENTS.md`, `content/rules/*.md`, `content/skills/*/SKILL.md`) and emits `CLAUDE.md` (managed region),
  `.claude/rules/`, `.claude/skills/`. Added kit IR source files: `content/rules/blit-api-names.md`,
  `content/rules/blit-integer-coords.md`, `content/skills/run/SKILL.md`, `content/skills/fix/SKILL.md`,
  `content/agents.config.json`. Item 3 (Cursor adapter, generated, branch `agents-cursor`): deleted
  `templates/optional/cursor/` and added `generateCursorAdapter()` that emits `.cursor/rules/*.mdc` (frontmatter
  preserved), `.cursor/hooks.json` (translated from `content/hooks.manifest.json`), `.cursor/hooks/shell-safety.sh`, and
  `.cursor/commands/*.md` (one per skill). Added `content/hooks.manifest.json` and `content/hooks/shell-safety.sh`. Both
  branches merged together; preflight green (9/9 tests). Item 4 (`blit agents sync --check`) is next.
- 2026-06-13: Round 13. Phase 2 Item 4: `blit agents sync --check` implemented. Replaced the stub in
  `packages/kit/src/commands/agents.ts` with a real drift-detection algorithm: reads `.blit/manifest.json`, computes
  SHA-256 of each kit-owned and shared file on disk, compares against the manifest-recorded hash, and reports any that
  have drifted (user-modified or deleted). Exits non-zero on drift (CI-safe). Full sync (rewriting kit-owned files and
  managed regions) remains a stub pointing to `--check`. Integrated drift check into `blit doctor` (appended at end of
  checkup, no exit-code change for doctor). Updated `cli.ts` help text. Added two end-to-end tests (exit 0 on clean
  project; exit 1 with drifted `.claude/rules/blit-api-names.md`). Fixed a `SyntaxError` caused by `await import()` in a
  sync test callback – moved `writeFileSync` to the top-level import. Preflight green (11/11 tests). Phase 2 complete.
- 2026-06-13: Round 14. CodeRabbit review fixes; all Phase 2 PRs merged to `main`. PR #13 (Cursor adapter,
  `agents-cursor`): added python3 availability pre-check to `shell-safety.sh` (exits non-zero with a deny response if
  python3 is absent – true fail-closed); added `length > 0` guards before `[0]` array accesses in the hooks.json test.
  PR #14 (`blit agents sync --check`, `agents-sync`): added `Array.isArray(manifest.files)` shape validation after
  JSON.parse; added path-traversal guard to the entry loop (reject absolute paths and `..` escapes, use `path.resolve` +
  root-containment check). All PRs reviewed by CodeRabbit and merged. `main` is now at `afea44c`. Release version still
  not bumped – next step is `1.0.0`.
- 2026-06-13: Round 15. Release prep + Phase 2 finish. (1) 1.0.0 version bump: both `packages/kit/package.json` and
  `packages/create-blit386/package.json` set to `1.0.0`; `pnpm install` synced the lockfile; full preflight green.
  Commit, `v1.0.0` tag, and npm publish are intentionally not done – held for an explicit go (kit first, per
  PUBLISHING.md). (2) Dogfood (finding, no file changes): ran the scaffolder's `generateClaudeAdapter` /
  `generateCursorAdapter` against scratch projects and compared to the engine repos' real `.cursor/`/`.claude/`.
  Conclusion: do not replace. The kit IR targets game authors (2 rules, `run`/`fix` skills, 5 beginner docs, one
  shell-safety hook); `blit386` / `blit386-demos` carry maintainer config (6+ repo-specific rules, 12 `bt-*` / 9
  `demos-*` skills, RTK/format hooks) and are the kit's _upstream_, not consumers. Overwriting would delete maintenance
  tooling; a future "maintainer profile" IR is the prerequisite (Phase 3+). The sibling repos were left untouched. (3)
  Full `blit agents sync` write path: ported the adapter generation into a new generate-to-memory module
  `packages/kit/src/adapters.ts` (byte-identical to the scaffolder's adapters), then implemented `runFullSync` in
  `packages/kit/src/commands/agents.ts`: regenerate the installed kit's output in memory, then per the 4.10 ownership
  model – overwrite unmodified kit-owned files, managed-region merge for shared files, `git merge-file` three-way merge
  for user-edited kit-owned files with a `<file>.new` fallback when git is unavailable or conflicts, refresh
  `.blit/manifest.json` + `.blit/base/`, and support `--force [path...]`. Tier-1 summary output. The scaffolder now
  records the scaffold-time template vars in the manifest (`BlitManifest.vars`) so sync regenerates deterministically
  regardless of the environment. Four new tests (clean Claude + clean Cursor parity → zero changes, `--force` restore,
  CLAUDE.md managed-region merge preserving a user note); 15/15 pass, preflight green. (4) Docs sweep: updated all docs
  for the new sync capability and to clear leftover Phase 2 staleness – `packages/kit/README.md` (`blit agents sync` is
  now real, with `--check`/`--force`; `add` still pending), `packages/create-blit386/README.md` (added
  `npx blit agents sync` + `--ts` + agent-config note), repo `README.md` (Status now reflects Phase 2 complete; CLI list
  gains `agents sync`), repo `CLAUDE.md` (scaffold flow incl. adapter generation + manifest step, template layout `ts/`
  and removed `optional/cursor|claude`, JS-by-default rule, kit-content table points at `content/rules/*.md`, new
  where-to-find rows for sync/adapters/manifest), and the workspace `CLAUDE.md` create-blit386 status. docs:links +
  spellcheck green. Nothing committed.
- 2026-06-13: Round 16. Documentation accuracy audit (full sweep of all 27 markdown/mdc docs + JSON config against the
  real code). Fixes: (a) `content/docs/basics.md` `configure()` example imported `bootstrap, BT` but used `Vector2i` –
  added the missing import. (b) `content/agents.config.json` cursor `emits` omitted the generated
  `.cursor/hooks/{script}` (shell-safety hook) – added it. (c) repo `CLAUDE.md` said "five beginner docs" (there are
  six: getting-started, basics, drawing, input, palette, when-something-breaks) – corrected the count and added the two
  missing rows to the kit-content audit table. (d) Repo agent rules were stale: `.cursor/rules/template-structure.mdc`
  - `.claude` mirror still listed `optional/{cursor,claude}` (deleted – those configs are now generated from the kit
    IR), and the `.claude` mirror lacked the `ts/` layer – synced both to reality. (e)
    `.cursor/rules/docs-sync-required.mdc`
  - mirror pointed at the deleted `templates/optional/cursor/.../blit386-api-names.mdc` – repointed at
    `packages/kit/content/rules/*.md` and added a row for CLI/adapter/`agents sync` changes. (f) `claude-canonical.mdc`
    "plain JavaScript" line updated to note the opt-in TypeScript layer (and fixed a wrong `blit init --ts` reference –
    TS is a scaffolder flag, `npm create blit386 ... --ts`). (g) `create-blit386/src/index.ts` header flag list and
    `packages/create-blit386/README.md` "What you get" now mention `--ts` / `src/game.ts`. Full preflight green (15/15
    tests). Nothing committed.
- 2026-06-14: Round 23. Game-author skills (Phase 3 "more game-author skills"). Added 14 capability recipes under
  `packages/kit/content/skills/` (the set has since grown to 19 – see Phase 3), grounded in an authoritative audit of
  `BTAPI.ts` + `BLIT386.ts` and the demo suite (33 demos then; 39 today): `structure-a-game`, `draw-shapes`,
  `add-sprite`, `add-text`, `use-palette`, `animate-the-palette`, `move-and-time`, `scroll-with-camera`,
  `read-keyboard`, `read-pointer`, `read-gamepad`, `add-crt-effect`, `save-a-screenshot`, `show-debug-overlay`. Together
  they cover every capability area the engine exposes today and deliberately fold in APIs no demo exercises
  (`paletteFadeRange`, `paletteClearEffects`, `BT.preset.amber`/`green`, `PixelMosaic`, `captureFrame`, `showCursor`,
  `effectClear`, `ticksReset`). Each is a short recipe (when to use + minimal code + key calls + gotchas) that points
  only at the kit's own local docs, never an outside repo. They emit into both `.claude/skills/<name>/SKILL.md` and
  `.cursor/commands/<name>.md` via the existing skill auto-discovery – no generator change. Hard boundaries respected:
  renderer-only (no physics/collision/entity systems taught), post-process gated on `BT.activeBackend === 'webgpu'`,
  display-tier effects need `drawingBufferSize`, sprite flip/rotate constants documented as not-yet-wired. Also fixed a
  doc bug in `content/docs/palette.md`: `Color32.white` and friends are static getters, not calls (the doc showed
  `Color32.white()`). Decisions: no `add-enemy`/physics skill (out of engine scope); no `publish`/deploy skill (the
  scaffolder ships no deploy config); kit content is self-contained – skills and docs reference only `blit386` (the
  engine) and the local kit docs, never the `blit386-demos` repo (which may be archived in favor of kit-based demos), so
  no demo slugs or demo URLs appear in shipped content.
- 2026-06-14: Round 22. AI migration skill (closes the Round 21 follow-up). Added
  `packages/kit/content/skills/migrate/SKILL.md`, which the existing skill auto-discovery in `scaffold.ts` and
  `adapters.ts` emits into generated games as a Claude skill (`.claude/skills/migrate/SKILL.md`) and a Cursor command
  (`.cursor/commands/migrate.md`) – no generator code change needed. The skill tells the assistant to preview with
  `blit migrate`, apply the safe renames with `--write`, then resolve each `review` hit by checking the receiver type
  (`.equals` -> `.isEqual`, `.contains` -> `.isContaining`, `.intersects` -> `.isIntersecting`, `.tick` ->
  `.fireIfElapsed`, and the bootstrap keys `canvasId`/`containerId`/`waitForDOMReady`), leaving non-engine values alone.
  It points at the engine `deprecations.md` as the authoritative table and routes verification to `blit run` /
  `blit doctor` and the `fix` skill. Docs: design doc 4.6 status + Phase 3 line updated. Still open in Phase 3: generate
  `deprecations.md` from this data (cross-repo).
- 2026-06-14: Round 21. Started Phase 3 migrations/codemods (section 4.6), the first post-1.0 feature. Built kit-side
  and self-contained: a typed migration registry (`packages/kit/src/migrations/registry.ts`, seeded by hand from the
  engine's `docs/deprecations.md`) plus a dependency-free, anchored codemod engine (`codemod.ts`). Renames are
  classified `auto` (receiver-anchored `BT.*` calls, distinctive `configure()` keys, distinctive method names like
  `isIndexized`/`containsXY`/`intersectionTo`) or `review` (generic names that could match unrelated code: common method
  words `equals`/`contains`/`intersects`/`tick` and generic bootstrap keys `canvasId`/`containerId`/`waitForDOMReady` –
  located and reported with a suggested rewrite, never auto-changed). New `blit migrate` command
  (`commands/migrate.ts`): previews by default, writes only with `--write`, and runs the no-git nag + confirm before
  touching files. `blit upgrade` now runs the applicable codemods after a real version change and offers to apply them
  (replacing the bare deprecations link). Wiring: registered `migrate` in `cli.ts` + help; factored the shared
  `confirm()` into `prompt.ts`; exported `compareVersions` from `env.ts`; added a second tsup entry so the
  engine/registry are importable by tests. Tests: 13 codemod unit tests (`packages/kit/test/codemod.test.mjs`) + two
  scaffold integration tests (`blit migrate` preview-no-write, and `--write` on a git project that rewrites safe names
  and reports ambiguous ones). Decisions: (1) migration data lives in the kit, not the engine, so this ships without an
  engine release – the long-term "flip `deprecations.md` to be generated from this data" is cross-repo and deferred
  (mirrored by hand for now); (2) no `ts-morph`/`jscodeshift` dependency – anchored strings cover the current one-to-one
  table; (3) the AI migration skill for non-mechanical changes is not built yet (`review` hits are surfaced for a
  human/assistant). Docs updated: kit `README.md`, kit `content/AGENTS.md`, repo `CLAUDE.md` (info table). Preflight not
  yet run this round (shell environment was unavailable); nothing committed.
- 2026-06-14: Round 20. Cut and shipped `1.0.0` (the first stable release). Bumped `@blit386/kit` and `create-blit386`
  to `1.0.0` (major) and did a packaging-metadata pass on both: added `repository` (with monorepo `directory`), `bugs`,
  `homepage`; switched `author` to object form with a profile URL; broadened npm keywords; aligned the JS template
  `vite` floor with the TS template (`^8.0.16`). Also refreshed GitHub repo topics for all three repos
  (`create-blit386`, `blit386`, `blit386-demos`) and pointed `blit386-demos`'s `homepage`/website at the live demos
  site. Process: `main` is protected, so the release landed via PR #19 (squash, `0eac7aa`); the annotated tag `1.0.0`
  (no `v` prefix) was created on the merged commit, not the pre-merge branch (squash rewrites the SHA). Verified:
  preflight green (22 tests), both publish dry-runs, packed tarball pins `@blit386/kit: 1.0.0`. After the owner
  published (kit first, then scaffolder), confirmed `npm view` shows both at `1.0.0` (`latest`) and an end-to-end
  `npm create blit386@latest` smoke test passed (`blit doctor` green, engine `1.1.1` compatible with kit `^1.1.1`).
  Release notes live in the GitHub Release (<https://github.com/blit386/create-blit386/releases/tag/1.0.0>). Saved a
  workspace memory that `main` is always protected. The earlier "1.0.0 deferred / reverted bump / `v1.0.0` tag" notes
  are now superseded.
- 2026-06-14: Round 19. Resolved the kit-owned clean-merge drift wrinkle (flagged since Round 17). Decision: a clean
  three-way-merged kit file is reconciled state, not drift – it should read as in-sync, exactly like a shared file with
  a preserved note. Reporting it as drift was a false positive that made `doctor` nag forever and re-running `sync`
  change nothing (the "nobody trusts sync" failure the ownership model fights). Root cause: `entry.sha256` was
  overloaded. After a kit-owned clean merge it was set to the _pristine kit_ hash (so the full-sync fast path
  `diskHash === entry.sha256` would not mistake a merged file for an untouched one and clobber it), but `checkSyncDrift`
  reads the same field as the on-disk reference, so it saw the merged file (pristine ≠ merged) and flagged drift. Shared
  files avoided this because Round 17 routes them through the managed-region merge before any fast path, letting
  `entry.sha256` hold the reconciled (merged) hash. Fix (`packages/kit/src/commands/agents.ts`, `runFullSync`): give the
  fast path its own correct reference – the pristine ancestor already saved in `.blit/base/<path>`. The kit-owned
  "unmodified" check now compares `diskHash` against the base-copy hash
  (`existsSync(basePath) ? sha256(basePath) : entry.sha256` for older projects without a base copy), and the clean-merge
  branch now records `entry.sha256 = sha256Text(merged)` (reconciled on-disk content) instead of the pristine hash. The
  base copy stays the pristine merge ancestor, so the next sync still detects the user's edits and re-merges them – user
  edits remain protected. Updated the `ManifestEntry.sha256` doc and section 4.10 manifest description. New test
  (`blit agents sync does not flag a clean-merged kit file as drift`, git-guarded): a user edit to a kit rule merges
  cleanly, `--check` reports in-sync (the fix), and the edit survives a second sync. 22/22 pass, full preflight green.
  Nothing committed.
- 2026-06-14: Round 18. Implemented `blit agents add <claude|cursor>` (section 4.5), the post-scaffold command to set up
  one AI assistant in a project that started without one – replacing the friendly "coming soon" stub. New `runAddAgent`
  in `packages/kit/src/commands/agents.ts` reuses the existing ownership-model building blocks: it reads
  `.blit/manifest.json` (via a new shared `readManifest` helper), regenerates the chosen assistant's adapter output in
  memory from the installed kit (`generateClaudeAdapter` / `generateCursorAdapter` in `adapters.ts`, using the
  manifest's recorded `vars` or `fallbackVars`), writes the new files, copies pristine `.blit/base/` ancestors, and adds
  the entries to the manifest so `sync --check` stays clean. Safety: an assistant that is already set up is a friendly
  no-op pointing at `sync`; an unknown name exits non-zero listing the supported assistants (`claude`, `cursor`).
  Collision handling is all-or-nothing (review fix, same round): the first draft wrote the non-colliding files and added
  them to the manifest while saving only the colliding file as `<file>.new`. That left the assistant half-present, so a
  later `sync` would regenerate the colliding path (now that `hasClaude`/`hasCursor` was true), find no manifest entry,
  and overwrite the very user file `add` had protected. Fixed by detecting all collisions up front: if any exist, write
  only the `<file>.new` copies, touch neither the project nor the manifest, and exit non-zero (the user resolves the
  originals, then re-runs `add`). Wired into `runAgents` (`add <name>` dispatch + updated usage block) and the module
  JSDoc. Five end-to-end tests (add claude, add cursor + clean follow-up sync, already-present no-op, unknown-name
  rejection, and the collision test – strengthened to assert no half-add and that a later `sync` leaves the user file
  intact); 21/21 pass, full preflight green. Docs updated: kit `README.md` (real `agents add` description + usage
  example), `packages/create-blit386/README.md` and repo `README.md` (CLI lists + "add later" pointer), repo `CLAUDE.md`
  (new where-to-find row), and the kit's canonical `content/AGENTS.md` (managed region now points projects that started
  without an assistant at `agents add`). Also corrected the stale status-header note: the `9c37894` docs-sync-path
  commit is already in `main` (PR #16 merge), so there is no pending `agent-docs` branch. Release still deferred;
  nothing committed.
- 2026-06-14: Round 17. Review-driven hardening of `blit agents sync`, everything landed on `main`, and `1.0.0`
  deferred. (1) Sync bug fixes (3 review rounds, all merged): (a) the kit-owned clean three-way-merge path recorded the
  _merged_ result as the baseline/hash, so the next sync misread an untouched merged file as "unmodified" and overwrote
  the user's edits – now records the kit-generated `incoming` as the base + `entry.sha256`; (b) orphaned manifest
  entries (files the new kit no longer ships) were tallied but never removed from `entryByPath`, so stale entries got
  rewritten – now `entryByPath.delete(path)` for each orphan; (c) `regenerate` fell back to `fallbackVars(root)` but
  never persisted it, re-detecting the package manager every sync – now writes the resolved vars back onto
  `manifest.vars` the first time. (2) Shared-file note loss (the subtle one): shared files (`AGENTS.md`, `CLAUDE.md`)
  recorded `entry.sha256 = sha256Text(merged)`; on a _second_ sync the untouched file matched that hash, hit the
  "unmodified" fast path, and was overwritten wholesale, dropping the user's notes outside the managed region. Fix:
  handle shared files before the kit-owned fast path so they always route through `replaceManagedRegion` (preserving
  surrounding content), while keeping `entry.sha256 = sha256Text(merged)` so `sync --check` still treats a preserved
  note as in-sync. Note `entry.sha256` has two consumers – `checkSyncDrift` (wants reconciled on-disk hash) and the
  full-sync fast path (wants the pristine kit baseline) – which is why the fix is "route by class first," not "change
  the hash." Added a two-sync regression test; the single-sync test could not catch it. 16/16 tests pass. (3) Docs path
  consistency: `.cursor/rules/docs-sync-required.mdc` + `.claude` mirror now use fully qualified
  `packages/kit/content/...` paths (committed on `agent-docs` as `9c37894`, not yet merged – open a PR or fast-forward
  `main` next session). (4) Merges: the write path + fixes + docs sweep are on `main` (PR #15, then PR #16 for docs;
  `main` HEAD `b7435fa`). (5) Release deferred: reverted the uncommitted `1.0.0` bump back to `0.1.0`/`0.1.1`; no tag
  cut. The owner is adding a couple more features before `1.0.0`. Nothing about the release is committed or tagged.
- 2026-07-13: Round 24. Three engine-surface skills added to `content/skills/`, closing gaps opened by the 1.3.0 engine
  release rather than by a new product decision. (1) `smooth-the-motion` – `BT.renderAlpha` appeared exactly once in the
  entire kit (a bare name in a getter list in `rules/blit-api-names.md`) and was explained nowhere, so no scaffolded
  game interpolated and all three `_3RD_` games judder against the fixed tick on a high-refresh display; the skill
  teaches the snapshot-before-move + `Vector2i.lerp` recipe, and `docs/basics.md` gains the matching section. (2)
  `design-a-sound` – `play-a-sound` stopped at the six `BT.synthPreset` factories, leaving the whole `SynthParams` knob
  surface undocumented; `_3RD_/killer-math` hand-rolled a raw Web Audio `beep()` rather than finding
  `BT.synthPreset.blip()`, which is a discoverability failure the kit caused. (3) `keep-it-fast` – the kit had no
  performance guidance at all; notably, blowing the per-frame budget (about 8,300 sprites, and separately about 8,300
  shapes, everything being drawn as quads) _silently drops_ the extra draws with only a console warning, which reads to
  a beginner as "sprites randomly vanish." Also fixed `add-crt-effect` to warn against gating on `BT.requestedBackend`,
  which stays `'webgpu'` after a software fallback and so passes on exactly the machines the guard exists to protect.
  The renderer-only boundary from Round 23 was reaffirmed, not relaxed: collision, game states, juice, and save/load
  were considered and deliberately left out, since the engine has no game systems to document. Hygiene: `cbt-kit-audit`
  hardcoded a 12-skill list that had already gone stale (missing four skills and `audio.md`), so its doc and skill steps
  now glob the directories instead of naming files; `packages/kit/README.md` gains the first human-facing table of the
  shipped skills, and `cbt-kit-audit` is responsible for keeping it complete.
- 2026-07-23: Round 25 (BT-350). Shared agent adapters: deleted the duplicated Claude/Cursor generators from
  `packages/create-blit386/src/scaffold.ts`. `packages/kit/src/adapters.ts` is now the single source of truth, exported
  as `@blit386/kit/adapters` (tsup entry + package `exports`). Scaffold imports `generateClaudeAdapter` /
  `generateCursorAdapter` and writes the `{ path, content }` pairs to disk; `blit agents sync` / `add` keep using the
  same module in memory. Added a scaffold-vs-memory parity test; ownership model / manifest / `.blit/base/` unchanged.
- 2026-07-24: Round 26 (BT-254). Claude adapter hook parity with Cursor: `hooks.manifest.json` gains `claude:` blocks;
  `generateClaudeAdapter` emits `.claude/settings.json` (PreToolUse / PostToolUse) and copies `content/hooks/` into
  `.claude/hooks/`. `shell-safety.sh` speaks both Cursor permission JSON and Claude exit-2 / permissionDecision
  protocols. Ownership classifiers treat `.claude/hooks/` as kit-owned; scaffold twin tests cover settings.json.
