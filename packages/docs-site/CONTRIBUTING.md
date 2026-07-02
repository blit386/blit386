# Contributing to blit386.dev

Thank you for contributing to the BLIT386 documentation site.

## Developer Certificate of Origin (DCO)

All commits must include a `Signed-off-by` line:

```bash
git commit -s -m "docs(content): add getting started page"
```

Pull requests are checked for DCO compliance via GitHub Actions.

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>

Signed-off-by: Your Name <your.email@example.com>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Suggested scopes: `content`, `ci`, `config`, `deps`

## Development Workflow

1. Fork and clone the repository
2. `pnpm install`
3. `pnpm run dev` for local preview
4. Edit MDX under `content/` or site config as needed
5. `pnpm run preflight` before pushing
6. Open a pull request against `main`

## Content Guidelines

- Add `title` (and preferably `description`) frontmatter to every MDX page
- Link to [blit386 engine docs on GitHub](https://github.com/blit386/blit386/tree/main/docs) for API reference
- Run `pnpm run docs:links` after adding or changing links
- No emoji in content, commits, or UI strings

## Engine vs Site Docs

Canonical API documentation lives in the [blit386](https://github.com/blit386/blit386) repository. This site should
summarize and link – avoid copying API tables that will drift.
