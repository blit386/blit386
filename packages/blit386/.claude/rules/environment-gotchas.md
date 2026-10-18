# Environment and tooling gotchas

Learned running preflight and the versioning workflow in ephemeral / CI-style checkouts (no git tags, no outbound
network). These are environment artifacts, not code bugs - do not "fix" them by editing the checks.

- `_api-history.json` regeneration needs git tags. `pnpm run api:history` bakes each release date into the `versions`
  map from git tag dates (`resolveTagDate`). In a tag-less checkout every date regenerates as `null`, wiping the
  committed dates. After regenerating (for example to home a new `<Since symbol>` or add a page), restore the committed
  `versions` block; the only real diff should be your intended `symbols` / `pages` change. `api:history:check` and the
  `resolveTagDate` test in `scripts/gen-api-history.test.mjs` fail for the same tag-less reason and pass in CI.
- `docs:links` needs outbound network. It fails only on external `https://` URLs (the `blit386.dev` banner links, the
  Keep a Changelog and WebKit-bug references) returning 403 through a sandbox proxy; every relative/internal link still
  resolves. Confirm all failures are external before treating one as real.
- Hooks amplify those two artifacts. The pre-push hook runs `preflight` (which includes `typecheck` + `lint`) for the
  packages changed since the upstream ref (every package when more than one ref is pushed or no base ref resolves),
  then - only if that succeeds - one root-level pass: `format:check`, `docs:links`, `agents:check`,
  `sync:cursor-commands:check`, `sync:maintainer-agents:check`, `bump:check` (`docs:links` and `agents:check` are not
  package-scoped, so they were removed from every package's own `preflight` chain to stop running 2-4x per push - see
  the `preflight` skill). A failed package preflight skips that root-level pass entirely; the bench-coverage reminder
  runs last and never fails the push. The lint-staged pre-commit hook runs `biome` / `prettier` / `eslint --fix` /
  `cspell` on staged files. When the only failures are the tag-less / no-network artifacts above, push with
  `--no-verify` after confirming the real checks (`typecheck`, `lint`, `format:check`, `spellcheck`) pass on their own.
- `.agents/skills/*` are symlinks to `.claude/skills/*`. Edit the `.claude` copy once and both update; do not treat them
  as two files to patch.
- `pnpm run spellcheck` (from `packages/blit386`) scopes to `src/`, `docs/`, and `README.md`, so it does not scan the
  root `.claude/skills/`. The lint-staged pre-commit `cspell` does scan it, so staging a skill or rule file can surface
  a pre-existing unknown word; add legitimate words to the root `cspell.json`, shared by every package.
