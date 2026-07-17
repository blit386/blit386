# Docs sync required

Canonical reference: [CLAUDE.md](../../CLAUDE.md); Cursor: `.cursor/rules/docs-sync-required.mdc`.

Documentation is part of the implementation, not a separate cleanup step.

- When demo behavior changes, update affected docs in `docs/` and demo descriptions in `README.md` when relevant.
- When demo development workflow changes (commands, setup, CI expectations), update matching docs in the same change.
- When project conventions or structure expectations change, update `CLAUDE.md` sections accordingly.
- If no docs update is needed, state why explicitly in the final response.
