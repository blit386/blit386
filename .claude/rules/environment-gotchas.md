# Environment and tooling gotchas

Condensed mirror of `.cursor/rules/environment-gotchas.mdc`. Learned running preflight and the versioning workflow in
ephemeral / CI-style checkouts (no git tags, no outbound network). These are environment artifacts, not code bugs – do
not "fix" them by editing the checks.

- `_api-history.json` regeneration needs git tags. `pnpm run api:history` bakes each release date into the `versions`
  map from git tag dates (`resolveTagDate`). In a tag-less checkout every date regenerates as `null`, wiping the
  committed dates. After regenerating (for example to home a new `<Since symbol>` or add a page), restore the committed
  `versions` block; the only real diff should be your intended `symbols` / `pages` change. `api:history:check` and the
  `resolveTagDate` test in `scripts/gen-api-history.test.mjs` fail for the same tag-less reason and pass in CI.
- `docs:links` needs outbound network. It fails only on external `https://` URLs (the `blit386.dev` banner links, the
  Keep a Changelog and WebKit-bug references) returning 403 through a sandbox proxy; every relative/internal link still
  resolves. Confirm all failures are external before treating one as real.
- Hooks amplify those two artifacts. The pre-push hook runs `typecheck` + `lint` + `docs:links`; the lint-staged
  pre-commit hook runs `biome` / `prettier` / `eslint --fix` / `cspell` on staged files. When the only failures are the
  tag-less / no-network artifacts above, push with `--no-verify` after confirming the real checks (`typecheck`, `lint`,
  `format:check`, `spellcheck`) pass on their own.
- `.agents/skills/*` are symlinks to `.claude/skills/*`. Edit the `.claude` copy once and both update; do not treat them
  as two files to patch.
- `pnpm run spellcheck` scopes to `src/`, `docs/`, and `README.md`, so it does not scan `.claude/skills/` or `.cursor/`.
  The lint-staged pre-commit `cspell` does scan them, so staging a skill or rule file can surface a pre-existing unknown
  word; add legitimate words to `cspell.json`.

Cursor: `.cursor/rules/environment-gotchas.mdc` (always applied in this repo).
