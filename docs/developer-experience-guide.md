# Developer Experience Guide

This guide covers the contributing workflow, code style conventions, IDE setup, and maintenance checklists for the
BLIT386 project.

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contributor workflow. Key points:

- Fork the repository and create a feature branch from `main`.
- Use **Node.js** >=22.18.0 and **pnpm** 10.26.2+ (see `engines` and `packageManager` in `package.json`).
- Run `pnpm install` and confirm `pnpm run preflight` passes before opening a PR.
- All commits require a DCO sign-off: use `git commit -s`.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
- Open a pull request against `main`. CI must be green before merge.

---

## Repository Scripts

These commands apply when building or maintaining **blit386** from a repository checkout (not when consuming the npm
package).

| Command                             | Description                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm run build`                    | Build the library for npm distribution                                                          |
| `pnpm run lint`                     | Run ESLint                                                                                      |
| `pnpm run lint:fix`                 | Run ESLint with auto-fix                                                                        |
| `pnpm run format`                   | Format all code (Biome + Prettier)                                                              |
| `pnpm run format:check`             | Check all formatting without changes                                                            |
| `pnpm run format:biome`             | Format TS/JS/JSON/CSS only (Biome)                                                              |
| `pnpm run format:prettier`          | Format Markdown/YAML/HTML/HBS (Prettier)                                                        |
| `pnpm run typecheck`                | Run TypeScript type checking                                                                    |
| `pnpm run spellcheck`               | Check spelling in source files                                                                  |
| `pnpm run test`                     | Run all unit tests (alias for `test:unit`)                                                      |
| `pnpm run test:unit`                | Run all unit tests                                                                              |
| `pnpm run test:unit:watch`          | Run unit tests in watch mode                                                                    |
| `pnpm run test:unit:coverage`       | Run unit tests with coverage report (80% threshold)                                             |
| `pnpm run test:declarations`        | Declaration tooling log checker (Node test)                                                     |
| `pnpm run build:check-declarations` | Build and run declaration tooling check on build log                                            |
| `pnpm run test:visual`              | Playwright visual regression tests (requires Chrome with WebGPU)                                |
| `pnpm run test:visual:update`       | Update visual test baseline screenshots                                                         |
| `pnpm run test:visual:coverage`     | Run visual tests with Istanbul coverage report                                                  |
| `pnpm run bench`                    | Run CPU benchmarks — Tier 4 (Vitest bench; see [Testing](testing.md))                           |
| `pnpm run bench:json`               | Run Tier 4 benchmarks and write `benchmark-results.json`                                        |
| `pnpm run preflight`                | All checks: format, lint, typecheck, spellcheck, knip, docs:links, test:unit, test:declarations |
| `pnpm run docs:links`               | Check Markdown links in all repo-root `*.md` / `*.mdx` files                                    |
| `pnpm run knip`                     | Find unused exports and dependencies                                                            |
| `pnpm run knip:fix`                 | Auto-fix unused exports and dependencies                                                        |
| `pnpm run clean`                    | Remove dist and cache directories                                                               |
| `pnpm run release`                  | Build library and publish to npm                                                                |
| `pnpm run convert-font`             | Convert BMFont to .btfont format                                                                |
| `pnpm run system-font:export`       | Export system font data to PNG atlas (`assets/system-font.png`)                                 |
| `pnpm run system-font:convert`      | Regenerate `systemFontData.ts` from edited PNG atlas                                            |
| `pnpm run security:audit`           | Run dependency security audit (all deps, moderate+; matches CI)                                 |
| `pnpm run security:audit:prod`      | Run production-only dependency audit (moderate+)                                                |
| `pnpm run security:audit:fix`       | Run dependency security audit and auto-fix                                                      |
| `pnpm run security:mcp-preflight`   | MCP health/auth preflight and governance scan (requires `-- --mcps-dir`)                        |
| `pnpm run test:security-preflight`  | Unit tests for MCP preflight script                                                             |

Dependency audit severity policy and CI gate: [dependency-policy.md](security/dependency-policy.md). Temporary
exceptions: [audit-exceptions.md](security/audit-exceptions.md).

---

## Documentation Index

| Guide                                                               | What it covers                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| [API: Core](api-core.md)                                            | bootstrap, init, game loop, camera, Timer, core types  |
| [Overlay Guide](overlay.md)                                         | engine HUD subsystem, toggle, custom rows, layout      |
| [API: Rendering](api-rendering.md)                                  | primitives, sprites, text, post-process, frame capture |
| [API: Palette](api-palette.md)                                      | palette setup, presets, effects, serialization         |
| [Palette Guide](palette-guide.md)                                   | palette-first workflow, offsets, effects, performance  |
| [Palette Presets](palette-presets.md)                               | built-in preset reference and exact color data         |
| [API: Assets](api-assets.md)                                        | sprite sheets, bitmap fonts, asset loading             |
| [Input Guide](input.md)                                             | pointer, keyboard, gamepad                             |
| [Post-Process Effects](post-process-effects.md)                     | effect chain, built-in effects, custom effects         |
| [Bitmap Fonts](bitmap-fonts.md)                                     | .btfont format, BMFont conversion                      |
| [Deprecation Timeline](deprecations.md)                             | dated compatibility aliases and cleanup checklist      |
| [Testing](testing.md)                                               | test tiers, WebGPU mocks, visual regression            |
| [Performance Testing](performance-testing.md)                       | CPU benchmarks, CI regression checks                   |
| [Performance Best Practices](performance-best-practices.md)         | optimization guidelines                                |
| [Software Fallback Smoke Matrix](software-fallback-smoke-matrix.md) | manual software renderer verification matrix           |
| [Developer Experience](developer-experience-guide.md)               | contributing workflow, IDE setup                       |
| [Security runbook](security/security-runbook.md)                    | MCP preflight, fallbacks, governance, security runs    |
| [Dependency policy](security/dependency-policy.md)                  | CI audit gate, severity threshold, refresh cadence     |
| [Audit exceptions](security/audit-exceptions.md)                    | Temporary GHSA acceptance playbook                     |
| [Tooling](tooling.md)                                               | TypeScript pin, declaration checks, CI enforcement     |
| [Voice Guide](voice.md)                                             | error messages and user-facing string style            |

---

## Commit Guidelines

Format: `<type>(<scope>): <description>`

**Types:**

| Type       | When to use                                 |
| ---------- | ------------------------------------------- |
| `feat`     | New feature                                 |
| `fix`      | Bug fix                                     |
| `refactor` | Code change that is neither fix nor feature |
| `docs`     | Documentation only                          |
| `test`     | Tests only                                  |
| `chore`    | Build, config, tooling                      |
| `perf`     | Performance improvement                     |
| `ci`       | CI / workflow changes                       |
| `style`    | Formatting, no code change                  |
| `build`    | Build system or external dependencies       |
| `revert`   | Revert a previous commit                    |

**Scopes:** `renderer`, `camera`, `assets`, `api`, `utils`, `examples`, `ci`, `docs` (convention only; not enforced)

AI-assisted commits add a trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`

---

## Code Style

**Formatting:**

- 4-space indent, 120-character line width
- Single quotes, always semicolons, always trailing commas
- Biome formats TypeScript/JavaScript; Prettier formats Markdown/YAML/**`.mdc`** Cursor rules
- Run `pnpm run format` to auto-format; `pnpm run format:check` to verify

**Linting:**

- ESLint with perfectionist, jsdoc, security, and promise plugins
- `perfectionist/sort-classes` enforces class member order (see **File structure and member order**);
  `simple-import-sort` enforces import/export order
- `pnpm run lint` to check; `pnpm run lint:fix` to auto-fix

**Naming conventions:**

- Public API methods: camelCase
- Types and classes: PascalCase
- Constants: `SCREAMING_SNAKE_CASE` for module-level; camelCase for local
- Named exports only; no default exports
- JSDoc required for all public API members
- **Internal scoped naming:** private fields, private methods, protected members, and module-local constants/types
  **must not repeat the class or file name** (context already scopes them). Examples: `FrameCapture.request()` not
  `requestCapture()`; `FRAGMENT_WGSL` in `Bloom.ts` not `BLOOM_FRAGMENT_WGSL`; file-local `Serialized` in `Palette.ts`
  not `PaletteJSON` or `JSON`. Does **not** apply to `BT.*`, barrel exports, or public class methods. JSDoc that points
  at public API uses full public names (`BT.BTN_POINTER_A`, not shortened internal aliases). See
  [CLAUDE.md](../CLAUDE.md) (**Internal scoped naming**).
- **`BT` getters vs methods:** zero-argument read-only snapshots are getters (`BT.displaySize.y`); actions,
  parameterized queries, and async work are methods (`BT.cameraSet`, `BT.pointerPos(0)`). Full rules:
  [CLAUDE.md](../CLAUDE.md) (**BT API: getters vs methods**).
- **`BT` getter names** that surface `configure()` / `HardwareSettings` use the **same field names** (`displaySize`,
  `targetFPS`, `drawingBufferSize`, …). `BT.outputSize` is **derived** (`drawingBufferSize ?? displaySize`), not a
  configure field. Keep acronym spelling consistent (`targetFPS`, not `targetFps`). Runtime-only reads use descriptive
  names (`activeBackend`, `requestedBackend`, `ticks`, `deltaSeconds`). Use `activeBackend` for runtime capability
  checks; `requestedBackend` mirrors resolved `HardwareSettings.backend` (including `?backend=software`).

**Boolean naming (three tiers):**

| Tier                                          | Use                         | Examples                                                                   |
| --------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| **A** Runtime read-only queries               | `is*` / `has*`              | `isPointerActive`, `isIndexed`, `hasGlyph`, `isDirty`                      |
| **B** `HardwareSettings` / `BootstrapOptions` | grammatical `is*`           | `isOverlayEnabled`, `isDetectingDroppedFrames`                             |
| **C** Side effects / operation results        | imperative verbs, not `is*` | `fireIfElapsed()`, `intersectTo(other, out): boolean`, `remove(): boolean` |

- Use **`-ing`** for configure flags that enable ongoing behavior (`isDetectingDroppedFrames`, not
  `isDetectDroppedFrames`).
- **Hold vs edge on `BT`:** `isDown` / `isKeyDown` (held), `isPressed` / `isReleased` (button masks), `isKeyPressed` /
  `isKeyReleased` (keyboard codes). Internal input classes use the same names (`PointerInput.isButtonDown`,
  `KeyboardInput.isKeyDown`, `GamepadInput.isButtonDown`). Do **not** embed a second `Is` in the identifier
  (`isKeyPressed` — grep: `\bis[A-Za-z]+Is[A-Z]`).
- Identifier acronyms use both capitals: `canvasID`, `containerID` (not `canvasId`).

**File structure and member order:**

Class member order is enforced by `perfectionist/sort-classes` (and import order by `simple-import-sort`); run
`pnpm run lint:fix` to auto-fix. The rule uses `type: 'unsorted'`, so it enforces only the **group order** below and
preserves the hand-tuned order **within** each group (logical method families stay as written). Match this layout when
adding or moving code. **Never use `// #region` / `// #endregion`** — region markers are banned.

- **File layout (top to bottom):** module JSDoc → imports (`import type`, sorted) → leading module members (config/input
  constants, validators, lookup tables, type aliases) → the primary class/interface/function → trailing module members
  (WGSL / template-literal constants such as `FRAGMENT_WGSL`, and pure helper functions placed after the class; exported
  helpers before private ones).
- **Class member order:** (1) static fields (cached singletons, registries); (2) instance fields, public → protected →
  private, `readonly` grouped, one JSDoc + blank line per field; (3) constructor (parameter-properties carry inline
  JSDoc); (4) accessors — static getters, then instance getters/setters; (5) static methods, public before private; (6)
  instance methods, public → protected → private, private helpers last.
- **Cross-cutting:** keep a deprecated alias next to its canonical member (`equals` after `isEqual`); cluster method
  families (new-allocating → `*To` zero-alloc → `*InPlace` → queries → `clone`/`toString`); one blank line between
  members and before `return`; JSDoc on every member including private. See [CLAUDE.md](../CLAUDE.md) (**TypeScript file
  structure**).

---

## IDE Setup

### Recommended extensions

| Extension                   | Purpose                |
| --------------------------- | ---------------------- |
| `dbaeumer.vscode-eslint`    | ESLint integration     |
| `biomejs.biome-vscode`      | Biome formatter        |
| `editorconfig.editorconfig` | EditorConfig support   |
| `ms-playwright.playwright`  | Playwright test runner |
| `vitest.explorer`           | Vitest test explorer   |

`.vscode/settings.json` and `.vscode/extensions.json` are committed to the repository - clone the repo and they appear
automatically in VS Code.

### Settings included

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "typescript.tsdk": "node_modules/typescript/lib",
  "eslint.validate": ["javascript", "typescript"],
  "files.associations": { "*.wgsl": "wgsl" }
}
```

### Cursor

Cursor reads agent policy from this repo's `.cursor/` directory (VS Code/Cursor share the same workspace settings in
`.vscode/`).

| Path                                | Purpose                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `.cursor/rules/*.mdc`               | Agent rules — `alwaysApply: true` for global policy; glob-scoped rules (for example `ts-file-structure.mdc` on `src/**/*.ts`) |
| `.cursor/hooks.json`                | Hooks: `preToolUse` → RTK shell rewrite; `afterFileEdit` → format + spellcheck; `beforeShellExecution` → git safety           |
| `.cursor/hooks/format-and-check.sh` | Post-edit Biome (TS/JS/JSON/CSS) + Prettier (MD/MDX/MDC/YAML) + cspell on touched files                                       |
| `.cursor/hooks/shell-safety.sh`     | Blocks destructive git commands; asks before force-push                                                                       |
| `.claude/rules/*.md`                | Condensed mirrors of key `.cursor/rules` topics for Claude Code                                                               |
| `.claude/skills/*/SKILL.md`         | Reusable command workflows (`bt-preflight`, `bt-format`, …); Zed symlinks under `.agents/skills/`                             |

When changing `package.json` scripts or preflight steps, update matching `.claude/skills/*/SKILL.md` files and any
`.cursor/rules/*.mdc` that reference those commands. Pair `.cursor/rules/*.mdc` edits with `.claude/rules/*.md`
summaries when the topic has a mirror (API getters, internal naming, file structure).

---

## Dependency Management

Renovate is configured (`renovate.json` at the project root). Dependency update PRs open automatically each Monday
before 6 AM:

- Patch updates and GitHub Actions updates: auto-merge after 3 days
- Minor updates: manual review required
- Major updates: manual review with `major-update` label
- Vulnerability alerts are enabled

CI workflows pin third-party actions by commit SHA (not `@vN` tags). See
[dependency-policy.md](security/dependency-policy.md#github-actions-pinning) for bumping SHAs and job permissions.

### Declaration tooling (TypeScript / API Extractor)

Public `.d.ts` output is produced by `vite-plugin-dts` with `rollupTypes: true`, which runs **API Extractor** during
`pnpm run build`. API Extractor currently ships against **TypeScript 5.9.3**, so the workspace pins the same version in
`package.json` (not TypeScript 6.x) to avoid compiler drift warnings and keep declaration analysis deterministic.

When bumping `typescript` or `vite-plugin-dts`, confirm `pnpm run build` logs **no** TS/API Extractor version mismatch
and that `dist/blit386.d.ts` still rolls up cleanly. Re-run `pnpm run typecheck` after any TypeScript line change; TS
5.9 stricter WebGPU typings may require small test/production fixes (for example `ArrayBuffer`-backed uniform buffers).

**CI guard:** the `build-library` job runs `node scripts/check-declaration-tooling.mjs` on the `pnpm run build` log
after each build. It fails on known drift-warning patterns and verifies the API Extractor bundled TypeScript version
matches `package.json`. Locally: `pnpm run build` then `node scripts/check-declaration-tooling.mjs build.log`, or run
`pnpm run test:declarations` for the checker unit tests.

---

## Maintenance Checklist

### Weekly

- [ ] Review and merge Renovate PRs
- [ ] Check open issues and respond
- [ ] Review open PRs
- [ ] Update the project board (if using)

### Monthly

- [ ] Review analytics/usage (if available)
- [ ] Update roadmap
- [ ] Check for security advisories
- [ ] Run MCP governance preflight for `blit386` and `blit386-demos`
      (`pnpm run security:mcp-preflight -- --governance-only`; see
      [docs/security/security-runbook.md](security/security-runbook.md))
- [ ] Review shadow MCP flags and re-auth critical security MCPs if needed
- [ ] Review and close stale issues

### Before Releases

- [ ] Run a full test suite
- [ ] Bump version
- [ ] Test library build
- [ ] Test examples deployment
- [ ] Create a GitHub release with notes
- [ ] Publish `blit386` to npm (`pnpm run release` or `pnpm publish --access public` after `pnpm run build`)
- [ ] Verify package page and install flow: https://www.npmjs.com/package/blit386 and `npm install blit386`

npm **provenance** is not enabled: publishing is local-only today. `pnpm publish --provenance` needs an OIDC-backed CI
publish job; see [dependency-policy.md](security/dependency-policy.md#npm-publish-provenance).

- [ ] Announce on socials/discussions

### Quarterly

- [ ] Review and update documentation
- [ ] Evaluate new WebGPU features
- [ ] Performance benchmarking
- [ ] Dependency audit and cleanup
- [ ] Review contribution guidelines
- [ ] Update examples with new features

---

## Planned Improvements

The following items are tracked in Linear (VV team / BLIT386 project) as low-priority `feat(dx)` tickets:

- GitHub issue templates (`.github/ISSUE_TEMPLATE/`)
- Pull request template (`.github/PULL_REQUEST_TEMPLATE.md`)
- Astro Starlight documentation site
- GitHub repo settings / topics

To file or view these tickets, use Linear with the VV team filter.
