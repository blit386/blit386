# Contributing to BLIT386

Thank you for your interest in contributing to the BLIT386 project.

## Developer Certificate of Origin (DCO)

This project uses the Developer Certificate of Origin (DCO) to ensure that contributors have the legal right to submit
their contributions. By contributing to this project, you certify that:

1. The contribution was created in whole or in part by you and you have the right to submit it under the project's
   license.
2. The contribution is based upon previous work that is covered under an appropriate license and you have the right to
   submit that work with modifications.
3. The contribution was provided directly to you by some other person who certified (1) or (2) and you have not modified
   it.

### How to Sign Off Your Commits

All commits must include a `Signed-off-by` line at the end of the commit message. This line certifies that you agree to
the DCO.

#### Using the `-s` flag

The easiest way to sign off your commits is to use the `-s` or `--signoff` flag:

```bash
git commit -s -m "feat(renderer): add circle primitive drawing"
```

This will automatically add the following line to your commit message:

```text
Signed-off-by: Your Name <your.email@example.com>
```

#### Amending an Existing Commit

If you forgot to sign off a commit, you can amend it:

```bash
git commit --amend --signoff
```

Then force push (with lease for safety):

```bash
git push --force-with-lease
```

#### Signing Off Multiple Commits

To sign off all commits in a branch:

```bash
git rebase --signoff origin/main
git push --force-with-lease
```

### Automated DCO Check

All pull requests are automatically checked for DCO compliance via GitHub Actions. If any commit is missing the
sign-off, the check will fail and you'll need to add it before the PR can be merged.

## Commit Message Format

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. All commit messages
must be formatted as:

```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]

Signed-off-by: Your Name <your.email@example.com>
```

### Commit Types

- `feat` – New feature
- `fix` – Bug fix
- `docs` – Documentation only
- `style` – Formatting, no code change
- `refactor` – Code change that neither fixes a bug nor adds a feature
- `perf` – Performance improvement
- `test` – Adding or updating tests
- `build` – Build system or dependencies
- `ci` – CI configuration
- `chore` – Other changes
- `revert` – Revert a previous commit

Suggested scopes are conventions only – commitlint does not enforce a scope enum.

### Suggested Scopes

- `renderer` – Rendering system
- `camera` – Camera system
- `assets` – Asset loading
- `api` – Public API (BT namespace)
- `utils` – Utility classes
- `examples` – Example projects
- `ci` – CI/CD configuration
- `docs` – Documentation

### Example Commits

```bash
feat(renderer): add circle primitive drawing

Signed-off-by: John Doe <john@example.com>
```

```bash
fix(assets): handle missing texture gracefully

The asset loader now provides a fallback when texture loading fails.

Signed-off-by: Jane Smith <jane@example.com>
```

```bash
docs: update API reference section

Signed-off-by: John Doe <john@example.com>
```

## Code Style

All code must follow the project's style guidelines:

- No emoji anywhere in code, comments, or documentation
- TypeScript strict mode – All code must pass strict TypeScript checks
- Formatting – Code is automatically formatted by Biome and Prettier
- Linting – Code must pass all linting checks
- JSDoc – Required for public APIs

### Development environment

- Node.js >=22.18.0 (`engines` in `package.json`)
- pnpm 10.26.2+ (`packageManager` in `package.json`)

### Pre-commit Checks

Before committing, run the preflight checks (requires the Node.js version above):

```bash
pnpm run preflight
```

This runs:

- Code formatting checks (`format:check`)
- Linting
- TypeScript type checks
- Spell checking
- Unused export and dependency checks (knip)
- Markdown link check (`docs:links`)
- Agent config drift check (`agents:check`)
- Doc site banner check (`sync:doc-banners:check`)
- Cursor commands drift check (`sync:cursor-commands:check`)
- API `@since` tag check (`api:since:check`)
- API history manifest check (`api:history:check`)
- Unit tests (`test:unit`)
- Declaration tooling tests (`test:declarations`)
- Agent config drift checker tests (`test:agent-config`)
- Cursor commands drift checker tests (`test:cursor-commands`)

### Available Commands

```bash
pnpm run build            # Build for production
pnpm run lint             # Lint code
pnpm run lint:fix         # Fix linting issues
pnpm run format           # Format code
pnpm run format:check     # Check formatting
pnpm run typecheck        # Run TypeScript checks
pnpm run spellcheck       # Check spelling
pnpm run knip             # Find unused exports and dependencies
pnpm run docs:links       # Check Markdown links
pnpm run agents:check     # Check agent config drift (rules parity, skills symlinks, AGENTS.md pointer)
pnpm run sync:cursor-commands       # Generate .cursor/commands/*.md from .claude/skills/*/SKILL.md
pnpm run sync:cursor-commands:check # Check cursor commands drift
pnpm run test:unit        # Run unit tests
pnpm run test:declarations # Declaration tooling checker tests
pnpm run test:agent-config # Agent config drift checker tests
pnpm run test:cursor-commands # Cursor commands drift checker tests
pnpm run test:visual      # Playwright visual regression (local; not in preflight)
pnpm run bench            # CPU benchmarks (Vitest bench)
pnpm run preflight        # Run all quality checks
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Ensure all commits are signed off (DCO)
5. Follow the commit message format
6. Run `pnpm run preflight` to ensure code quality
7. Push to your fork
8. Open a pull request against `main`

All pull requests will be reviewed by maintainers. The DCO check and other CI checks must pass before a PR can be
merged.

## AI-Assisted Contributions

If you use AI tools (like GitHub Copilot, ChatGPT, or Claude) to help write code, please include the AI trailer in your
commit message:

```text
feat(renderer): add sprite batching optimization

Signed-off-by: Your Name <your.email@example.com>
Co-Authored-By: Claude <noreply@anthropic.com>
```

Or for GitHub Copilot:

```text
Co-Authored-By: GitHub Copilot <noreply@github.com>
```

## License

By contributing to this project, you agree that your contributions will be licensed under the same license as the
project.

## Questions?

If you have questions about the DCO or contributing process, please open an issue on GitHub.

## Full Developer Certificate of Origin Text

```text
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```
