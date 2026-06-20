---
name: fp-deep-review
description: Pre-push review with preflight and security audit. Use before merging significant docs or deploy changes.
---

# Deep Review

## Usage

```text
/fp-deep-review
```

## Steps

1. Run `pnpm run preflight`
2. Run `pnpm run security:audit`
3. Summarize: content changes, config/deploy impact, link integrity, ready for PR

No MCP security preflight in this repo (unlike blit386 engine).
