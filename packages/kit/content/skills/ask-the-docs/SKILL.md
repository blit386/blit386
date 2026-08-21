---
name: ask-the-docs
description:
  Look up BLIT386 detail the project's own files do not cover, using the live documentation at blit386.dev – the
  blit386-docs MCP server, the llms.txt summary, or a doc page fetched as markdown. Use whenever AGENTS.md and the local
  docs/ folder do not answer the question, an engine API or option is unfamiliar, or the user asks about something newer
  than this game's BLIT386 version.
---

# Ask the docs

Look up BLIT386 detail the project's own files do not cover, using the live documentation at blit386.dev.

## When to use

Use when `AGENTS.md` and the `docs/` folder do not answer the question – an API you cannot find, an option that is not
listed, or something added to the engine after this game was created.

## Read the local docs first

The guides in `docs/` are already on disk, cost nothing to open, and describe the BLIT386 version this game actually
pins in `package.json`. `AGENTS.md` has a table telling you which one to open. Go to the network only after that table
comes up empty.

## Three ways to reach the live docs

### 1. The blit386-docs MCP server

This project ships its configuration, so your assistant should already have it. Two tools:

- `search_docs` – full-text search across the whole documentation site. Give it a short query such as
  `palette animation` or `gamepad deadzone`. It returns page titles, URLs, and excerpts.
- `get_docs_summary` – the whole site's contents in one compact block. Reach for this when you do not yet know what to
  search for.

In Claude Code the server is configured in `.mcp.json`, and Claude Code asks once whether to allow it – saying yes is
what turns this on. In Cursor it is configured in `.cursor/mcp.json`.

### 2. The plain-text summary

Fetch https://blit386.dev/llms.txt for the same site summary as one plain text file. This is the fallback when the MCP
server is not available. Find the page you need in it, then fetch that page.

### 3. Any doc page as markdown

Request a page URL with the header `Accept: text/markdown` and the site returns markdown instead of HTML – no
navigation, no menus, far less to read:

```bash
curl -sH 'Accept: text/markdown' https://blit386.dev/docs
```

## Notes

- The live site documents the newest BLIT386. This game pins a version in `package.json`, so something you find there
  may not exist here yet. Check the pinned version before using an API the local docs never mention, and run
  `npx blit doctor` if you are unsure what is installed.
- The docs server is read-only. It searches and returns documentation; it cannot change anything in your game.
- The source code lives at https://github.com/blit386/blit386. Go there only when the documentation itself does not
  answer the question.
- Found something the local docs do not cover? Write it into the "Your notes" section of `AGENTS.md` so nobody has to
  look it up twice.
