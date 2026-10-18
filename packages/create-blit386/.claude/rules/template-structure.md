# Scaffold template structure

- `templates/base/` - language-agnostic files (HTML, Vite config, README, `.editorconfig`, `.gitattributes`,
  `.node-version`, `biome.json`, `.gitignore`, `prettier.config.js`, `.prettierignore`,
  `scripts/prettier-plugin-compact-tables.mjs`, `public/`). Uses `{{entryFile}}` / `{{gameFile}}` placeholders so it
  stays language-neutral.
- `.gitattributes` forces LF checkouts because `biome.json` enforces `lineEnding: "lf"`; without it, Git for Windows
  (`core.autocrlf=true` by default) checks out CRLF and `format:check` fails. `.node-version` is the one Node pin a game
  has: version managers (fnm, mise, nodenv) read it locally, and the optional CI workflow reads it via
  `node-version-file`.
- `templates/js/` - JavaScript layer (`package.json.tmpl`, `jsconfig.json`, `src/game.js`).
- `templates/ts/` - TypeScript layer (`package.json.tmpl`, `tsconfig.json`, `src/game.ts`). Same Catcher game logic,
  typed.
- The starter game (`src/game.*`) is the Catcher example and carries the `testState()` hook (engine 1.8.0+) plus a
  dev-only `window.__game` whose `state()` delegates to it - the kit's `test-the-game` skill reads both. The kit's
  `content/templates/game.{js,ts}` are a different file on purpose: the empty skeleton `blit clean` writes over a game,
  not a copy of the starter. Keep their header comments (the method list, the optional hooks) saying the same thing.
- `templates/optional/` - wizard opt-in extras (currently only the GitHub Actions CI workflow). The workflow is
  package-manager-agnostic: it runs `{{pmCiPrepare}}` (`corepack enable`, which reads the generated `packageManager`
  field for pnpm and yarn - it does not shim npm, so an npm game's CI uses the npm that ships with Node;
  `npm install --global bun` for Bun, which Corepack does not manage), then `{{pmCiInstall}}` (a lockfile-strict install
  from `PmHints.ciInstallCmd`), `{{pmRunFormat}}:check`, and `{{pmRunBuild}}` - never a second pnpm/npm version pin,
  which `pnpm/action-setup` rejects when it disagrees with `packageManager`. The kit's Copilot setup workflow is
  generated in code per manager. Every AI assistant's config is generated from the kit IR
  (`packages/kit/src/adapters.ts`) at scaffold time, not copied from static templates. That includes the
  documentation-MCP configs (`.mcp.json`, `.cursor/mcp.json`, ...) and Copilot's
  `.github/workflows/copilot-setup-steps.yml` - do not add a static template for them. That workflow copies the action
  pins of `templates/optional/ci/github/workflows/ci.yml` (`ACTIONS_CHECKOUT` / `ACTIONS_SETUP_NODE` in the kit's
  `src/adapters.ts`); bump both together - `test/agent-copilot.test.mjs` fails when they drift.
- `biome.json` lists `!.blit` in `files.includes` and `.prettierignore` lists `.blit/`: the pristine kit copies under
  `.blit/base/` must never be reformatted, or `blit agents sync` reports edits the user did not make (root `CLAUDE.md`).
- Placeholders use `{{name}}` tokens; unknown tokens must stay visible if mis-typed.
- Rename `gitignore` → `.gitignore`, `editorconfig` → `.editorconfig`, `gitattributes` → `.gitattributes`,
  `node-version` → `.node-version`, and `prettierignore` → `.prettierignore`, and strip `.tmpl` extensions, during the
  scaffold copy (`mapOutputName`).
- Kit content copied verbatim (`AGENTS.md`, `docs/`) gets NO placeholder substitution - only templates, rules, and
  skills pass through `render()`. Prose there must spell out both language cases (`src/game.js` or `src/game.ts`).
- Generated games ship beginner-friendly comments; explain what and why, not just restate code.
- Do not add ESLint, Husky, cspell, or knip to generated projects unless explicitly requested in a future phase.
  Prettier is the one deliberate exception: generated games ship it for Markdown and YAML only (Biome keeps the code),
  because they receive `AGENTS.md` and `docs/` unconditionally, plus `CLAUDE.md` when Claude was the chosen assistant,
  from the kit - and those need the same formatting the kit authored them with. The compact-tables plugin ships
  alongside it so `pnpm run format` in a game does not re-pad the tables in the kit's own docs.
