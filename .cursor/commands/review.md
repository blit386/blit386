# Review Changes

Review the branch's changes against project rules and quality standards.

## Usage

```text
/review <package>... [--base <ref>]
```

Each `<package>` is one of `blit386`, `demos`, `website`, `kit`, `create-blit386`, or `root`. Name several to review a
change that spans them (`/review website root`); each package is reviewed and reported on its own.

`--base <ref>` sets the base the change set is measured from; it defaults to `origin/main`. `--base HEAD` reviews only
uncommitted changes.

## Steps

1. Gather changes

The change set has one rule: everything between the merge-base of `<base>` and both the working tree and the index - the
branch's commits, staged and unstaged edits, plus untracked files. It is the same whether the work is committed, pushed,
or not yet staged. Compute the merge-base once:

```bash
BASE=origin/main # or the --base ref
MB=$(git merge-base "$BASE" HEAD)
```

Never collect `.claude/settings.local.json`, `.claude/launch.json`, or `.claude/scheduled_tasks.*` - gitignored,
machine-local, never in scope for a review. Use an explicit allowlist rather than a broad exclusion pattern, so a new
root file that isn't yet gitignored can't slip into the review context either. The allowlists below are shell arrays,
not space-separated strings - zsh (macOS's default shell) does not word-split an unquoted `"$VAR"` scalar the way bash
does, so a plain string variable silently collapses into one no-op pathspec argument there.

For each package named, gather its slice:

- A package: run `git diff "$MB" -- packages/<package>/`, `git diff --cached "$MB" -- packages/<package>/`, and
  `git ls-files --others --exclude-standard -- packages/<package>/` to see this package's changes plus newly created
  files a diff alone misses. The `--cached` diff catches a staged edit that was later reverted in the working tree - the
  commit would still include it.
- `root`: run the same three commands against the full root-owned allowlist - everything a root-level change could
  touch, and nothing else:

  ```bash
  ROOT_ALLOWLIST=(CLAUDE.md AGENTS.md .claude/rules/ .claude/skills/ .claude/settings.json .husky/ \
    .github/ .zed/ scripts/ .devcontainer/ .coderabbit.yaml .editorconfig .gitattributes .gitignore \
    .lintstagedrc.json .npmrc .prettierignore CODEOWNERS CODE_OF_CONDUCT.md CONTRIBUTING.md \
    LICENSE SECURITY.md biome.json commitlint.config.js cspell.json knip.json package.json pnpm-lock.yaml \
    pnpm-workspace.yaml prettier.config.js renovate.json tsconfig.base.json .agents/ .codex/ .cursor/ .gemini/ \
    .opencode/ opencode.json .mcp.json .node-version README.md docs/)
  git diff "$MB" -- "${ROOT_ALLOWLIST[@]}"
  git diff --cached "$MB" -- "${ROOT_ALLOWLIST[@]}"
  git ls-files --others --exclude-standard -- "${ROOT_ALLOWLIST[@]}"
  ```

- Root policy changes apply to every package, so when `root` is not among the packages named, also gather this
  root-policy allowlist once, under the first package named:

  ```bash
  POLICY_ALLOWLIST=(CLAUDE.md AGENTS.md .claude/rules/ .claude/skills/ .claude/settings.json)
  git diff "$MB" -- "${POLICY_ALLOWLIST[@]}"
  git diff --cached "$MB" -- "${POLICY_ALLOWLIST[@]}"
  git ls-files --others --exclude-standard -- "${POLICY_ALLOWLIST[@]}"
  ```

- List which files changed and what changed, per package. A package whose slice is empty is reported as "no changes in
  scope against `<base>`" - never as a clean review

2. Run automated checks, for each package named

- `blit386`: `pnpm run lint`, `pnpm run typecheck`, `pnpm run spellcheck` (all inside `packages/blit386`)
- `demos`: `pnpm run lint`, `pnpm run spellcheck`, `pnpm run build` (production build is the deployment gate for
  Cloudflare Pages)
- `website`: covered by `/preflight website` - run it before merge
- `kit` / `create-blit386`: `pnpm run typecheck` (per package); root `pnpm run format:check` covers lint via Biome

3. Check each package's slice against project rules

Full detail lives in the root `CLAUDE.md` and the package's own `CLAUDE.md`, plus the rule files under `.claude/rules/`
\- read those for the exact getter list, naming exceptions, and edge cases rather than relying on a paraphrase here.

Shared across every package:

- No emoji anywhere (code, comments, docs, commits)
- American English spelling, with the documented exemptions (`AnalyserNode`, the `gray`/`grey` alias)
- Consistent naming conventions, proper error handling (guard clauses, null checks)
- Named constants: a literal compared at more than one site gets one named constant or literal-union type
  (`.claude/rules/named-constants.md`)
- Plain hyphen-minus for parenthetical breaks and ranges - no en or em dashes
- Markdown tables stay compact (one space of padding, never aligned to the widest cell)
- Docs sync: behavior, API, script, or workflow changes update their docs in the same change
  (`.claude/rules/docs-sync-required.md`)
- Claims are true, not just in sync: every behavior claim a changed doc, rule, skill, or comment makes ("always
  blocked", "every X proves Y", "never", "only") names the code line that makes it true, or is flagged
- Guards and parsers get adversarial inputs: for a changed hook, guard, validator, or parser of untrusted text, list a
  few realistic inputs that would slip past or wrongly trip it (quoting, wrapper commands, chained commands, option
  operands) and check each; contrived ones go in a documented limits note instead
- Taps, wrappers, and mirrors check their callee: for new code that records, wraps, or re-implements another module's
  behavior (a `BT.*` tap, a readout of what was drawn, a test double), open the callee and list every early return and
  transform it applies (a transparent slot, a camera or clamp offset, a thrown error, a phase it ignores). Check the
  mirror agrees with each, and that its tests and manual checks use a case where each one fires, not only the default
  (camera at zero, slot above 0). A claim like "display position" or "what was drawn" names the callee line that makes
  it true

`blit386`:

- Integer coordinates (`Vector2i`, `Rect2i`) for rendering
- TypeScript strict types (no `any`); type-only imports for types
- Internal scoped naming: private/protected/module-local names don't repeat the class or file name (`request()` on
  `FrameCapture`, not `requestCapture()`); public `BT.*` and barrel exports stay unchanged
- BT API shape: read-only zero-arg snapshots are getters (`BT.displaySize`, `BT.targetFPS`), not `BT.foo()`; actions and
  parameterized queries stay methods
- New or changed public exports carry an `@since` tag and a matching `docs/_api-history.json` entry
  (`packages/blit386/.claude/rules/bt-api-getters.md`)

`demos`:

- Integer coordinates (`Vector2i`, `Rect2i`) for rendering
- Plain JavaScript (ES2022, no TypeScript)
- Beginner-friendly comments: every logical block in `src/*.js` needs a plain-English comment explaining what it does
  and why. A comment that only restates the code (`// increment counter` above `i++`) is not sufficient
- Shared UI kit only - on-screen UI comes from `src/shared/ui.js` (`applyTheme()` in `init()` before `BT.paletteSet()`,
  `ui.tick()` first in `update()`, `ui.begin()` / widgets / `ui.end()` in `render()`); never hand-rolled panels,
  buttons, or HUD colors (the five full-screen pieces listed in `packages/demos/CLAUDE.md` are the exceptions)
- Touch usability: every key-triggered action also has a `ui.button` with a `{ key }` binding; directional input also
  has `ui.dpadWidget()` / `ui.swipe()`
- Keyboard edges (`BT.isKeyPressed`, `BT.isKeyReleased`, `BT.inputString`, kit `{ key }` bindings via `ui.tick()`) read
  from `update()`, never `render()`
- Audio: SFX never assumed to play before the first user gesture; audio demos gate their prompt on `BT.isAudioUnlocked`
- New demo slugs: number-free kebab-case, first path segment starts with a letter

`website`:

- MDX pages have `title` frontmatter; descriptions where helpful
- Links point to stable URLs; engine API links go to site paths (`/docs/api/...`, `/docs/guides/...`) for anything in
  the engine's `docs/_sitemap.json` manifest. Only unmirrored contributor docs link to GitHub
- Generated files never appear in a diff: `content/docs/{api,guides,performance,reference,build-a-game}/**` and
  `src/data/api-history.generated.json` are gitignored output of `pnpm run sync:docs`
- Config changes (`press.config.tsx`, `source.config.ts`) reflected in `CLAUDE.md` if behavior changed

`kit` / `create-blit386`:

- Named exports only in library TypeScript; no default exports
- Beginner-friendly comments in scaffold templates and kit content
- Scaffold templates: placeholders render (no leftover `{{tokens}}`); optional wizard flags copy the right
  `templates/optional/` trees; generated `package.json` must not leak `workspace:*`
- Kit content is self-contained: skills and docs reference only `blit386` and other local kit files, never the `demos`
  package
- Generated game code uses public `BT` names from `blit386`
- Docs and kit content updated when workflow or architecture changes

4. Summarize findings, one section per package

- State the change set first: base ref, merge-base, and the file count per package
- List critical issues that must be fixed
- List warnings and suggestions for improvement
- Highlight any security concerns

## Output Format

```md
Change set: origin/main (merge-base abc1234)...working tree - website: 3 files, root: 2 files

## website

### Critical Issues

- [File:Line] Description of issue

### Warnings

- [File:Line] Description of warning

### Suggestions

- Consider doing X for better Y

## root

(same three subsections)

## Summary

Overall assessment of the changes and readiness for a commit.
```

## Notes

- Run or suggest `/preflight <package>` before approving - that is the full gate.
