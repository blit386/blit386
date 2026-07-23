# Contributing to create-blit386

Thank you for helping improve the BLIT386 scaffolder and kit.

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

The pull request form is pre-filled from [`.github/pull_request_template.md`](.github/pull_request_template.md). Use
that checklist for DCO sign-off, Conventional Commit titles, `pnpm run preflight`, and docs/kit sync when relevant.

## Packages

| Package          | Path                      | Purpose                                     |
| ---------------- | ------------------------- | ------------------------------------------- |
| `create-blit386` | `packages/create-blit386` | npm `create-*` CLI and templates            |
| `@blit386/kit`   | `packages/kit`            | Canonical `AGENTS.md`, docs, and `blit` CLI |

## Releasing

Maintainers: npm publish is manual-only. Follow [`PUBLISHING.md`](PUBLISHING.md).

## Questions?

For questions about the DCO or contributing process, use the [Discord](https://discord.gg/tC2wGt88Uj) community. Blank
issues are disabled.

To report a bug, propose a feature, or flag a docs problem, use the guided forms under
[`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/):

- [Bug report](.github/ISSUE_TEMPLATE/bug_report.yml) – reproduction, expected vs actual, package, environment
- [Feature request](.github/ISSUE_TEMPLATE/feature_request.yml) – problem, proposed change, package scope
- [Docs issue](.github/ISSUE_TEMPLATE/docs_issue.yml) – affected page and what is wrong or missing

See `.github/ISSUE_TEMPLATE/config.yml` for docs, engine-issue, and private vulnerability reporting links.
