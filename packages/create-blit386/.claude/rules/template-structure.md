# Scaffold template structure

- `templates/base/` – language-agnostic files (HTML, Vite config, README, `.editorconfig`, `biome.json`, `.gitignore`,
  `prettier.config.js`, `.prettierignore`, `scripts/prettier-plugin-compact-tables.mjs`, `public/`). Uses
  `{{entryFile}}` / `{{gameFile}}` placeholders so it stays language-neutral.
- `templates/js/` – JavaScript layer (`package.json.tmpl`, `jsconfig.json`, `src/game.js`).
- `templates/ts/` – TypeScript layer (`package.json.tmpl`, `tsconfig.json`, `src/game.ts`). Same Catcher game logic,
  typed.
- `templates/optional/` – wizard opt-in extras (currently only the GitHub Actions CI workflow). Cursor and Claude
  configs are generated from the kit IR (`packages/kit/src/adapters.ts`) at scaffold time, not copied from static
  templates. That includes the documentation-MCP configs (`.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor) –
  do not add a static template for them.
- Placeholders use `{{name}}` tokens; unknown tokens must stay visible if mis-typed.
- Rename `gitignore` → `.gitignore`, `editorconfig` → `.editorconfig`, and `prettierignore` → `.prettierignore`, and
  strip `.tmpl` extensions, during the scaffold copy (`mapOutputName`).
- Kit content copied verbatim (`AGENTS.md`, `docs/`) gets NO placeholder substitution – only templates, rules, and
  skills pass through `render()`. Prose there must spell out both language cases (`src/game.js` or `src/game.ts`).
- Generated games ship beginner-friendly comments; explain what and why, not just restate code.
- Do not add ESLint, Husky, cspell, or knip to generated projects unless explicitly requested in a future phase.
  Prettier is the one deliberate exception: generated games ship it for Markdown and YAML only (Biome keeps the code),
  because they receive `AGENTS.md` and `docs/` unconditionally, plus `CLAUDE.md` when Claude was the chosen assistant,
  from the kit – and those need the same formatting the kit authored them with. The compact-tables plugin ships
  alongside it so `pnpm run format` in a game does not re-pad the tables in the kit's own docs.
