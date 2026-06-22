---
name: bt-release
description:
  'Prepare a semver release: gather PR history since the last tag, write a polished RELEASE.md. Does NOT change any
  files except RELEASE.md.'
---

# Release

Generate a polished `RELEASE.md` for pasting into GitHub Releases. Reads every PR merged since the last tag from GitHub,
groups changes semantically, and writes clear human-readable release notes.

Does not modify `package.json`, `src/core/BTAPI.ts`, or any other source file. Does not create branches, commits, or
tags. All of that stays with the user.

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

If a PR does not match any group, add it to a final Other section.

### 8. Write the RELEASE.md narrative

Write `RELEASE.md` in the repository root following this exact structure.

#### Lead paragraph

One to three sentences capturing the theme of this release: what was the main focus, which systems changed, what a user
upgrading should know first. Be specific. Name actual things: "`BT` namespace", "btfont validation", "WebGPU adapter
limits". No marketing fluff. No passive voice.

Before writing the lead paragraph, invoke the `vancura-dinner-style` skill on a draft of the paragraph to refine the
prose voice. Apply its output as the final lead.

#### Per-group sections

For each non-empty group, write a `## <Group Heading>` section.

Start each section with one short prose sentence (no more than 20 words) introducing the changes.

Then one bullet per PR:

- Write the concrete change, not the commit type. "Bitmap font textures must now use `data:image/png;base64`" not "added
  validation for bitmap fonts".
- Name the actual thing changed: function name, constant name, file type, error class name.
- State user impact: what breaks, what is new, what improves, what is fixed.
- End with the PR number as a bare GitHub auto-link reference: `(#153)`. GitHub renders `#N` as a clickable link to the
  PR - use this format, not a full URL and not a Markdown link.
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
- "Last tag: LAST_TAG - New version: NEW_VERSION"
- "Review, edit as needed, then delete RELEASE.md after you paste it into GitHub Releases."
- "To bump the version in `package.json` and `src/core/BTAPI.ts`, do that manually or I can do it if you ask."
