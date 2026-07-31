---
name: cbt-release
description:
  Publish @blit386/kit and create-blit386 to npm following ./PUBLISHING.md. Publishing is manual-only (pnpm publish from
  vancura's machine) -- there is no CI publish workflow. Does not bump versions unless the user asks.
---

# Release (npm publish)

Guide a deliberate release of `@blit386/kit` and `create-blit386`. This skill does not auto-bump versions, open PRs,
push tags, or publish unless the user explicitly requests those steps.

**Canonical procedure: [`./PUBLISHING.md`](../../../PUBLISHING.md).** Read that file and follow it. Do not invent a
parallel checklist here – if this skill and `PUBLISHING.md` ever disagree, `PUBLISHING.md` wins and this skill is stale.

## Usage

```text
/cbt-release
```

## Agent guardrails (never skip)

1. **Engine first** – if kit `content/` documents new engine API, confirm `npm view blit386 version` already satisfies
   it before publishing (see `PUBLISHING.md` "Release order: engine first").
2. Always `pnpm publish`, never `npm publish` – only pnpm rewrites `workspace:*` to a real version.
3. Publish `@blit386/kit` before `create-blit386`.
4. Versions are permanent and lockstep – both packages share one `x.y.z`. Bump with `pnpm run bump -- <x.y.z>` (see
   `PUBLISHING.md` step 2). Never suggest separate per-package `npm version` commands, and never bias toward patch or
   minor – choose SemVer from the pre-bump checklist in `PUBLISHING.md`.
5. Release tags carry no `v` prefix (`1.3.0`, not `v1.3.0`).
6. Publishing is manual-only – no CI publish workflow, no `NPM_TOKEN`. Do not suggest re-adding either.
7. `blit386.engineRange` (kit) and `BLIT386_RANGE` (scaffolder) are different mechanisms; bump both together when kit
   content requires a newer engine floor (`PUBLISHING.md` "Versioning notes").

## How to run the release

1. Open `PUBLISHING.md` and walk **step 0** (pre-bump checklist) with the user – including drafting release-note bullets
   from `git log <last-tag>..HEAD`.
2. Follow steps 1–8 in that file exactly (bump → preflight → PR → merge → publish kit then scaffolder → tag → verify →
   smoke → GitHub Release).
3. Use a plain, unproxied terminal for `pnpm publish` when OTP / auth URLs would be redacted in a sandboxed shell.
4. When the release ships migrations or hot-reload / agent changes, include the extra smoke checks and the
   `blit upgrade` / `blit migrate` callout for existing games from `PUBLISHING.md` step 7.

## Troubleshooting

See Troubleshooting in `PUBLISHING.md`.

## Report to the user

After a successful release:

- Published versions for `@blit386/kit` and `create-blit386`
- Whether the engine-first gate applied, and what `npm view blit386 version` showed
- Whether `BLIT386_RANGE` / `blit386.engineRange` or kit `content/` were updated in the same release
- Confirmation the release tag (no `v` prefix) is pushed and points at the merged `main` commit, and that the GitHub
  Release is published
- Whether release notes mentioned `blit upgrade` / `blit migrate` for existing games
