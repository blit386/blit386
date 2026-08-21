# create-blit386 – Design and Roadmap

> Status (2026-07-24): latest **published** npm release is `1.3.0` (`@blit386/kit@1.3.0` + `create-blit386@1.3.0`;
> dist-tag `latest`). `blit386.engineRange` and `BLIT386_RANGE` are `^1.4.0`. Hot-reload content ships in this cut
> (section 12; kit docs/skills `hot-reload.md` / `use-hot-reload`, Catcher `onHotReload` example, starter `blit386()`
> Vite plugin). Publishing is manual-only (see the 2026-07-14 policy change below) – there is no CI publish workflow. 24
> skill directories under `packages/kit/content/skills/`. Claude/Cursor agent adapters are a single shared module
> (`packages/kit/src/adapters.ts`, `@blit386/kit/adapters`) used by both scaffold and `blit agents sync` / `add`
> (BT-350). Full preflight green. (No `main` HEAD SHA is pinned here on purpose: it goes stale within days. Run
> `git log --oneline -1` for the current one.)
>
> History: first published 2026-06-09 as `@blit-tech/kit@0.1.0` + `create-blit-tech@0.1.0` (section 11); renamed to
> `@blit386/kit` + `create-blit386` at `1.2.0` (2026-06-19); 1.0.0 shipped 2026-06-14 (see below). All Phase 1.x code
> items merged to `main` (PRs #7–#10). All Phase 2 "Agents on tap" work is merged to `main` – the full
> `blit agents sync` write path (PR #15) plus the review-driven bug fixes (sync baseline / manifest pruning / vars
> persistence; shared-file note preservation across repeated syncs; test exit-code assertions) and the docs sweep. The
> fully-qualified docs-sync-path commit (`9c37894`) is already in `main` – it merged as the second parent of the PR #16
> merge commit, so there is no pending `agent-docs` follow-up (the earlier "not yet merged" note was stale).
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
> Engine update (2026-07-23): `blit386@1.4.0` is live on npm (`latest`), carrying hot reload / `blit386/vite` / asset
> hot-replace / `BT.loadingAssetsCount`. That satisfies the release-order gate for the kit's hot-reload content
> (section 12) the same way `blit386@1.3.0` did for audio in section 0.
>
> Release status: 1.3.0 SHIPPED (2026-07-24). Both packages published to npm at `1.3.0` (dist-tag `latest`):
> `@blit386/kit@1.3.0` + `create-blit386@1.3.0`. Headline change: hot-reload kit content and the starter Vite plugin for
> engine `blit386@1.4.0` (section 12; `content/docs/hot-reload.md`, `use-hot-reload` / loading-screen skills, Catcher
> `onHotReload` example, `blit386()` in `templates/base/vite.config.js`), and `engineRange` / `BLIT386_RANGE` move to
> `^1.4.0` (was `^1.3.0`). Existing games opt in via `npx blit upgrade` / `npx blit migrate` (migration
> `2026-07-23-hot-reload-vite-plugin`). Also in this cut: shared `@blit386/kit/adapters` for scaffold + agents sync,
> Claude `settings.json` hooks for guardrail parity with Cursor, and lockstep bump script hardening
> (`pnpm run bump -- <x.y.z>`). Manual `pnpm publish` (kit first) per the 2026-07-14 policy. Landed via
> `chore(release): 1.3.0` PR; tag `1.3.0` (no `v` prefix) on the merged `main` commit. Release notes: the GitHub Release
> at <https://github.com/blit386/create-blit386/releases> (tag `1.3.0` after publish).
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
> historically under closed [#50](https://github.com/blit386/create-blit386/issues/50). Those pins later moved to
> `^1.4.0` and shipped in the `1.3.0` release (hot reload) – see the top status block.

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

| # | Decision | Choice | Notes |
| --- | --- | --- | --- |
| D1 | Versioning model | Independent kit version | Engine on npm semver. The "kit" (AI files, docs, skills, hooks, templates) has its own version, pulled and regenerated by a project-local command. Engine and AI guidance evolve at different speeds. |
| D2 | Cloud strategy | Local-first now, cloud after verify | Ship `npm create blit386` for desktop first. StackBlitz is wanted and low-risk (see finding F3). Hosted playground is deferred to Ambilab (section 6). |
| D3 | Agent support | AGENTS.md generic is canonical; generate per-agent files from it | Support all viable agents. Claude Code and Cursor files are generated from the canonical source. Generation is capability-aware, not lowest-common-denominator (Cursor hooks and contextual rules are more powerful than Claude's; use each agent's full power). |
| D4 | Default UX | Short wizard | No silent default. 2–3 questions (JS or TS, which agent or none). Kid-friendly copy for the unsure. Pros pass flags to skip. |
| D5 | Starter game | Catcher | A real tiny game (~80 lines): move a paddle, catch falling items for points, miss and lose a life. Teaches input, score, lose condition, palette. Must not depend on post-process effects (works on software fallback per F3). |
| D6 | Kit packaging + name | `@blit386/kit` | Its own independently-versioned package (D1). Name resolved: create a free `blit386` npm org (sole owner) for the `@blit386/*` scope; no collision with the unscoped `blit386` engine (F5). Not Ambilab. |
| D7 | MVP build approach | Thinnest no-agent path, on the adapter pipeline | Filipek uses no agent, so v0.1 must nail the no-agent scaffold (JS + Catcher + `blit run` / `blit upgrade` + local docs). The generator's only v0.1 target is its cheapest one: emit `AGENTS.md` (useful as a plain doc) + `docs/`. Real Claude/Cursor adapters are phase 2. Built on the pipeline so adapters slot in without re-architecture. |
| D8 | Language support | JS in v0.1, TS in phase 2 | Template = shared base + thin language layer, so TS is an added layer later, not a fork. JS path still gets editor type-checking via JSDoc `@typedef` against the published `.d.ts`. |
| D9 | Repo layout | Hybrid: new repo for scaffolder + kit | `create-blit386` and `@blit386/kit` live in one new repo. Leave `blit386` and `blit386-demos` as their own repos, histories, and CI. Least disruption to what already publishes. |
| D10 | End-user package manager | Auto-detect; npm default | Scaffolder detects the manager that invoked it (`npm_config_user_agent`, like create-vite) and uses it for install + lockfile + documented run commands. Docs default to npm (ships with Node; zero extra install for kids). pnpm-only remains Václav's own-repo rule, not forced on end users. |
| D11 | Pre-Node onboarding (chicken-and-egg) | Install instructions live OUTSIDE the project | A scaffolded README cannot teach installing Node, because running the scaffolder already requires Node. The Node install steps live on pages a brand-new user sees first: the `create-blit386` GitHub README (done 2026-06-12, including a copy-pasteable "send this to a friend" message) and later a docs site. Once StackBlitz is verified (section 7), the browser path becomes the lead option for users without Node: all onboarding docs must be written with two paths in mind – "in your browser (nothing to install)" first, "on your computer" second. |
| D12 | `blit` CLI invocation | Document `npx blit ...` everywhere; lead with `npm run dev` | `blit` is a bin inside `@blit386/kit`, a project dependency. Local bins are only on PATH inside package scripts, so plain `blit run` typed in a terminal fails with "command not found." All shipped docs (template README, AGENTS.md, kit docs, CLAUDE.md template) say `npx blit ...` and explain why in one beginner-friendly line. The scaffolded README leads with `npm run dev`; `blit` is presented as the helper, not the primary interface. Docs updated 2026-06-12; verify `npx blit` under npm/pnpm/yarn/bun (section 7). |
| D13 | User edits vs `blit agents sync` | Ownership model: manifest + three file classes; never clobber | Without a plan, sync destroys user edits and people stop running it. Full spec in section 4.10. Summary: `.blit/manifest.json` records what the kit generated (with hashes and pristine bases); every emitted file is kit-owned (regenerate freely), shared (managed region between markers; user content preserved), or user-owned (scaffolded once, never touched again). On conflict: three-way merge when git is available, `<file>.new` + a friendly report otherwise. AGENTS.md managed markers + a "Your notes" section ship from v0.1.x so projects scaffolded today survive future syncs (markers added to kit content 2026-06-12). |
| D14 | Kit-engine compatibility | Kit declares a supported engine range; `blit doctor` checks the pair | D1 (independent versioning) is about cadence, not content: the kit's docs describe the engine API, so a stale kit actively misleads an agent after an engine major. The kit's `package.json` gains a `blit386.engineRange` semver range; `blit doctor` and `blit upgrade` compare it against the installed `blit386` and report drift in Tier-1 voice ("Your local guides describe an older BLIT386 than the one installed. Update @blit386/kit, then run npx blit agents sync."). `scripts/bump-lockstep.mjs` (repo root) stamps the range automatically at release time, not via doc generation; `pnpm run bump:check` (BT-317) is the CI/pre-push safety net that fails loudly if it drifts. |

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

| Thing | What | Distribution | Cadence |
| --- | --- | --- | --- |
| Engine | `blit386` npm package (v1.1.1) | npm, semver | when the API changes |
| Kit | AGENTS.md + local docs + skills + hooks + templates | see open question Q-KIT | when AI guidance or tooling improves |
| Scaffolder | `create-blit386` CLI | npm, run once via `npm create` | rarely |

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

Three later skills closed discoverability gaps the kit itself had caused, not new engine surface: `smooth-the-motion` –
`BT.renderAlpha` appeared exactly once in the whole kit (a bare name in a getter list) and was explained nowhere, so
every scaffolded game judders against the fixed tick on a high-refresh display; the skill teaches the
snapshot-before-move + `Vector2i.lerp` recipe. `design-a-sound` – `play-a-sound` stopped at the six `BT.synthPreset`
factories, leaving the whole `SynthParams` knob surface undocumented; a `_3RD_` game hand-rolled a raw Web Audio
`beep()` rather than finding `BT.synthPreset.blip()`, which is exactly the discoverability failure the skill fixes.
`keep-it-fast` – the kit had no performance guidance at all, and blowing the per-frame budget (about 8,300 sprites, or
separately about 8,300 shapes) silently drops the extra draws with only a console warning, which reads to a beginner as
"sprites randomly vanish." The same pass fixed `add-crt-effect` to stop gating on `BT.requestedBackend` (which stays
`'webgpu'` after a software fallback, so it passes on exactly the machines the guard exists to protect) in favor of
`BT.activeBackend`.

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

| Capability | AGENTS.md (generic) | Claude Code | Cursor | Zed |
| --- | --- | --- | --- | --- |
| Persona / hard rules | the file itself | `CLAUDE.md` (symlink or generated copy) + `.claude/rules/*.md` | `.cursor/rules/*.mdc` (globs, `alwaysApply`) | reads `AGENTS.md` |
| On-demand actions (skills) | described in prose | `.claude/skills/<name>/SKILL.md` | `.cursor/commands` or scoped rules | reads `AGENTS.md` |
| Deterministic guardrails (hooks) | prose warning only | `.claude/settings.json` hooks (PreToolUse / PostToolUse) | `.cursor/hooks.json` (afterFileEdit, beforeShellExecution, `failClosed`) – richest | `.zed/settings.json` tool_permissions |
| Lockfile / .env block | prose warning | settings.json PreToolUse | hooks.json `failClosed` | settings.json `always_deny` |
| Live docs lookup (MCP) | prose pointer | `.mcp.json` (`type: http` required) | `.cursor/mcp.json` (`url` only; a `type` marks stdio) | n/a |

This formalizes exactly what the engine repos do by hand today. Reuse the output to clean up the engine repos too.

The "Live docs lookup" row (the `blit386-docs` MCP server at `https://blit386.dev/mcp`, teaching an assistant the
`search_docs` / `get_docs_summary` tools plus the `llms.txt` and `Accept: text/markdown` fallbacks) carries three
decisions worth keeping: (1) no `content/mcp.manifest.json` – one server with no per-adapter divergence beyond a single
key does not earn a manifest plus parser plus schema; revisit when a second server appears. (2) the generated
`.claude/settings.json` deliberately does not pre-approve the server in its MCP enable list – the approval prompt is
Claude Code's own consent boundary for a network server, the scaffolder is not the party entitled to answer it, and a
checked-in settings file's approvals are ignored in an untrusted folder anyway. (3) the two generated configs differ by
one key on purpose: Claude Code skips a remote entry that has a `url` but no `type`, while for Cursor a `type` marks a
local stdio server. Both are kit-owned, so `blit agents sync` refreshes them and three-way merges a user's own added
servers.

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

Robustness rules (required for agent-driven and CI use; both DONE 2026-06-13, see section 9's phase-roadmap checklist):

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

| Class | Examples | Sync behavior | How users customize |
| --- | --- | --- | --- |
| Kit-owned | `docs/*.md` (kit names only), `.cursor/rules/kit-*.mdc`, `.claude/skills/kit-*/`, generated hook entries | Regenerated freely when unmodified; never clobbered when modified (see conflict rule) | Don't edit these; add sibling files with your own names (`.cursor/rules/my-*.mdc`). Kit files carry a one-line header: "Generated by @blit386/kit – your edits will be flagged on sync; put your own rules in a new file." |
| Shared (managed region) | `AGENTS.md`, generated `CLAUDE.md` | Only the content between `<!-- blit-kit:managed:start -->` and `<!-- blit-kit:managed:end -->` is rewritten; everything outside (the seeded "Your notes" section and anything else) is preserved byte-for-byte | Write below the end marker. The file says so in plain language. |
| User-owned | `README.md`, `src/game.js`, `index.html`, `vite.config`, `package.json` | Scaffolded once; sync never touches them (engine bumps go through `blit upgrade`, not sync) | Edit freely. |

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

One declaration, two halves (Round 28). The manifest is written by two packages – `scaffold()` stamps it, and
`blit agents sync` / `add` rewrite it after reconciling – but declared in exactly one place:
`packages/kit/src/manifest.ts`, reached from both sides through `@blit386/kit/adapters`. `BlitManifest` is the written
shape, every field required, so a writer that stops emitting one fails to compile. `ReadBlitManifest` is _derived_ from
it, widening only the fields that postdate the format (`createdAt`, `vars`, and per-entry `kitVersion`) so the reader
still accepts manifests written by any released scaffolder. Deriving rather than re-declaring is the point: a field
added to `BlitManifest` becomes required of every writer and visible to the reader in one edit. The widened shape is
also what sync _writes_, not merely what it reads, and the two widened root fields differ on the way out. `createdAt` is
copied across only when the manifest already had it, so an old manifest never gains a fabricated creation timestamp.
`vars` is copied when present and _backfilled_ when absent – both write paths resolve it from `fallbackVars` and persist
it – so an old manifest does gain `vars` on its first sync, by design: the package manager is then detected once instead
of on every run.

No schema version, deliberately (Round 28). A `schemaVersion` field was specified and rejected on inspection. It is
absent from every manifest already in the wild, so the reader would carry the widened branch indefinitely and gain a
second one beside it – additive, deleting nothing. The v0-to-v1 upgrade that would eventually retire the old branch
cannot be written honestly, since it would have to invent a `createdAt` that no one knows. (`vars` is the easy half:
`fallbackVars` covers the package-manager commands, which is the whole set `content/` substitutes.) Revisit only if a
genuinely _incompatible_ manifest change arrives – a renamed or re-meaning field, not another additive one.

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
- [x] Auto-stamp `blit386.engineRange` during release + kit docs drift detection CI (replaces the original "generate kit
      docs FROM engine `docs/api-*.md`" plan; full prose generation is not feasible). The engine's own `bump-lockstep`
      already derived and wrote `engineRange` at release time (BT-410); `pnpm run bump:check` (BT-317) is the
      CI/pre-push safety net that fails loudly if `engineRange` or `BLIT386_RANGE` drifts from what `bump-lockstep.mjs`
      would derive. This closed the remaining gap: `packages/kit/package.json`'s new `blit386.docsReviewedAt` marker
      (hand-set only) records the engine version `content/docs/*.md` was last reviewed against;
      `scripts/check-kit-docs-drift.mjs` compares it to `packages/blit386/docs/_api-history.json`'s per-symbol
      `since`/`changes` history, and `.github/workflows/kit-docs-drift.yml` runs `scripts/report-kit-docs-drift.mjs`,
      which files or updates a Linear tracking issue (team BT) when they diverge – advisory-only and never blocking a
      merge; `blit doctor` surfaces the same comparison locally as a Tier-1 nudge. →
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

Status (verified 2026-07-24 against the npm registry): `@blit386/kit@1.3.0` and `create-blit386@1.3.0` are published and
live (`dist-tags.latest = 1.3.0` on both). Prior releases: `0.1.0` / `0.1.1`, then `1.0.0` (2026-06-14), then `1.1.0`
(2026-06-14; migrate codemods + game-author skills), then `1.2.0` (2026-06-19; `create-blit-tech`/`@blit-tech/kit`
rename to `create-blit386`/`@blit386/kit`), then `1.2.1` (2026-07-14; audio content + `engineRange` fix), then `1.3.0`
(2026-07-24; hot reload for engine 1.4.0 – see the top status block and section 12). Git tag `1.3.0` (no `v` prefix) on
the merged `main` commit; release notes live in the GitHub Release at
<https://github.com/blit386/create-blit386/releases> (tag `1.3.0` after publish).

Publishing is manual-only (policy change 2026-07-14, see the top status block): there is no
`.github/workflows/publish.yml` and no `NPM_TOKEN` secret. Nothing publishes on a tag push. Tags are still cut and
pushed after a manual publish, purely as a release marker for the repo history.

Procedure (repeat for each release; bump versions first – a version, once published, is permanent):

1. Commit first (`pnpm publish` refuses a dirty tree; otherwise pass `--no-git-checks`).
2. `npm login`, then `npm whoami` must print `vancura` (sole owner of the free `blit386` org).
3. `pnpm install && pnpm -r run build` (the `prepack` script also rebuilds on publish).
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

| Edit | Behavior |
| --- | --- |
| `update()` / `render()` / related method bodies | Prototype swap; instance fields kept |
| `init()` / constructor / class field initializers | Fresh instance + `init()`; optional `onHotReload` can restore a snapshot |
| `configure()` hardware settings | Full page reload via `hot.invalidate()` |

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
scaffolder cut that expects a newer engine floor on npm, not as a silent side effect of a docs PR. The `1.3.0` release
ships both at `^1.4.0`.

---

## Changelog

This doc records durable decisions, not a dated release log – chronological history (what shipped when, which PR, which
commit) lives in `git log` and the GitHub Releases linked from section 11. When a change is genuinely a new durable
decision, fold it into the relevant numbered section above (per-file rule in `.coderabbit.yaml`) instead of appending a
dated entry here.
