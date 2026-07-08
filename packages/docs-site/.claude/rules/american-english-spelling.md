# American English spelling

Canonical reference: [CLAUDE.md](../../CLAUDE.md) (Content Conventions).

Hand-authored content and source use American English: `color`, `optimization`, `canceled`, `centered`, never the
British equivalents. Exempt: literal third-party/spec-mandated names correctly spelled with a British `s`/`c` (e.g. Web
Audio's `AnalyserNode`/`createAnalyser`) – do not "fix" those.

Generated pages under `content/docs/**` inherit this from the canonical source in `blit386/docs/` – fix upstream and
re-run `pnpm run sync:docs`, never hand-edit the mirror.

Cursor: `.cursor/rules/american-english-spelling.mdc` (always applied in this repo).
