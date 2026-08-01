---
name: quick-format
description:
  Quickly format code with Biome and Prettier, skipping the format:check verification step. Use for a fast cleanup right
  after edits, or as a lightweight pre-step before other checks, when you don't need confirmation that formatting
  actually passed. If the result needs to be verified (before a commit or PR), use format instead. Takes a package
  argument (blit386, demos, website, kit, create-blit386, or root).
---

# Quick Format

Rapidly format code files using the project's formatters – a streamlined version of `/format` that skips verification
for maximum speed.

## Usage

```text
/quick-format <package>
```

Where `<package>` is one of `blit386`, `demos`, `website`, `kit`, `create-blit386`, or `root`. Omit the argument to
format the whole repo tree from root.

## Steps

1. Run formatters

- Whole repo (no argument, or `root`): `pnpm run format` from the repository root.
- A single package: `pnpm --filter <name> run format`, or `cd packages/<dir> && pnpm run format` – see `/format` for the
  full file-type table and the `kit` / `create-blit386` root-coverage note.

2. Brief confirmation

- Report completion
- Note any files that couldn't be formatted (usually indicates syntax errors)

## When to use

- Quick cleanup after manual edits
- Before running other checks
- When you know you just need formatting (not verification)
- To fix formatting issues reported by CI or hooks
