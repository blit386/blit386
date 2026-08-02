# BLIT386 monorepo

A pnpm workspace holding the BLIT386 engine, its demos, its published docs site, and the game scaffolder + kit. One
`.claude/` (hooks, skills, rules) and one root `CLAUDE.md` govern every package; each package's own `CLAUDE.md` (read
together with this one, nearest-file-wins for anything package-specific) carries what is genuinely local to it. Open
Claude Code at this repo root, not a parent directory – that is what activates hooks, skills, and rules at all.

## Packages

| Package | npm name | Purpose |
| --- | --- | --- |
| `packages/blit386` | `blit386` | The engine – palette-first WebGPU retro rendering for TypeScript |
| `packages/demos` | `blit386-demos` | Interactive demos and examples, deployed to demos.blit386.dev |
| `packages/website` | `blit386-website` | Docs site publishing this repo's `packages/blit386/docs/` to blit386.dev |
| `packages/kit` | `@blit386/kit` | Canonical kit content (the IR) and the `blit` CLI for generated games |
| `packages/create-blit386` | `create-blit386` | `npm create blit386@latest` scaffolder CLI and templates |

`packages/blit386`, `packages/kit`, and `packages/create-blit386` release in lockstep: one shared `x.y.z` version across
all three, bumped together by `scripts/bump-lockstep.mjs` – see `/release` or `packages/create-blit386/PUBLISHING.md`.
**The engine anchors semver**: a breaking change confined to the scaffolder CLI or to kit content is a `minor`, not a
`major` – only a breaking change in the engine's own public API justifies a major bump.

## Shared conventions

These apply to every package; a package's own `CLAUDE.md` adds to them, never contradicts them.

- No emoji anywhere – code, docs, commits, PR titles, errors, logs.
- Use the en dash (–) for parenthetical breaks and ranges (`word – word`, `10–20`, `2020–2026`). Never the em dash (—)
  and never a double hyphen (`--`) as a dash substitute. Hyphens stay hyphens: compound words (`well-known`), CLI flags
  (`--verbose`), and ISO dates (`2026-06-14`) are not dashes.
- American English spelling in prose, JSDoc, and this project's own identifiers. Exempt: third-party or spec-mandated
  names correctly spelled with a British `s`/`c` in their own spec (Web Audio's `AnalyserNode`, the CSS-mirroring
  `gray`/`grey` alias in `packages/blit386/src/utils/Color32.ts`) – do not "fix" those.
- Conventional Commits: `<type>(<scope>): <description>`. The type enum is commitlint-enforced; scope is convention only
  – see each package's own `CLAUDE.md` for the scopes its history actually uses.
- DCO sign-off on every commit: `git commit -s`. AI-assisted commits carry
  `Co-Authored-By: Claude <noreply@anthropic.com>`.
- `main` is protected – never push to it. Land through a PR (`gh pr create`, wait for checks, `gh pr merge`); PRs
  squash-merge, so the merged commit gets a new SHA.
- Release tags carry no `v` prefix (`1.2.0`, not `v1.2.0`), created after the PR merges, pointing at the resulting
  `main` commit. Tag pushes are allowed; branch pushes to `main` are not.
- pnpm only, and `pnpm run <script>` (not bare `pnpm <script>`) so the RTK shell hook rewrites it. Package manager
  version is pinned in the root `package.json` (`packageManager`).
- Markdown tables are deliberately compact – one space of padding, never aligned to the widest cell – so editing one
  cell gives a one-line diff. This is not Prettier's default: it comes from
  `scripts/prettier-plugin-compact-tables.mjs`, wired into the root Prettier config and shared by every package. Never
  hand-align a table back, and do not add `.markdownlint.json`.
- `.blit/` (the scaffolder's ownership manifest plus pristine kit copies, written into generated games) must stay out of
  every formatter. It is already excluded in `.prettierignore`; a generated project's own `.blit/` mirrors that
  exclusion.
- A `packages/blit386/docs/` change reaches blit386.dev only after `pnpm run sync:docs` runs in `packages/website`
  (`packages/website/scripts/sync-docs-from-engine.mjs`, default source `../blit386/docs`); `sync:docs:check` fails when
  `packages/website/content/docs` is stale.

## Where the detail lives

- API version history: `packages/blit386/docs/documentation-and-versioning-guide.md` (how-to),
  `packages/blit386/docs/changelog.md` (editorial), `packages/blit386/docs/_api-history.json` (per-symbol, regenerate
  with `pnpm run api:history` inside `packages/blit386`)
- Security runs, MCP preflight, governance checks, outage fallbacks:
  [`packages/blit386/docs/security/security-runbook.md`](packages/blit386/docs/security/security-runbook.md). Use
  `/security-run <package>`
- RTK policy: `~/.claude/RTK.md`
- Session notes written by the `/remember` skill live in `.remember/` and are not a repo artifact

## Working with Claude

- Planning vs implementation sessions: during planning work (reviewing issues, discussing architecture) do not modify
  source files – only update Linear. Wait for a separate implementation session before touching code.
- Documentation is part of every feature – never wait to be asked. Shared policy: `.claude/rules/docs-sync-required.md`.
  Package-specific mechanics (versioning tags, doc-site sync, kit-content drift) live in that package's own rules.
- Never treat a package's `README.md` update as optional when its quick start, prerequisites, features list, or
  compatibility claims changed.
