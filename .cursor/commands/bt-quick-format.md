# Quick Format

Rapidly format all code files using the project's formatters – streamlined version of `/bt-format` that skips
verification steps for maximum speed.

## Usage

```text
/bt-quick-format
```

## Steps

1. Run formatters

- Execute `pnpm run format` (Biome for TS/JS/JSON/JSONC/CSS, Prettier for MD/YAML/Cursor rules – see `/bt-format` for
  the full file-type table)

2. Brief confirmation

- Report completion
- Note any files that couldn't be formatted (usually indicate syntax errors)
