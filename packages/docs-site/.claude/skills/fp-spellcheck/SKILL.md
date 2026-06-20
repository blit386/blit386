---
name: fp-spellcheck
description: Run cspell, fix typos, and extend cspell.json for legitimate technical terms.
---

# Spellcheck

## Usage

```text
/fp-spellcheck
```

## Steps

1. Run `pnpm run spellcheck`
2. Fix typos in source; add domain terms to `cspell.json` `words` array (fumapress, fumadocs, blit386, webgpu, …)
3. Re-run until clean
