# auth.md

You are an agent. BLIT386 Documentation (`https://blit386.dev/`) is a **public site** — all content is freely accessible
without registration or a token.

## Discovery

- Protected Resource Metadata: `https://blit386.dev/.well-known/oauth-protected-resource`
- Authorization Server Metadata: `https://blit386.dev/.well-known/oauth-authorization-server`

## Access model

This site serves public documentation only. There are no protected API scopes. Agents may read and index all content
without credentials or registration. No claim ceremony or token exchange is needed.

| Property                 | Value                        |
| ------------------------ | ---------------------------- |
| Scopes supported         | none (all content is public) |
| Identity types supported | anonymous                    |
| Bearer method            | header                       |

## Agent catalog

- Agent skills index: `https://blit386.dev/.well-known/agent-skills/blit386-docs/SKILL.md`
- API catalog: `https://blit386.dev/.well-known/api-catalog`
- LLMs index: `https://blit386.dev/llms.txt`
