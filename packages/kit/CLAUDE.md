# @blit386/kit

Canonical kit content (the IR) and the `blit` CLI, shipped into every game scaffolded by `create-blit386`. This package,
`create-blit386`, and the `blit386` engine release in lockstep (one shared `x.y.z`, anchored to the engine's semver) –
see [`packages/create-blit386/CLAUDE.md`](../create-blit386/CLAUDE.md) for the scaffolder's own detail.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) – read together with this file.

TypeScript strict, built with tsup, Biome for lint and format (no ESLint here), pnpm, Node >= 22.18.0. Scripts are
`pnpm run <script>` from this package's directory (or `pnpm --filter @blit386/kit run <script>` from the repo root).

The `blit` CLI is a project-local bin inside every generated game: `blit run`, `blit doctor`, `blit upgrade`,
`blit migrate`, `blit agents sync` / `blit agents add`, `blit help`.

## Kit content vs engine docs

Generated games receive `AGENTS.md`, nine beginner docs from `content/docs/` (`getting-started`, `basics`, `drawing`,
`input`, `palette`, `random`, `audio`, `hot-reload`, `when-something-breaks`), and the game-author skills in
`content/skills/`. These are not copies of the engine's full `docs/` tree – they teach the starter game and point to
GitHub for deep API reference.

The whole of `content/` is the shipped IR, not just `AGENTS.md` + `docs/`: it also carries `rules/`, `skills/` (24
game-author capability skills plus the `run`, `fix`, and `migrate` workflow skills), `hooks/shell-safety.sh` +
`hooks.manifest.json`, and `agents.config.json`. Skills and rules are discovered by directory scan in `src/adapters.ts`
– adding a skill folder is enough, nothing registers it by name.

Kit content must be self-contained. Skills and docs may reference only `packages/blit386` (the engine) and other local
kit files. Do not reference the `packages/demos` package, its demo slugs, or its URLs – that package may be archived in
favor of kit-based demos, and shipped content must not break with it.

The engine has no physics, collision, entity, or scene system. Say so; do not invent one. What the kit does teach:
drawing (primitives, sprites, text), palette and effects, input (keyboard, pointer, gamepad), timing and easing, audio
(bus mixer, `AudioClip`, procedural synth – engine 1.3.0), hot reload / `blit386/vite` / asset hot-replace /
`BT.loadingAssetsCount` (engine 1.4.0), `BT.isDevMode` dev/release detection (engine 1.5.0), the debug overlay,
screenshots, and WebGPU-only post-process effects.

### Drift is the standing risk here

Nothing syncs this package from `packages/blit386` automatically. The kit docs and shipped skills are hand-authored
beginner prose, so they go stale silently when the engine changes. Shipping an engine feature is the trigger to come
here – review in the same pass, not later. Run `/kit-audit` to walk the checklist. Also check `BLIT386_RANGE` in
`packages/create-blit386/src/scaffold.ts` when new games should pin a newer engine version.

| Kit file | Review when |
| --- | --- |
| `content/docs/getting-started.md` | Install/run flow, `npx blit run` / `doctor`, first-edit hot reload |
| `content/docs/basics.md` | `configure()`, loop timing getters, bootstrap flow, orientation, `loadingAssetsCount` |
| `content/docs/drawing.md` | `BT.clear`, primitives, text APIs |
| `content/docs/input.md` | `BT.isDown`, edges, keyboard, pointer, gamepad, scroll-capture / touch-action |
| `content/docs/palette.md` | `paletteCreate`, slots, `Color32` |
| `content/docs/random.md` | `BT.random` / `BT.randomSeed`, seeding a run, noise and hash world generation |
| `content/docs/audio.md` | `AudioClip`, `BT.synthPreset`, buses, the unlock rule |
| `content/docs/hot-reload.md` | `blit386/vite`, swap tiers, `onHotReload`, asset hot-replace, `BT.isDevMode` |
| `content/docs/when-something-breaks.md` | Common errors, `await`, palette slot 0, silent audio, hot-reload surprises |
| `content/AGENTS.md` | Overall game shape, hard rules, doc routing, hot-reload tiers |
| `content/rules/blit-api-names.md` | `BT` getters, configure flags, wake lock, `onHotReload` / never `registerHotReload` |
| `content/rules/blit-integer-coords.md` | Integer-coordinate rule (`Vector2i` / `Rect2i`) |
| `content/skills/use-hot-reload/SKILL.md` | Swap tiers, `onHotReload`, vite plugin opt-in for older games |
| `content/skills/use-dev-mode/SKILL.md` | `BT.isDevMode` resolution order, cheat-key / debug-HUD gating examples |
| `content/skills/*/SKILL.md` | Other game-author skills; each demonstrates a slice of the `BT` surface |
| `content/hooks/shell-safety.sh` | Shell commands the hook blocks in a generated game (Cursor + Claude protocols) |
| `content/hooks.manifest.json` | Canonical hook intent; Cursor `hooks.json` and Claude `settings.json` derive from it |
| `content/agents.config.json` | Which files each adapter (claude / cursor) emits |

While auditing, confirm every skill directory appears in the skills table in `README.md` – that is the only human-facing
list of what ships, and it has no automated guard.

## Critical rules

1. Beginner-friendly – kit docs and skills assume no prior coding experience
2. Integer coordinates – generated games use `Vector2i` / `Rect2i` via blit386
3. Use the `BT` namespace in generated game code, never `BTAPI`
4. Named exports only in this package's own TypeScript; no default exports

## Where to find information

| Question | Where to look |
| --- | --- |
| What does the `blit` CLI do? | `src/cli.ts`, `README.md` |
| How are agent files generated? | `src/adapters.ts`; the scaffolder writes them to disk |
| What do `blit agents sync` / `add` do? | `src/commands/agents.ts` (drift `--check` + write path, `runAddAgent`) |
| How do API migrations / codemods work? | `src/migrations/` (registry + codemod engine), `src/commands/migrate.ts` |
| Sync ownership model / manifest | `.blit/manifest.json` (classes + `vars`), `src/commands/agents.ts` |
| Engine API names for generated games | `packages/blit386/CLAUDE.md`, `packages/blit386/docs/api-core.md` |
| What does the scaffolder generate? | `packages/create-blit386/CLAUDE.md` |
| Publishing / release | `packages/create-blit386/PUBLISHING.md`, `/release`, `pnpm run bump -- 1.5.0` from the repo root (replace `1.5.0` with the target version) |
| Maintainer agent-config drift check | `scripts/check-agent-config.mjs` (root) |
| Contributing / DCO | root `CONTRIBUTING.md` |
