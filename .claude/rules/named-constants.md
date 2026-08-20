---
paths: [packages/*/src/**, packages/*/templates/**, packages/*/scripts/**, packages/*/test/**, scripts/**]
---

# Named constants over repeated literals

A string or numeric literal that is **compared** – `===`, `switch`, a discriminant check, an `includes()` membership
test – at more than one call site, or that crosses a file or package boundary, gets one exported named constant, or in
TypeScript one literal-union type, that every site imports. Never re-type the literal.

Typo drift in a re-typed literal is silent: nothing throws, nothing fails to build, a branch just quietly stops being
taken. Where a literal-union type already exists the compiler catches that, which is why most of this repo's domain tags
(`Backend`, `AudioBus`, `EffectTier`, `EasingFunction`) are already safe. This rule is about everything the compiler is
not watching.

## Reach for the existing type first

Before adding a constant, check whether a literal-union type already describes the domain. Widening that union is better
than standing a parallel constant next to it – the union is the enforcement mechanism, and two sources of truth for one
domain is the problem this rule exists to prevent, not a fix for it.

Name the constant by what it means, not by where it lives; in `packages/blit386/src/**` that naming is governed by
[internal-scoped-naming.md](../../packages/blit386/.claude/rules/internal-scoped-naming.md).

## When it applies

| Situation | Applies |
| --- | --- |
| The same literal compared in two or more files | yes |
| The same literal compared twice in one file | yes |
| A literal that names something in another package (a version range, a marker string, a file class) | yes |
| A literal that also has to appear in a shader source, a JSON config, or a generated project file | yes – see below |
| A literal used exactly once | no |
| Structural values (`0`, `1`, `-1`) as an index, a length, or a bound | no |
| A test that deliberately hardcodes the expected wire value | no – pinning the literal is the point of the assertion |
| The constant's own definition site | no |

## Crossing out of TypeScript

The hardest version of this is a value that has to exist somewhere the compiler cannot follow: a WGSL or GLSL shader
source string, a JSON config in a sibling package, an HTML template, a file the scaffolder writes into a generated game.

Two options, and only two:

- **Thread the constant through.** Interpolate it into the shader template, derive the JSON at build time, generate the
  file from the same constant the runtime reads.
- **Document the duplication as a manual-sync hazard, at both sites.** A comment on each copy naming the other one, plus
  a line in whatever document governs that workflow.

Two silent hardcoded copies are not an option. That is the exact shape of every drift this rule was written from.

## What this rule would have caught

`GLITCH_TYPES` in `packages/demos` is re-typed as a bare array literal in five demo files. Three of them (`crt-pipboy`,
`snake-game`, `basics-enhanced`) list `hshift`, `chromasplit`, `noise`, `flicker`, `interference`; two of them
(`sprite-effects`, `logo-lowres`) have already diverged to a variant that drops `chromasplit` and adds `vroll`. Every
`this.glitchType === 'hshift'` branch re-types the literal a sixth, seventh, eighth time. Nothing in the toolchain can
tell an intentional variant from a typo here, because plain JavaScript demos have no compiler backstop at all.

## What doing it right looks like

The engine version range genuinely has to exist twice: `BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts` pins
the engine in a freshly scaffolded game's `package.json`, and `blit386.engineRange` in `packages/kit/package.json` tells
`blit doctor` which engine the kit's guides describe. Different mechanisms, different consumers, same value.

They stay in step because `scripts/bump-lockstep.mjs` writes both and `packages/create-blit386/PUBLISHING.md` records
that both are derived, never hand-edited. That is the threading option, done properly: one place decides the value, the
coupling is written down, and a reviewer who edits one copy by hand is told so.

## Per-package notes

- `packages/demos` is plain JavaScript with no compiler safety net, so shared values live in `src/shared/` next to
  `ui-theme.js` and `post-process-backend.js`, not re-typed per demo.
- `packages/blit386` should widen an existing literal-union type wherever one covers the domain, and interpolate any
  numeric sentinel shared with a WGSL source into the shader template rather than typing it twice.
- `packages/kit` and `packages/create-blit386` describe each other constantly – version ranges, file classes, marker
  strings, ownership manifests. Any literal one package uses to talk about the other is derived or documented, never
  copied.

Full shared-conventions list: [CLAUDE.md](../../CLAUDE.md).
