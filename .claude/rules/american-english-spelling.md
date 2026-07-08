# American English spelling

Canonical reference: [CLAUDE.md](../../CLAUDE.md) (American English spelling).

When writing or editing prose, JSDoc, or identifiers anywhere in this repo:

- Use American English: `color`, `optimization`, `canceled`, and American-style verbs (`normalize`, `initialize`,
  `serialize`, `recognize`, `organize`, `customize`, `analyze`, ...) – never the British spelling equivalents, `centre`,
  a stray `grey`, `travelling`, or other British spelling variants.
- Exempt: literal third-party or spec-mandated names correctly spelled with a British `s` or `c` in their own spec – Web
  Audio's `AnalyserNode`/`createAnalyser`, and this repo's own `gray`/`grey` named-color alias in `Color32.ts` (mirrors
  the CSS Color Module's own dual spelling). Do not "fix" those.

Cursor: `.cursor/rules/american-english-spelling.mdc` (always applied in this repo).
