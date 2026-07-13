# Scaffold template structure

Condensed mirror of `.cursor/rules/template-structure.mdc`.

- `templates/base/` – language-agnostic files (HTML, Vite config, README, `.editorconfig`, `biome.json`, `.gitignore`,
  `public/`). Uses `{{entryFile}}` / `{{gameFile}}` placeholders so it stays language-neutral.
- `templates/js/` – JavaScript layer (`package.json.tmpl`, `jsconfig.json`, `src/game.js`).
- `templates/ts/` – TypeScript layer (`package.json.tmpl`, `tsconfig.json`, `src/game.ts`). Same Catcher game logic,
  typed.
- `templates/optional/` – wizard opt-in extras (currently only the GitHub Actions CI workflow). Cursor and Claude
  configs are generated from the kit IR (`packages/kit/src/adapters.ts`) at scaffold time, not copied from static
  templates.
- Placeholders use `{{name}}` tokens; unknown tokens must stay visible if mis-typed.
- Rename `gitignore` → `.gitignore` and `editorconfig` → `.editorconfig`, and strip `.tmpl` extensions, during the
  scaffold copy (`mapOutputName`).
- Kit content copied verbatim (`AGENTS.md`, `docs/`) gets NO placeholder substitution – only templates, rules, and
  skills pass through `render()`. Prose there must spell out both language cases (`src/game.js` or `src/game.ts`).
- Generated games ship beginner-friendly comments; explain what and why, not just restate code.
- Do not add ESLint, Husky, cspell, or knip to generated projects unless explicitly requested in a future phase.
