# BLIT386 monorepo – agent entry point

This repository uses [`CLAUDE.md`](CLAUDE.md) as the canonical policy document for agents. Read it first – it covers the
package layout, shared conventions, and where each package's own detail lives.

## Packages

| Package | npm name | Purpose |
| --- | --- | --- |
| `packages/blit386` | `blit386` | The engine – palette-first WebGPU retro rendering for TypeScript |
| `packages/demos` | `blit386-demos` | Interactive demos and examples |
| `packages/website` | `blit386-website` | Docs site publishing `packages/blit386/docs/` to blit386.dev |
| `packages/kit` | `@blit386/kit` | Canonical kit content (the IR) and the `blit` CLI |
| `packages/create-blit386` | `create-blit386` | `npm create blit386@latest` scaffolder CLI and templates |

Each package has its own `AGENTS.md` and `CLAUDE.md` with package-specific detail; read the nearest one to the code you
are touching together with this file.

## Rules that matter most

- No emoji anywhere – code, docs, commits, PR titles, errors, logs.
- Use the en dash (–) for parenthetical breaks and ranges; never the em dash or a double hyphen as a dash substitute.
- American English spelling, with documented spec-mandated exceptions (see `CLAUDE.md`).
- Named constants over repeated literals – a literal compared at two or more comparison sites, or crossing a file or
  package boundary, gets one shared constant or, in TypeScript, one literal-union type (see
  `.claude/rules/named-constants.md`).
- Package manager is pnpm, not npm or yarn; use `pnpm run <script>` so shell-rewrite hooks apply.
- All commits require DCO sign-off (`git commit -s`); Conventional Commits format (`<type>(<scope>): <description>`).
- `main` is protected – land changes through a PR; release tags carry no `v` prefix.
- Documentation is part of every feature – never a follow-up step.

## Where to go next

[`CLAUDE.md`](CLAUDE.md) has the full shared-conventions list and the "Where the detail lives" pointer table. Condensed,
always-applicable agent rules also live in `.claude/rules/*.md`; reusable command workflows in
`.claude/skills/*/SKILL.md`; project MCP servers in the tracked root `.mcp.json`.
