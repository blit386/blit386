# Docs authoring

Condensed mirror of `.cursor/rules/docs-authoring.mdc`. How to write, rename, and split published `docs/*.md` pages
(those listed in `docs/_sitemap.json`).

## Public docs site banner

Every published doc carries a short banner below its H1, wrapped in `<!-- blit386.dev-banner:start -->` /
`<!-- blit386.dev-banner:end -->` sentinels, pointing GitHub readers at the typeset copy on blit386.dev.

- Never hand-edit or hand-add the banner block. It is generated and owned entirely by `scripts/sync-doc-banners.mjs`,
  which derives each `https://blit386.dev/docs/<path>` URL from the sitemap.
- Run `pnpm run sync:doc-banners` after adding a doc to the sitemap or changing a doc's `path`.
  `pnpm run sync:doc-banners:check` reports drift without writing (CI).
- The public mirror generator (`blit386-dev-fumapress`) strips the whole block, so it never appears on the live site.
  Edit banner prose in the script's template, not the docs.

## Fumadocs components in published docs

Published docs are MDX-capable Markdown: Fumadocs/Fumapress components render directly in `.md` source on the live site
(they degrade to plain text or vanish on GitHub, which is why the banner exists). Contributor-only docs
(`developer-experience-guide.md`, `voice.md`, `tooling.md`, `security/*`) stay plain Markdown.

Registered components (`blit386-dev-fumapress/press.config.tsx`, `getMdxComponents`): `Callout`, `Card` / `Cards`,
`Tabs` / `Tab`, `Steps` / `Step`, `Accordion` / `Accordions`, `Files` / `File` / `Folder`, `TypeTable`, `GithubInfo`,
`InlineTOC`. A component not in that map fails the mirror build.

When to use which:

- `Callout` – notes, tips, warnings, gotchas. Replaces `> Note:` blockquotes.
- `TypeTable` – option/field/parameter reference tables (name, type, default, description).
- `Steps` – sequential procedures, one `### heading` per step.
- `Tabs` – genuine alternatives (per-OS commands, npm/pnpm, preferred-vs-manual).
- `Accordions` – collapsible advanced detail or troubleshooting.
- `Cards` – the trailing See Also section.
- `Files` – directory trees with no per-file comment (keep comment-annotated trees as fenced ` ```text ` blocks).
- No manual or `InlineTOC` table of contents – the site renders its own.

Authoring rules:

- Block form only – blank lines around component children. Inline children get reflowed by Prettier into a less-readable
  single line.
- JSX expression props (`TypeTable type={{ ... }}`) work; the mirror leaves braces verbatim inside component blocks.
- `Card href` is a JSX prop the mirror does not rewrite – use site-absolute `/docs/<section>/<topic>` paths, not
  relative `*.md` links. Unpublished docs link to the full GitHub URL instead.
- Validate: in `blit386-dev-fumapress`, run `pnpm run sync:docs` then `pnpm run build` (or `pnpm run typecheck`).

## Documentation authoring style (prose)

- No bold (`**`) in prose – lead with a strong sentence or promote a recurring label to a real `###` subsection. A `**`
  inside inline code or a fenced block (a glob, a JSDoc opener) is not bold; leave it.
- No `---` horizontal-rule separators – let headings separate sections.
- Dimensions use `×`, not `x`: `320×240`, `6×14`. Exception: literal program output quoted verbatim (the overlay's
  on-screen `webgpu | 320x240`).
- No walls of text – short paragraphs, bullet lists, `###` subsections, or `Callout`s. Every `###` needs a parent `##`.
- Credit external inspirations with a link and the author's name.
- American English spelling (see `.claude/rules/american-english-spelling.md`).

Filenames mirror the sitemap section: `api/<topic>` -> `api-<topic>.md`; `guides/<topic>` -> `guide-<topic>.md`;
`performance/<topic>` -> `performance-<topic>.md`; `reference/<topic>` -> `reference-<topic>.md`.

Renaming or splitting a published doc:

1. `git mv` the file (plain `mv` if untracked).
2. Update its `src` in `docs/_sitemap.json`. Keep `path` stable unless the topic itself changed.
3. Rewrite every inbound link, guarding substring matches with a `(?<![\w-])` lookbehind or equivalent so a compound
   name is not hit by accident (renaming `overlay.md` must not touch `api-overlay.md`).
4. When splitting, keep in the original file any anchor other docs link to; move the rest. Add a `See also` `Cards`
   block to each new page.
5. Run `pnpm run sync:doc-banners`, then `pnpm run docs:links`, then `pnpm run format` (longer filenames shift Markdown
   table padding).

After any doc change: add new proper nouns / coined words to `cspell.json` (and the fumapress one for hand-authored
content there); re-sync the mirror (`pnpm run sync:docs` in `blit386-dev-fumapress`) if a sitemap entry changed.

Cursor: `.cursor/rules/docs-authoring.mdc` (glob-scoped to `docs/**/*.md` in this repo).
