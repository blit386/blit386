## Summary

<!-- What does this PR change, and why? -->

## Checklist

1. Every commit is DCO signed off (`git commit -s` adds `Signed-off-by: ...`).
2. PR title follows Conventional Commits: `<type>(<scope>): <description>`
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
   - Scope is optional; subject is lowercase with no trailing period
3. `pnpm run preflight` passes locally.
4. Documentation / kit content updated when this change touches scaffolder behavior, kit docs, or agent guidance:
   - Kit docs and skills: `packages/kit/content/`
   - Generated game guidance: `AGENTS.md` (via kit content)
   - Maintainer workflow: `CLAUDE.md` when architecture or commands change
   - Scaffold templates: `packages/create-blit386/templates/` when generated games change
5. If AI tools helped write this change, each commit includes an AI trailer after `Signed-off-by` (as documented in
   CONTRIBUTING.md):
   - `Co-Authored-By: Claude <noreply@anthropic.com>`
   - or `Co-Authored-By: GitHub Copilot <noreply@github.com>`

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contributor process.
