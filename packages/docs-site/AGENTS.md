# Agent Conventions

Guidelines for AI coding agents working in this repository.

## Project overview

This is the documentation website for BLIT386 (`blit386.dev`). Built with Waku + Fumapress + Fumadocs, deployed to
Cloudflare Workers. Content lives in `content/` as MDX files.

## Before making changes

Run `pnpm run preflight` to verify the full check suite passes (format, lint, typecheck, spellcheck, knip, links,
build). Fix any issues before committing.

## Rules

- No emoji anywhere: code, docs, commit messages, log output
- pnpm only (never npm or yarn)
- TypeScript strict, no `any` types
- Conventional Commits: `<type>(<scope>): <description>`
- No hardcoded secrets; use environment variables

## Key files

- `content/` - MDX documentation pages
- `src/` - Waku/React source (minimal; Fumapress handles most layout)
- `press.config.tsx` - Fumapress configuration
- `source.config.ts` - Fumadocs content source
- `waku.config.ts` - Waku framework config
- `.github/markdown-link-check.json` - Link-check ignore patterns

## See also

`CLAUDE.md` for Claude Code-specific conventions.
