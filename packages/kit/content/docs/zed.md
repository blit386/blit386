# Zed

`.zed/settings.json` turns on format on save, formats JavaScript, TypeScript, and JSON with Biome, and points Zed at the
`blit386-docs` documentation server. Zed reads `AGENTS.md` and the skills in `.agents/skills/` on its own. To use it:

- Trust the project when Zed asks (Restricted Mode). Until you do, Zed ignores everything in `.zed/`.
- Install the Biome extension (`zed: extensions`, search for Biome), or the formatter setting has nothing to run.

## Safety rules for Zed's agent

Zed cannot take safety rules from project files, so the hard rules in `AGENTS.md` are all its agent has, and they are
only instructions. To have Zed enforce them, paste this into your own settings (`zed: open settings`), not the
project's. It denies Zed's direct edit and write tool calls on lock files and `.env` files (but not `.env.example`),
plus the destructive git commands (`git reset --hard`, a `git checkout` onto files, a forced `git checkout` or
`git switch`, `git restore`, `git clean`, `git checkout-index -f`, `git read-tree --reset`, force push, a push that
deletes remote branches or mirrors, `git branch -D`, `git stash drop` or `clear`, and a git alias or push setting given
with `-c` for one command). It does not stop the agent from changing those files through a terminal command, so keep
terminal approval on if you need that boundary:

```json
{
  "agent": {
    "tool_permissions": {
      "tools": {
        "edit_file": {
          "always_deny": [
            { "pattern": "(^|/)(package-lock\\.json|pnpm-lock\\.yaml|bun\\.lockb)$|\\.lock$" },
            { "pattern": "(^|/)\\.env(\\.(local|development|production|test))?(\\.local)?$" }
          ]
        },
        "write_file": {
          "always_deny": [
            { "pattern": "(^|/)(package-lock\\.json|pnpm-lock\\.yaml|bun\\.lockb)$|\\.lock$" },
            { "pattern": "(^|/)\\.env(\\.(local|development|production|test))?(\\.local)?$" }
          ]
        },
        "terminal": {
          "always_deny": [
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+reset\\s+([^\\s;&|<>]+\\s+)*--h(a(rd?)?)?([^A-Za-z-]|$)"
            },
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+checkout\\s+([^\\s;&|<>]+\\s+)*(--|\\.)(\\s|[;&|<>)`]|$)"
            },
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+(checkout|switch)\\s+([^\\s;&|<>]+\\s+)*(-[a-zA-Z]*f[a-zA-Z]*|--f(o(r(ce?)?)?)?|--di(s(c(a(r(d(-(c(h(a(n(g(es?)?)?)?)?)?)?)?)?)?)?)?)?)(\\s|[;&|<>)`]|$)"
            },
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+checkout\\s+([^\\s;&|<>]+\\s+)*(-[a-zA-Z0-9]*[23p][a-zA-Z0-9]*|--ou(rs?)?|--th(e(i(rs?)?)?)?|--no-over(l(ay?)?)|--pathspec-f[^\\s;&|<>]*|--patch?)(\\s|[;&|<>)`]|$)"
            },
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+checkout(\\s+[^\\s;&|<>]+)*\\s+[^\\s;&|<>]*(\\.[A-Za-z][A-Za-z0-9]*['\"]?|/['\"]?|[*?\\[][^\\s;&|<>]*)(\\s|[;&|<>)`]|$)"
            },
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+restore\\b"
            },
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+clean\\b"
            },
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+push(\\s+[^\\s;&|<>]+)*\\s+(-[a-zA-Z]*[fd][a-zA-Z]*|--force[^\\s;&|<>]*|\\+[^\\s;&|<>]+|--de(l(e(te?)?)?)?|--mi(r(r(or?)?)?)?|:[^\\s;&|<>]+)(\\s|[;&|<>)`]|$)"
            },
            {
              "pattern": "[Gg][Ii][Tt](\\.[Ee][Xx][Ee])?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+branch(\\s+[^\\s;&|<>]+)*\\s+(-[a-zA-Z0-9]*D[a-zA-Z0-9]*|-[a-zA-Z0-9]*(d[a-zA-Z0-9]*f|f[a-zA-Z0-9]*d)[a-zA-Z0-9]*|(-[a-zA-Z0-9]*d[a-zA-Z0-9]*|--d(e(l(e(te?)?)?)?)?)(\\s+[^\\s;&|<>]+)*\\s+(-[a-zA-Z0-9]*f[a-zA-Z0-9]*|--force?)|(-[a-zA-Z0-9]*f[a-zA-Z0-9]*|--force?)(\\s+[^\\s;&|<>]+)*\\s+(-[a-zA-Z0-9]*d[a-zA-Z0-9]*|--d(e(l(e(te?)?)?)?)?))(\\s|[;&|<>)`]|$)",
              "case_sensitive": true
            },
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+stash\\s+(drop|clear)(\\s|[;&|<>)`]|$)"
            },
            {
              "pattern": "git(\\.exe)?(\\s+-\\S+)*(\\s+(-[Cc]|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source))(\\s+\\S+)*)?\\s+(checkout-index(\\s+[^\\s;&|<>]+)*\\s+(-[a-zA-Z0-9]*f[a-zA-Z0-9]*|--f(o(r(ce?)?)?)?)|read-tree(\\s+[^\\s;&|<>]+)*\\s+--res(et?)?)(\\s|[;&|<>)`]|$)"
            },
            {
              "pattern": "git(\\.exe)?(\\s+\\S+)*\\s+(-c|--config-env)(\\s+|=)(alias\\.|remote\\.\\S*\\.(push|mirror)(=|\\s|$))"
            }
          ]
        }
      }
    }
  }
}
```

Zed's regex has no lookahead, so the `.env` pattern lists the usual names; add yours (say `.env.staging`) if you have
others. For the same reason the git patterns are blunter than the hooks other assistants get: every `git restore` is
denied, including `git restore --staged`, and so is every `git clean`, including the `-n` dry run. The snippet only
denies, so a force push (`-f`, `--force-with-lease`, or a `+` refspec), a remote branch delete or mirror push, a forced
branch delete, and a stash drop or clear are refused outright where the other hooks ask you first. Zed removes quotes
before it matches, so after `-C`, `-c`, or `--git-dir` the snippet cannot tell where the value ends and reads every
later word as a possible command: `git -C game commit -m "clean up"` is refused too. Run
`cd game && git commit -m "clean up"` instead. Zed's "Test Your Rules" checker (agent settings, Tool Permissions) shows
what a pattern matches.
