# Contributing to create-blit-tech

Thank you for helping improve the Blit-Tech scaffolder and kit.

## Development setup

```bash
pnpm install
pnpm run build
pnpm run preflight
```

Run commands from the repository root. Use `pnpm run <script>` (not bare `pnpm <script>`).

## Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and requires a
[Developer Certificate of Origin (DCO)](https://developercertificate.org/) sign-off on every commit:

```bash
git commit -s -m "feat(scaffold): add optional CI template"
```

Sign-off with `-s` adds a `Signed-off-by:` line to the commit message. CI verifies DCO on pull requests.

### Commit types

`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

## Pull requests

1. Run `pnpm run preflight` before opening a PR.
2. Keep changes focused; update `CLAUDE.md` when workflow or architecture changes.
3. Sign off every commit with `-s`.

## Packages

| Package            | Path                        | Purpose                                     |
| ------------------ | --------------------------- | ------------------------------------------- |
| `create-blit-tech` | `packages/create-blit-tech` | npm `create-*` CLI and templates            |
| `@blit-tech/kit`   | `packages/kit`              | Canonical `AGENTS.md`, docs, and `blit` CLI |
