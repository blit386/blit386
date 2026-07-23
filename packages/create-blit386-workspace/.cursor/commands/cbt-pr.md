# Create Pull Request

Open a PR with quality checks and conventional commits.

## Usage

```text
/cbt-pr
```

## Steps

1. Run `pnpm run preflight` – all checks must pass
2. Stage and commit with conventional commit message and DCO sign-off:
   ```bash
   git commit -s -m "type(scope): description"
   ```
3. Push branch and open PR with `gh pr create`
4. Include summary of changes and test plan in PR body

## Commit types

`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

## Notes

- DCO sign-off (`-s`) is required – CI checks for `Signed-off-by:` line
- See `CONTRIBUTING.md` for full guidelines
