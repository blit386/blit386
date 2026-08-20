---
name: release
description:
  'Prepare and run a release covering all three lockstep-versioned packages (blit386, @blit386/kit, create-blit386):
  generate a polished RELEASE.md grouped by package from PR history, then walk the rest of the release lifecycle
  (version bump, changelog, docs coverage, pnpm publish in engine-then-kit-then-scaffolder order, API-history
  regeneration). One shared x.y.z version, one tag series, one GitHub Release.'
---

# Release

One release procedure, because BT-410 moved all three publishable packages to a single lockstep version: one tag series,
one GitHub Release, no separate per-package flow to pick between.

## Usage

```text
/release
```

Covers `blit386`, `@blit386/kit`, and `create-blit386` together. A package name passed as an argument is accepted but
ignored – there is only one release now.

The `RELEASE.md` generation itself (steps 1-9 below) does not modify `package.json`, `src/core/BTAPI.ts`,
`packages/kit/src/scaffold.ts`, or any other source file, and does not create branches, commits, or tags. When the user
asks for more than `RELEASE.md` – "do the whole release", "bump the version", "publish it" – see
[After RELEASE.md](#after-releasemd-the-rest-of-the-release) below; that part does touch other files and publish
packages, but only when asked.

All commands below run from the repo root unless a step says otherwise.

### 1. Ask for the new version

Ask the user: "What version are you releasing? (applies to blit386, @blit386/kit, and create-blit386 together, e.g.
1.0.5, 1.1.0, 2.0.0)"

Wait for the answer. Validate it is a valid semver (three dot-separated non-negative integers). If invalid, ask again.
Store the answer as NEW_VERSION (e.g. `1.5.0`).

Remind the user of the semver policy if the choice looks off: **the engine anchors semver**. A breaking change confined
to the scaffolder CLI or to kit content is a `minor`, not a `major` – a major bump means the `blit386` engine's own
public API broke compatibility, nothing else. See `packages/create-blit386/PUBLISHING.md` ("Semver policy") for the full
rule.

### 2. Find the last tag and its UTC timestamp

```bash
LAST_TAG=$(git describe --tags --abbrev=0)
echo $LAST_TAG
```

Get the tag's commit date and convert to UTC:

```bash
TAG_COMMIT=$(git rev-list -n 1 $LAST_TAG)
TAG_RAW=$(git log -1 --format="%aI" $TAG_COMMIT)
TAG_DATE=$(python3 -c "
from datetime import datetime, timezone
raw = '$TAG_RAW'.strip()
dt = datetime.fromisoformat(raw)
print(dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
")
echo "Last tag: $LAST_TAG, UTC date: $TAG_DATE"
```

Store `$TAG_DATE` for use in step 3 and `$LAST_TAG` for the changelog URL at the end. This is correct unfiltered now:
one tag series covers the whole repo, so there is no separate per-package "last tag" to reconcile.

### 3. Get all commits since the last tag

```bash
git log $LAST_TAG..HEAD --format="%H %s"
```

Store the list of commit SHAs and subjects. These are the commits the release notes must cover – every package is in
scope, since it is one repo and one release.

### 4. Fetch PRs merged since the last tag

```bash
# 500 is a safe ceiling for a single-maintainer repo; raise if a release ever spans more PRs
gh pr list --state merged --limit 500 \
  --json number,title,body,mergedAt,files | \
  jq --arg tag_date "$TAG_DATE" \
  '[.[] | select(.mergedAt > $tag_date) | select(.title | test("^(feat|chore|fix): release ") | not)]'
```

This returns a JSON array where each element has `.number`, `.title`, `.body`, `.mergedAt`, and `.files` (changed file
paths – needed for step 7's package grouping).

If the list is empty, tell the user there are no PRs since the last tag and stop.

### 5. Identify direct pushes (commits not associated with any PR)

First detect the current repository:

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
```

For each commit SHA from step 3, query the GitHub API to find its associated PR:

```bash
gh api repos/$REPO/commits/COMMIT_SHA/pulls \
  --jq '.[0].number // empty'
```

Any commit that returns empty (no associated PR) is a direct push to main. Collect these as a list of `{sha, subject}`
pairs. Exclude merge commits (subjects starting with `Merge `).

### 6. Extract useful content from each PR

For each PR in the list from step 4, build a content object:

- title: the PR title as-is (conventional commit format, e.g. `feat(assets): cap sprite dimensions`)
- number: the PR number
- description: extracted from `.body` as follows:
  1. Take everything before the HTML comment
     `<!-- This is an auto-generated comment: release notes by coderabbit.ai -->`. Strip leading/trailing whitespace.
     This is the human-written description.
  2. After that marker, look for CodeRabbit structured content: sections starting with `## Overview`, `## Key Changes`,
     `## Changes Made`, `## Changes Overview`, `## Summary`. If any such heading is found, extract the text of those
     sections (stop before badge lines or `<!-- end of auto-generated` markers). This is the CodeRabbit summary.
  3. Strip all HTML comments (`<!-- ... -->`), markdown image links (`[![...](...)](...)` patterns), and lines that
     contain only a bare URL.
  4. Priority: if the CodeRabbit summary exists and has more than one bullet or paragraph, use it as the primary source.
     If only a human description exists, use that. If both exist, lead with the human description (one sentence) and use
     the CodeRabbit summary for detail.

### 7. Group PRs – first by package, then by topic

**First, assign each PR to exactly one top-level package section**, from its `.files` (step 4):

| Section | A PR belongs here when its changed files are... |
| --- | --- |
| `## Engine (blit386)` | under `packages/blit386/` |
| `## Kit (@blit386/kit)` | under `packages/kit/` |
| `## Scaffolder (create-blit386)` | under `packages/create-blit386/` |
| `## Repo-wide` | only root-level files (`CLAUDE.md`, `.claude/`, `.github/`, root `scripts/*`, root configs) or `packages/demos/` / `packages/website/` |

A PR touching more than one published package's directory goes in each relevant section (cross-cutting changes are real
– do not force a single "primary" pick). Omit `## Repo-wide` entirely if it would be empty; a PR touching only
`packages/demos/` or `packages/website/` (unpublished, internal) belongs there too since neither ships to npm.

**Within `## Engine (blit386)`**, sub-group by topic using this table (this is presentational grouping carried over from
when RELEASE.md was engine-only – it is not exhaustive, the root `CLAUDE.md` scope list is longer). Give each
non-matching scope its own topic-matched `###` heading instead of forcing it into a generic bucket:

| Group heading | Match pattern |
| --- | --- |
| API Changes | `feat(api)`, `fix(api)`, `refactor(api)`, BREAKING CHANGE in body |
| Asset System | `feat(assets)`, `fix(assets)`, `refactor(assets)`, `chore(assets)` |
| Security | `feat(security)`, `fix(security)`, `ci(security)`, `chore(security)` |
| CI and Tooling | `ci(*)`, `chore(ci)`, `chore(deps)`, `chore` (tool upgrades, config changes) |
| Rendering | `feat(renderer)`, `fix(renderer)`, `refactor(renderer)` |
| Core and Utils | `feat(utils)`, `fix(utils)`, `refactor(utils)`, `feat(core)`, `fix(core)` |
| Tests | `test(*)` |
| Documentation | `docs(*)` |
| Examples | `feat(examples)`, `fix(examples)` |

**Within `## Kit (@blit386/kit)`, `## Scaffolder (create-blit386)`, and `## Repo-wide`**, use a single flat bullet list
per section – no topic subheadings. These sections rarely carry enough PR volume per release to need them, and forcing
subheadings onto three PRs is noise, not clarity.

### 8. Write the RELEASE.md narrative

Write `RELEASE.md` at the repo root following this exact structure.

#### Lead paragraph

One to three sentences capturing the theme of this release: what was the main focus, which package(s) changed, what a
user upgrading should know first. Be specific. Name actual things: "`BT` namespace", "the `blit` CLI's `agents sync`
command", "hot-reload template". No marketing fluff. No passive voice.

After drafting the lead paragraph, tighten it: lead with the release's single most important change, cut every hedge and
adverb that does not carry information, and read it aloud once to catch passive voice.

#### Per-section content

For each non-empty section from step 7, write the `##` (or, inside Engine, `###`) heading. Start each section with one
short prose sentence (no more than 20 words) introducing the changes. Then one bullet per PR:

- Write the concrete change, not the commit type. "Bitmap font textures must now use `data:image/png;base64`" not "added
  validation for bitmap fonts".
- Name the actual thing changed: function name, constant name, file type, error class name.
- State user impact: what breaks, what is new, what improves, what is fixed.
- End with the PR number as a bare GitHub auto-link reference: `(#153)`. GitHub renders `#N` as a clickable link to the
  PR – use this format, not a full URL and not a Markdown link.
- Never mention the author.
- For breaking changes, lead the bullet: `Breaking: <description> (#N)`

Do not repeat the commit type prefix (`feat:`, `fix:`) in the bullet text.

#### Direct commits section (if any)

If step 5 found any direct pushes, add a final section:

```markdown
## Direct Commits

Commits pushed directly to main (not via pull request):

- `<short SHA>`: <commit subject>
```

#### Closing line

End with a blank line then:

```
Full Changelog: https://github.com/blit386/blit386/compare/LAST_TAG...NEW_VERSION
```

One compare link, one repo – no separate per-package changelog URLs.

### 9. Report to the user

After writing `RELEASE.md`, report:

- "Wrote `RELEASE.md` covering N PRs across M sections" (and how many direct commits if any)
- "Last tag: LAST_TAG – New version: NEW_VERSION"
- "Review, edit as needed, then delete RELEASE.md after you paste it into GitHub Releases."
- "To bump all three packages' versions, do that manually or I can do it if you ask."

### After RELEASE.md: the rest of the release

`/release` only writes `RELEASE.md` by default. Everything below is manual-on-request, not automatic – walk through it
in this order when the user asks for more, since later steps depend on earlier ones (the API-history step in particular
is order-sensitive and silently produces wrong data if done too early).

### Agent guardrails (never skip)

1. **Engine first** – publish `blit386` before `@blit386/kit`, and confirm it with `npm view blit386 version` before
   publishing the kit if kit `content/` documents new engine API (`packages/create-blit386/PUBLISHING.md`, "Release
   order: engine first").
2. Always `pnpm publish`, never `npm publish` for the kit and scaffolder – only pnpm rewrites `workspace:*` to a real
   version number.
3. Publish `@blit386/kit` before `create-blit386`.
4. Versions are permanent and lockstep – all three packages share one `x.y.z`. Bump with `pnpm run bump -- 1.5.0` from
   the repo root (replace `1.5.0` with the target version; the script lives at `scripts/bump-lockstep.mjs` and writes
   `packages/blit386/package.json`, `packages/blit386/src/core/BTAPI.ts`, `packages/kit/package.json` (including its
   derived `blit386.engineRange`), `packages/create-blit386/package.json`, and
   `packages/create-blit386/src/scaffold.ts`'s derived `BLIT386_RANGE`, all in one pass). Never suggest separate
   per-package `npm version` commands, and never bias toward patch or minor – choose SemVer from the pre-bump checklist
   in `PUBLISHING.md`, anchored to the engine (see guardrail 8).
5. Release tags carry no `v` prefix (`1.5.0`, not `v1.5.0`). One tag per release – there is exactly one series now.
6. Publishing is manual-only – no CI publish workflow, no `NPM_TOKEN`. Do not suggest re-adding either.
7. Every release publishes all three packages, even ones with no changes since the last release. Do not add
   skip-unchanged-package logic – that reintroduces the version drift lockstep exists to remove.
8. **The engine anchors semver.** A breaking change confined to the CLI or kit content is absorbed as a minor; only an
   engine-breaking change justifies a major. See `PUBLISHING.md` "Semver policy".

### How to run the release

1. Bump: `pnpm run bump -- X.Y.Z --dry-run` then `pnpm run bump -- X.Y.Z` from the repo root. Confirm the dry-run output
   lists all three `package.json` files, the engine's version constants, `engineRange`, and `BLIT386_RANGE`.
2. Mark the changelog as released (below) and verify docs coverage (below).
3. Land the bump through a PR: `main` is protected – branch, PR, wait for checks, merge (`gh pr merge --merge`; squash
   merging is disabled on the repository).
4. From the merged `main` commit: publish the engine (`cd packages/blit386 && pnpm run release`, which builds then
   `pnpm publish`), confirm `npm view blit386 version`, then follow `packages/create-blit386/PUBLISHING.md` steps 4-8
   exactly (kit dry-run -> kit publish -> scaffolder dry-run, confirming `@blit386/kit` resolves to a real version, not
   `workspace:*` -> scaffolder publish -> one tag covering all three -> verify all three on the registry -> smoke test
   -> `gh release create X.Y.Z --title "X.Y.Z" --notes-file RELEASE.md --latest`).
5. Use a plain, unproxied terminal for `pnpm publish` / `pnpm run release` when OTP / auth URLs would be redacted in a
   sandboxed shell.
6. When the release ships migrations or hot-reload / agent changes, include the extra smoke checks and the
   `blit upgrade` / `blit migrate` callout for existing games from `PUBLISHING.md` step 7.
7. Regenerate `packages/blit386/docs/_api-history.json` – see below, only after the tag exists.

#### Mark the changelog as released

`packages/blit386/docs/changelog.md` usually already has a `## X.Y.Z - Unreleased` section – features add their own
entries as they merge. Change the heading to `## X.Y.Z - <today's date>`.

Do not assume that section is complete just because it exists. A PR can ship a fully `@since`-tagged feature with
correct API docs and still skip the editorial changelog entry. Cross-check every `{ version: NEW_VERSION, note }` entry
in `docs/_api-history.json`'s `symbols[*].changes` arrays against the changelog section – anything present there but
missing from the changelog is a gap to add.

#### Verify docs coverage

For each new/changed public symbol in this release, grep across `packages/blit386/docs/*.md` (api-core.md, the relevant
guide-*.md, api-browser-support.md, …) to confirm it's actually documented, not just `@since`-tagged. Also check the
root `CLAUDE.md`'s "Where the detail lives" table: a release that adds a new subsystem or notable API surface usually
needs a row there.

Then check the two downstream packages:

- `packages/kit` and `packages/create-blit386`: grep `packages/kit/content/{docs,rules,skills}/` for anything describing
  the changed API. A default-value flip is the dangerous case – it can make existing skill/doc prose actively wrong, not
  just stale, and won't show up as a missing mention.
- `packages/website`: if `packages/blit386/docs/` changed, the mirror is stale. `pnpm run sync:docs` there reads the
  sibling `../blit386/docs` path directly off disk – it does not need those changes pushed to GitHub first. Follow with
  `pnpm run sync:docs:check` and `pnpm run build` to confirm the site still compiles.

#### Regenerate `docs/_api-history.json` – only after the tag exists

The step most likely to get skipped or done in the wrong order. Do these four in sequence, after the single release tag
from "How to run the release" step 4 exists:

1. In `packages/blit386/scripts/gen-api-history.mjs`, bump `UNRELEASED_VERSION` from the version just tagged to the next
   one (e.g. `1.5.0` -> `1.5.1`).
2. Run `pnpm --filter blit386 run api:history`.
3. Verify: `pnpm --filter blit386 run api:history:check`, `pnpm --filter blit386 run api:since:check`,
   `pnpm --filter blit386 run test:api-history`.
4. `main` is protected – branch, PR, merge (`gh pr merge --merge`). Make sure the regenerated `docs/_api-history.json`
   is part of that PR.

Both possible mistakes here produce a subtly wrong `docs/_api-history.json` and neither fails loudly, so get the order
right rather than debugging it after the fact:

- Regenerating before the tag exists, with `UNRELEASED_VERSION` still equal to the version already bumped into
  `package.json`: `packageVersion` in the output flips to that version (a lie – it isn't published yet) while every
  symbol from this release correctly stays `"unreleased"` with a `null` date. `api:history:check` also starts failing at
  this point, purely because `package.json` no longer matches the committed manifest – that failure is expected and
  resolves itself once this section's steps are followed.
- Bumping `UNRELEASED_VERSION` before the tag exists: `packageVersion` and the version being bumped away from are now
  equal, so the generator's "future and untagged -> unreleased" rule never fires. Every symbol from this release flips
  straight to `"stable"` with a `null` date, claiming it shipped when it hasn't.

### Troubleshooting

See Troubleshooting in `packages/create-blit386/PUBLISHING.md` (OTP/auth, propagation lag, dirty-tree publish refusal,
scope publish errors).

### Report to the user

After a successful release:

- Published versions for `blit386`, `@blit386/kit`, and `create-blit386` (should be identical)
- Confirmation of the engine-first order: engine published and verified live before the kit
- Whether `engineRange` / `BLIT386_RANGE` derivation matched what `pnpm run bump` produced
- Confirmation the release tag (no `v` prefix) is pushed and points at the merged `main` commit, and that the GitHub
  Release is published with `--latest`
- Whether the tag also triggered the docs/demos production deploy (`deploy.yml`) and whether it succeeded
- Whether release notes mentioned `blit upgrade` / `blit migrate` for existing games
- Whether `docs/_api-history.json` was regenerated after the tag
