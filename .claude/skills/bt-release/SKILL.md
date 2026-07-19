---
name: bt-release
description:
  'Prepare a semver release: gather PR history since the last tag, write a polished RELEASE.md. Also the reference for
  the rest of the release lifecycle (version bump, changelog, docs coverage, downstream repos, npm publish, API-history
  regeneration) – walk through it when asked to do more than just RELEASE.md.'
---

# Release

Generate a polished `RELEASE.md` for pasting into GitHub Releases. Reads every PR merged since the last tag from GitHub,
groups changes semantically, and writes clear human-readable release notes.

The RELEASE.md generation itself (steps 1-9 below) does not modify `package.json`, `src/core/BTAPI.ts`, or any other
source file, and does not create branches, commits, or tags. When the user asks for more than RELEASE.md – "do the whole
release", "bump the version", "mark the changelog released", "remind me of the npm workflow" – see
[After RELEASE.md: the rest of the release](#after-releasemd-the-rest-of-the-release) below; that part does touch other
files, but only when asked.

## Usage

```text
/bt-release
```

## Steps

### 1. Ask for the new version

Ask the user: "What version are you releasing? (e.g. 1.0.5, 1.1.0, 2.0.0)"

Wait for the answer. Validate it is a valid semver (three dot-separated non-negative integers). If invalid, ask again.

Store the answer as NEW_VERSION (e.g. `1.0.5`).

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

Store `$TAG_DATE` for use in step 3 and `$LAST_TAG` for the changelog URL at the end.

### 3. Get all commits since the last tag

```bash
git log $LAST_TAG..HEAD --format="%H %s"
```

Store the list of commit SHAs and subjects. These are the commits the release notes must cover.

### 4. Fetch PRs merged since the last tag

```bash
# 500 is a safe ceiling for a single-maintainer repo; raise if a release ever spans more PRs
gh pr list --state merged --limit 500 \
  --json number,title,body,mergedAt | \
  jq --arg tag_date "$TAG_DATE" \
  '[.[] | select(.mergedAt > $tag_date) | select(.title | test("^(feat|chore|fix): release ") | not)]'
```

This returns a JSON array where each element has `.number`, `.title`, `.body`, `.mergedAt`.

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
pairs.

Exclude merge commits (subjects starting with `Merge `).

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

### 7. Group PRs by topic

Assign each PR to exactly one group based on its conventional commit type/scope. Use these groups in this order (omit
any group with zero PRs):

| Group heading  | Match pattern                                                                |
| -------------- | ---------------------------------------------------------------------------- |
| API Changes    | `feat(api)`, `fix(api)`, `refactor(api)`, BREAKING CHANGE in body            |
| Asset System   | `feat(assets)`, `fix(assets)`, `refactor(assets)`, `chore(assets)`           |
| Security       | `feat(security)`, `fix(security)`, `ci(security)`, `chore(security)`         |
| CI and Tooling | `ci(*)`, `chore(ci)`, `chore(deps)`, `chore` (tool upgrades, config changes) |
| Rendering      | `feat(renderer)`, `fix(renderer)`, `refactor(renderer)`                      |
| Core and Utils | `feat(utils)`, `fix(utils)`, `refactor(utils)`, `feat(core)`, `fix(core)`    |
| Tests          | `test(*)`                                                                    |
| Documentation  | `docs(*)`                                                                    |
| Examples       | `feat(examples)`, `fix(examples)`                                            |

This table is not exhaustive – `blit386/CLAUDE.md`'s "Git scopes" list is longer (`audio`, `overlay`, `input`, `camera`,
`assets`, `release`, `visual`, …). When a PR's scope isn't in the table above, give it its own topic-matched heading
("Audio", "Overlay", "Input") instead of forcing it into a generic bucket – this is what both the real 1.3.0 GitHub
release and the 1.3.1 `RELEASE.md` actually did (`## Audio`, `## Overlay`, `## Input` headings that aren't in this
table). Reserve a final `## Other` section only for PRs with no clear topic at all.

### 8. Write the RELEASE.md narrative

Write `RELEASE.md` in the repository root following this exact structure.

#### Lead paragraph

One to three sentences capturing the theme of this release: what was the main focus, which systems changed, what a user
upgrading should know first. Be specific. Name actual things: "`BT` namespace", "btfont validation", "WebGPU adapter
limits". No marketing fluff. No passive voice.

After drafting the lead paragraph, tighten it: lead with the release's single most important change, cut every hedge and
adverb that does not carry information, and read it aloud once to catch passive voice.

#### Per-group sections

For each non-empty group, write a `## <Group Heading>` section.

Start each section with one short prose sentence (no more than 20 words) introducing the changes.

Then one bullet per PR:

- Write the concrete change, not the commit type. "Bitmap font textures must now use `data:image/png;base64`" not "added
  validation for bitmap fonts".
- Name the actual thing changed: function name, constant name, file type, error class name.
- State user impact: what breaks, what is new, what improves, what is fixed.
- End with the PR number as a bare GitHub auto-link reference: `(#153)`. GitHub renders `#N` as a clickable link to the
  PR – use this format, not a full URL and not a Markdown link.
- Never mention the author (`@vancura` or any username).
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

#### Example output

```markdown
# Release 1.0.5

This release is mostly about security hardening and tighter asset validation. The btfont loader now enforces strict data
URI format and a payload cap, and GitHub Actions are pinned to commit SHAs. A handful of CI improvements land alongside.

## Asset System

The btfont pipeline grew proper input validation this cycle.

- Bitmap font textures embedded in `.btfont` files must use `data:image/png;base64` with a 512 KiB payload cap. Fonts
  using other URI schemes or oversized payloads now fail fast with a clear error instead of silently misbehaving. (#168)
- Glyph metrics are validated before atlas decode; atlas bounds are checked after. Invalid fonts surface a descriptive
  error at load time. (#168)

## Security

Supply-chain posture tightened across CI.

- All third-party GitHub Actions are now pinned to full commit SHAs with explicit minimum permissions per job. Reduces
  surface area for dependency substitution attacks. (#157)
- `brace-expansion` and `ws` dev CVEs patched via pnpm overrides pinned to fixed versions. The minimum-release-age rule
  is suspended for these two packages so patches apply immediately. (#165)

## Tests

- Render dimension limit tests expanded to cover `NaN` in `maxCanvasSize`, adapter limit rejection, and device limit
  rejection without software fallback. (#169)

Full Changelog: https://github.com/blit386/blit386/compare/1.0.4...1.0.5
```

### 9. Report to the user

After writing RELEASE.md, report:

- "Wrote `RELEASE.md` covering N PRs across M sections" (and how many direct commits if any)
- "Last tag: LAST_TAG – New version: NEW_VERSION"
- "Review, edit as needed, then delete RELEASE.md after you paste it into GitHub Releases."
- "To bump the version in `package.json` and `src/core/BTAPI.ts`, do that manually or I can do it if you ask."

## After RELEASE.md: the rest of the release

`/bt-release` only writes `RELEASE.md`. Everything below is manual-on-request, not automatic – walk through it in this
order when the user asks for more, since later steps depend on earlier ones (the API-history step in particular is
order-sensitive and silently produces wrong data if done too early).

### 10. Bump the version

Two places, kept in lockstep:

- `package.json` -> `"version"`
- `src/core/BTAPI.ts` -> `VERSION_MAJOR` / `VERSION_MINOR` / `VERSION_PATCH`

### 11. Mark the changelog as released

`docs/changelog.md` usually already has a `## X.Y.Z - Unreleased` section – features add their own entries as they
merge. Change the heading to `## X.Y.Z - <today's date>`.

Do not assume that section is complete just because it exists. A PR can ship a fully `@since`-tagged feature with
correct API docs and still skip the editorial changelog entry – this happened in 1.3.1: the overlay toggle hit-region PR
(#366) was correctly documented in `docs/api-core.md`, `docs/api-overlay.md`, and `docs/guide-overlay.md`, but never
touched `docs/changelog.md`. Cross-check every `{ version: NEW_VERSION, note }` entry in `docs/_api-history.json`'s
`symbols[*].changes` arrays against the changelog section – anything present there but missing from the changelog is a
gap to add.

### 12. Verify docs coverage

For each new/changed public symbol in this release, grep across `docs/*.md` (api-core.md, the relevant guide-*.md,
api-browser-support.md, …) to confirm it's actually documented, not just `@since`-tagged. Also check `CLAUDE.md`'s
"Where to Find Information" table: a release that adds a new subsystem or notable API surface usually needs a row there.
Compare sibling PRs in the same release – if one PR added a table row for its feature and another PR shipping a
similarly-sized feature didn't, that's a real gap, not a style choice. (1.3.1: the wake-lock and orientation PRs each
added a table row; the pointer/keyboard scroll-capture PRs shipped the same release and didn't.)

### 13. Check downstream repos

- `../create-blit386`: grep `packages/kit/content/{docs,rules,skills}/` for anything describing the changed API. A
  default-value flip is the dangerous case – it can make existing skill/doc prose actively wrong, not just stale, and
  won't show up as a missing mention. (1.3.1: `isCapturingPointerScroll` flipped from always-on to opt-in default;
  `read-pointer/SKILL.md` needed both a new opt-in snippet AND a fix to code that assumed the old default.) Run
  `pnpm run preflight` there afterward.
- `../blit386-dev-fumapress`: if `docs/` changed, the mirror is stale. `pnpm run sync:docs` there reads the local
  sibling `../blit386/docs` path directly off disk – it does not need those changes pushed to GitHub first. Follow with
  `pnpm run sync:docs:check` and `pnpm run build` to confirm the site still compiles (a Twoslash code block that doesn't
  compile standalone fails the build, not just the check).

### 14. Land it, tag it, publish it

`main` is protected – branch, PR, squash-merge, then from the merged commit:

```bash
git checkout main && git pull
git tag X.Y.Z              # no "v" prefix, e.g. 1.3.2 not v1.3.2
git push origin X.Y.Z
pnpm run release          # = pnpm run build && pnpm publish
gh release create X.Y.Z --title "Release X.Y.Z" --notes-file RELEASE.md
```

Verify with `npm view blit386 version`. Full checklist (2FA/OTP, verify/smoke-test steps, troubleshooting): see
`docs/developer-experience-guide.md` ("Before releases").

### 15. Regenerate `docs/_api-history.json` – only after the tag exists

The step most likely to get skipped or done in the wrong order. Do these four in sequence, after the tag from step 14
exists:

1. In `scripts/gen-api-history.mjs`, bump `UNRELEASED_VERSION` from the version just tagged to the next one (e.g.
   `1.3.1` -> `1.3.2`).
2. Run `pnpm run api:history`.
3. Verify: `pnpm run api:history:check`, `pnpm run api:since:check`, `pnpm run test:api-history`.
4. `main` is protected – branch, PR, squash-merge (mirrors PR #364 for 1.3.0, merged the day after that tag). Make sure
   the regenerated `docs/_api-history.json` is part of that PR.

Both possible mistakes here produce a subtly wrong `docs/_api-history.json` and neither fails loudly, so get the order
right rather than debugging it after the fact:

- Regenerating before the tag exists, with `UNRELEASED_VERSION` still equal to the version already bumped into
  `package.json`: `packageVersion` in the output flips to that version (a lie – it isn't published yet) while every
  symbol from this release correctly stays `"unreleased"` with a `null` date. `api:history:check` also starts failing at
  this point, purely because `package.json` no longer matches the committed manifest – that failure is expected and
  resolves itself once this section's steps are followed, it does not mean something else broke.
- Bumping `UNRELEASED_VERSION` before the tag exists: `packageVersion` and the version being bumped away from are now
  equal, so the generator's "future and untagged -> unreleased" rule never fires (the comparison is `0`, not `> 0`).
  Every symbol from this release flips straight to `"stable"` with a `null` date, claiming it shipped when it hasn't.

Both were reproduced and reverted (`git diff` then `git restore --staged --worktree -- docs/_api-history.json`) while
diagnosing this during 1.3.1 release prep, before landing on the order above.
