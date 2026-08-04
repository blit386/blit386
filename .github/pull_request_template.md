## Summary

<!-- What does this PR change, and why? -->

## Checklist

1. Every commit is DCO signed off (`git commit -s` adds `Signed-off-by: ...`).
2. PR title follows Conventional Commits: `<type>(<scope>): <description>`
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
   - Scope is optional; subject is lowercase with no trailing period
3. `pnpm --filter <package> run preflight` passes locally for every touched package that defines it (`kit` and
   `create-blit386` have no combined `preflight` – run their individual checks instead).
4. Documentation updated where this change touches public API or behavior:
   - Public API: relevant `packages/blit386/docs/api-*.md`
   - Behavior: affected `docs/` guides
   - Architecture / new subsystem: that package's canonical architecture map and information-routing documentation
5. If renderer output could change, `pnpm --filter blit386 run test:visual` was run (and baselines updated if the change
   is intentional).
6. If AI tools helped write this change, each commit includes an AI trailer after `Signed-off-by` (as documented in
   CONTRIBUTING.md):
   - `Co-Authored-By: Claude <noreply@anthropic.com>`
   - or `Co-Authored-By: GitHub Copilot <noreply@github.com>`

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contributor process.
