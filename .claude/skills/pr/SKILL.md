---
name: pr
description:
  Create a pull request with automatic quality checks, a conventional commit, and the gh CLI. Use when the user wants to
  open a PR or push a branch for review. Takes a package argument (blit386, demos, website, kit, create-blit386, or root
  for repo-wide files) to pick the right preflight gate and commit scope conventions.
---

# Create Pull Request

Create a pull request with automatic quality checks and a proper commit message.

## Usage

```text
/pr <package> Add sprite batching optimization
```

The description after the package argument becomes the commit subject.

## Steps

1. Verify branch

- Confirm the current branch is not `main` or `master`
- Run `git status` to see all changes (add `git ls-files --others --exclude-standard` too, to catch untracked files a
  diff alone misses)

2. Run quality checks

- Execute `/preflight <package>` (or the underlying `pnpm run preflight` / package-specific checks – see that skill)
- If any check fails, stop and report errors; don't proceed with failing checks

3. Review changes

- Run `git diff` to review all modifications
- Run `git log origin/main..HEAD` to see commits
- Verify changes align with the description

4. Create commit

- Stage relevant files with `git add`
- Generate a conventional commit message:
  - Format: `<type>(<scope>): <description>`
  - Types (commitlint-enforced): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
    `revert`. Subject lowercase, no trailing period, header at most 100 characters
  - Scopes are convention only, not enforced by commitlint – prefer one already used by that package's history (see the
    per-package list below)
- DCO sign-off: `git commit -s` – required for every package. `.github/workflows/dco.yml` is a single repo-wide workflow
  (no path filter) that checks every commit in a PR/push regardless of which package it touches
- Include trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`

5. Push and create PR

- Push to remote: `git push -u origin HEAD`
- Create PR using `gh pr create` with:
  - Title matching the commit message
  - Body with summary and test plan
  - Link to related issues if any

6. Return PR URL

- Display the GitHub PR URL for review

## Watching CI after a label was added

If the PR was labeled after it was opened (e.g. `--label` at creation, or a label added moments later),
`gh pr checks <pr>` can lie. Every job in `.github/workflows/ci.yml` is gated on
`needs.changes.outputs.label-event != 'true'`, so labeling starts a second `pull_request` run in which every job skips –
correct behavior, since re-running full CI on every label would be worse. But `gh pr checks` aggregates across all runs
for the head SHA, and the label run's skipped entries shadow the real run's results, so a fully checked PR can read as
unchecked.

The tell: a run whose jobs are _all_ `skipping` is a label run, not a CI failure. Distinguish the two runs by creation
time – the earlier-created run is the real one. Query runs directly rather than trusting the aggregated view:

```bash
SHA=$(gh pr view <pr> --json headRefOid -q .headRefOid)
RUN_ID=$(gh api "repos/{owner}/{repo}/actions/runs?head_sha=$SHA&event=pull_request" \
  --jq '[.workflow_runs[] | select(.name=="CI")] | sort_by(.created_at) | .[0].id')
gh api "repos/{owner}/{repo}/actions/runs/$RUN_ID/jobs" --jq '.jobs[] | {name, conclusion}'
```

This reads the earliest `CI` workflow run for the head SHA and its jobs directly, bypassing whatever a later label run
shadowed. Verified against blit386/blit386#562, labeled `cr` 14 seconds after opening: `gh pr checks 562` reported
`Code Quality (root)` as `skipping`, while the earliest run's jobs reported it `success`.

## Requirements

- `gh` CLI must be installed and authenticated
- The current branch must not be `main` or `master`
- All quality checks must pass

## Per-package commit scopes

- `blit386`: `docs`, `audio`, `assets`, `overlay`, `core`, `api`, `ci`, `renderer`, `tests`, `utils`, `rules`,
  `release`, `security`, `input`, `deps` / `deps-dev`, `visual`, `camera` (rare/legacy: `examples`)
- `demos`: `demos` (most common – demo JS source), `ui` (shared UI kit), `assets`, `docs`, `skills`, `deps`
- `website`: `content`, `ci`, `docs`, `deps`, `config`
- `kit` / `create-blit386`: no fixed convention beyond the general type enum – pick a scope that matches the changed
  area (`kit`, `scaffold`, `templates`, `cli`, `migrations`, `docs`, `deps`)
- `root` (files outside every package: root `CLAUDE.md`, `.claude/`, `.husky/`, `.github/`, root configs): `repo` is the
  established scope (see recent history, e.g. `refactor(repo): ...`)
