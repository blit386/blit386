# blit386-website (docs site)

Documentation site for [blit386.dev](https://blit386.dev): Fumapress 0.7.x on Waku (React 19 RSC), MDX via Fumadocs MDX,
Tailwind v4, TypeScript strict, deployed to Cloudflare Workers with Wrangler. Biome owns `.ts` / `.tsx` / `.json` /
`.css`, Prettier owns `.md` / `.mdx` / YAML, and there is no ESLint here.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) – read together with this file.

Scripts are `pnpm run <script>` from this package's directory (or `pnpm --filter blit386-website run <script>` from the
repo root); `package.json` is the list and `pnpm run preflight` is the gating set (it includes the build and, last of
all, the docs-mirror check – see Documentation mirror). Production builds require `CLOUDFLARE=1`, which `pnpm run build`
already sets; `WORKERS_CI` works too, and `BLIT386_TWOSLASH` overrides either (see Twoslash). Shell commands are
rewritten by `rtk hook claude` – prefer `rtk read` / `rtk grep` over native Read/Grep for exploration.

## Critical Rules

1. Public engine docs are generated, not authored here. Edit the canonical copy in `packages/blit386/docs/`, then run
   `pnpm run sync:docs`. Never hand-edit anything under `content/docs/{api,guides,performance,reference}/` or
   `src/data/api-history.generated.json`
2. Documentation ships with the change – update `content/` and run `pnpm run docs:links` from the repo root when adding
   links. `docs:links` is a root-only script (it enumerates every tracked `*.md` / `*.mdx` file via `git ls-files`
   regardless of cwd); this package no longer carries its own copy
3. No MDX comments. Prettier formats `.mdx` with the Markdown parser, so remark reads `{/* … */}` as emphasis and
   rewrites it to `{/_ … _/}`, which renders as visible italic text on the page. Delete the note or make it real prose
4. Conventional Commits with DCO sign-off (`git commit -s`). Scopes: `content`, `ci`, `docs`, `deps`, `config`. `main`
   is protected – land changes via PR
5. Every `git` subprocess spawned from `scripts/` passes `env: gitEnv()` ([`scripts/git-env.mjs`](scripts/git-env.mjs)).
   These scripts run under `.husky/pre-push`, which exports `GIT_DIR` into every child; it outranks `cwd` and `-C`, so
   an unguarded `git init` in a fixture repo re-initializes the real one and writes `bare = true` into the shared
   `.git/config`, breaking git in the main checkout and every worktree. `scripts/__tests__/git-env.test.mjs` guards it

## Where to Find Information

| Question | Where to look |
| --- | --- |
| Site and plugin config, layouts, global head, MDX component map | `press.config.tsx` |
| MDX collection config, Twoslash wiring | `source.config.ts` |
| Twoslash gate, compiler options | `scripts/twoslash-config.mjs` |
| Waku / Vite plugins | `waku.config.ts` |
| Generated MDX loader | `.source/` (gitignored; run `fumadocs-mdx` or `pnpm run typecheck`) |
| Engine API truth | `packages/blit386/docs/` in this monorepo – never this package |
| How the mirror is built | `scripts/sync-docs-from-engine.mjs` via `pnpm run sync:docs` |
| How mirror drift is checked | `scripts/check-docs-sync.mjs` via `pnpm run sync:docs:check` (in `preflight` and in CI) |
| Script test coverage | `scripts/__tests__/*.test.mjs` (`node --test`, via `pnpm run test:scripts`) |
| Worker plugin test coverage | `src/**/*.test.ts` (Vitest, via `pnpm run test:unit`) – see Test runners |
| Why every git subprocess passes `gitEnv()` | `scripts/git-env.mjs` |
| MCP server | `src/mcp-server.ts`, `public/.well-known/mcp/server-card.json`, `content/mcp-server.mdx` |
| Cloudflare security headers | `public/_headers` |
| The CSP itself, and the nonce that replaces `'unsafe-inline'` | `src/csp.ts`, `src/csp-nonce.ts` – see Content-Security-Policy |

Five Fumapress `ServerPlugin`s are local to this package rather than upstream: `cspNoncePlugin` (`src/csp-nonce.ts`),
`channelHeadersPlugin` (`src/channel-headers.ts`), `markdownNegotiationPlugin` (`src/markdown-negotiation.ts`),
`mcpServerPlugin` (`src/mcp-server.ts`), and `feedPlugin` (`src/feed.ts`) – plus the `blog-post-date` helper
(`src/blog-post-date.ts`, which exists because the framework's adapter cannot read a post's `date` frontmatter). The
rest of the chain in `press.config.tsx` is stock: flexsearch, blog, llms, sitemap, takumi OG images, and link
validation.

## Content-Security-Policy

`script-src` carries no `'unsafe-inline'` (BT-191). Inline scripts are allowed by a per-request nonce instead, which
takes three pieces:

| Piece | Role |
| --- | --- |
| `src/csp.ts` | The policy, defined once. `BASE_CSP` is the nonce-free form; `buildCsp(nonce)` adds the nonce to `script-src` |
| `public/_headers` | Serves `BASE_CSP` on every response Cloudflare returns from the ASSETS binding. Fail-closed default |
| `src/csp-nonce.ts` | Stamps a fresh nonce onto every `<script>` in a prerendered HTML response and replaces the header with `buildCsp(nonce)` |

A nonce rather than hashes because the site renders statically (`mode: 'static'`): Waku's React bootstrap script and the
RSC flight payload `rsc-html-stream` injects are both per-page, so no fixed hash list covers them, and Waku's
`unstable_setNonce` only applies to request-time SSR. That leaves the Worker as the only place a nonce can be applied,
via `HTMLRewriter`.

Four things about this are load-bearing and easy to undo by accident:

- **`public/_headers` duplicates `BASE_CSP` by hand** – a static Cloudflare config cannot import. `src/csp.test.ts`
  compares the two character for character and fails if either is edited alone. Change the policy in `src/csp.ts` first,
  then copy the new line across.
- **`cspNoncePlugin` wraps the server entry's `fetch`, not a middleware.** A Fumapress `ServerPlugin` middleware never
  sees the response it would need to rewrite: Fumapress's own composer (`fumapress/dist/router/index.js`,
  `pluginsMiddleware`) keeps a downstream handler's returned `Response` in a local and returns it at the end, never
  assigning `c.res`. After `await next()`, `c.res` is still Hono's placeholder, and only its _headers_ reach the real
  response – merged in by Hono's `set res`. That is enough for `channelHeadersPlugin`'s `x-robots-tag`, and not enough
  to stamp a body.
- **The wrapper strips `etag` and `last-modified` from HTML, and `markdownNegotiationPlugin` strips `if-none-match` /
  `if-modified-since` on the way in.** Both halves are needed. A `304` for HTML is unanswerable once nonces exist: the
  client merges the `304`'s headers into its _stored_ body, so a fresh nonce lands on scripts carrying an older one and
  the whole page is blocked. Dropping the validators stops new copies from being revalidatable; dropping the
  conditionals stops copies cached before this shipped from getting a `304` today. `isHtmlAssetPath` in `src/csp.ts`
  decides which paths pay for it – hashed JS, CSS, and fonts keep their `304`s.
- **The rewriting needs a real parser.** `<script` occurs inside the RSC flight payload as ordinary JSON string data, so
  a string replace corrupts pages. `HTMLRewriter` is a correctness requirement, not a convenience.

Rolling out a policy change: build with `BLIT386_CSP_REPORT_ONLY=1` (picked up by `scripts/patch-wrangler.mjs` as a
Worker var, the same mechanism as `BLIT386_CHANNEL`) and deploy to the `next` channel. That serves the new policy as
`Content-Security-Policy-Report-Only` and enforces nothing, so violations show up in the console without a blank page.
Never set it for production. The var is not wired into `.github/workflows/deploy.yml`, so this is a local build plus
`pnpm run deploy` today.

Verify a deployment with `curl -s -D - -o /dev/null <url> | grep -i content-security-policy`: the value must contain a
`nonce-` term, and a second request must return a different one. It has to be a GET – `curl -I` sends `HEAD`, which has
no body to stamp and correctly gets the nonce-free `BASE_CSP`.

`style-src` still has `'unsafe-inline'` – Fumadocs and Tailwind both emit inline styles, and removing it was out of
scope for BT-191.

## Test runners

Two, deliberately, matching the split `packages/blit386` already runs:

| Suite | Runner | Script | Covers |
| --- | --- | --- | --- |
| `scripts/__tests__/*.test.mjs` | `node --test` | `test:scripts` | The build and sync scripts |
| `src/**/*.test.ts` | Vitest | `test:unit` | The `ServerPlugin`s that run in the deployed Worker, plus `public/webmcp.js` |

`pnpm run test` runs both, the second with coverage; `preflight` and the `quality-website` CI job call it, so neither
needs its own wiring. The `scripts/**` suite stays on `node --test` because it is `node:assert` throughout, it finishes
in under a second, and rewriting it would be churn with no gain.

**Vitest, not `@cloudflare/vitest-pool-workers`.** The pool runs tests inside `workerd`, which would exercise the
`ASSETS` binding and `c.env` against the real runtime instead of a double, and it is version-compatible (it peers
`vitest ^4.1.0`, the same major this workspace resolves). It was still the wrong trade here:

- The contract with `ASSETS` is one method and one status check – `assets.fetch(request)`, then `status !== 404`. A
  double is faithful to that. `run_worker_first` is Wrangler configuration rather than code, and
  `scripts/__tests__/patch-wrangler.test.mjs` already asserts it.
- A real binding needs `assets.directory` pointing at `dist/public`, which exists only after a full build – and
  `preflight` runs `test` before `build`. A fixture directory avoids that at the cost of a second, test-only Wrangler
  config to keep in step with the real one.
- It would weaken the `channel-headers` test. `workerd` has no populated `process.env`, so a `process.env`
  implementation would fail there for the wrong reason. Under Node the test can point `process.env.BLIT386_CHANNEL` at
  the opposite value from `c.env` and assert the binding still wins – which no `process.env` implementation can pass.

Accepted gap: nothing here exercises `workerd`'s response-header mutability. BT-464 asked whether that gap hid a bug –
`channel-headers.ts` mutates the `ASSETS` response in place, which the fetch spec forbids – and the answer was no:
workerd does not enforce the `immutable` guard, confirmed against the deployed `blit386-next` Worker. The reasoning is
recorded in `src/channel-headers.ts` beside the line in question; do not re-derive it. Revisit the choice if `src/`
grows a Durable Object, KV, or any code that branches on real binding semantics rather than on a single `fetch`.

Shared harness in `src/__test__/` (same convention as the engine package): `hono-context.ts` fakes the Hono context and
the `ASSETS` binding, `press-context.ts` fakes the Fumapress `AppContext`, loader, pages, and adapters. `hono` is not a
dependency here – it arrives only as a transitive type through `fumapress` – so the Hono types are recovered
structurally from `ServerPlugin['createMiddlewares']` rather than imported. Keep it that way; adding `hono` as a
devDependency to make a test read better would pin a version this package does not otherwise control.

Two behaviors in that suite are regression guards rather than ordinary coverage, and both were verified by mutation
(break the implementation, watch the test go red) rather than only by passing: `channel-headers.ts` reading the channel
at request time, and `markdown-negotiation.ts` forwarding to `ASSETS` and falling through only on a 404. If you refactor
either, expect those tests to be the ones that stop you.

`src/webmcp.test.ts` covers `public/webmcp.js`, the browser-side WebMCP bridge – a different shape of problem from the
four `ServerPlugin`s above, since it is a plain `<script defer>` (`press.config.tsx`), not `type="module"`, with no
`import`/`export` of its own. It is deliberately outside `tsconfig.json`'s `include` (it targets `document.modelContext`
/ `navigator.modelContext`, an experimental API with no `lib.dom.d.ts` types), so the test reads the file as text and
runs it with `vm.runInThisContext({ filename })` against stubbed `document` / `navigator` / `window` / `fetch` rather
than statically or dynamically `import`-ing it – TS refuses to import a non-module script anyway, and doing so would
pull the file back into the type-checked program. The `filename` option is required, not cosmetic: without it,
`@vitest/coverage-v8` attributes execution to an anonymous `evalmachine` script and `public/webmcp.js` reports 0%
despite full coverage. `public/webmcp.js` is included in `vitest.config.ts`'s `coverage.include` for exactly this reason
– it is the one file under `public/` with real branching logic (the `navigate` tool's path-injection guards), unlike the
static `.well-known/` JSON.

## What is hand-authored and what is generated

Hand-authored: `content/index.mdx`, `showcase.mdx`, `community.mdx`, `mcp-server.mdx`, the root `content/meta.json`,
`content/blog/**`, and under `content/docs/`: `index.mdx`, `getting-started.mdx`, `faq.mdx`, and the root `meta.json`.

Generated, never hand-edit: every `content/docs/<section>/<topic>.mdx` (flat files, not folder `index.mdx`), the section
`meta.json` files, and `src/data/api-history.generated.json`. The MDX pages carry a "generated" banner in frontmatter;
the section `meta.json` files carry no banner but are generated all the same.

Doc frontmatter: `title` required; `description`, `icon`, `full` optional. Sidebar order comes from an optional
`meta.json` / `meta.yaml` per folder. When hand-authored content links to API reference, use site-absolute paths
(`/docs/api/...`), never GitHub URLs – the published pages live here.

## Documentation mirror

`packages/blit386/docs/*.md` is the single source of truth. `scripts/sync-docs-from-engine.mjs` reads the subset listed
in the engine package's `docs/_sitemap.json` and writes matching MDX into `content/docs/`. **The manifest, not the
script, owns which docs publish, their URL, sidebar order, and subtitle** – the script carries no per-page knowledge, so
adding a page means editing the manifest in `packages/blit386` and re-running the sync, with no change here.

`pnpm run sync:docs` regenerates and formats. `pnpm run sync:docs:check` fails on drift and **is enforced both locally
and in CI**: it is the last gate of `pnpm run preflight`, and the last step of the `quality-website` job in
`.github/workflows/ci.yml`, gated on the `website` path filter, which includes `packages/blit386/docs/**`. So editing an
engine doc without re-syncing fails the push and turns the pull request red. It runs last in both places because it
regenerates `content/docs` in the working tree – any gate after it would be reading regenerated rather than committed
content, which is also why CI puts it after the parallel join rather than inside it. The check diffs the working tree
against the index, so after re-syncing you must stage or commit the regenerated mirror before `preflight` goes green –
an unstaged `sync:docs` result still reads as drift. That costs nothing on a push, where everything is committed
already. The source resolves from `ENGINE_DOCS_DIR` (default `../blit386/docs`, which already resolves correctly to the
sibling `packages/blit386/docs` in this monorepo). `sync:docs:watch` re-syncs on every change alongside `pnpm run dev`.

That job checks out with `fetch-depth: 0`. The generator reads each page's `lastModified` with `git log --follow`, to
see past the commit that moved the engine into `packages/blit386/`, and `--follow` finds nothing on a shallow clone.

**`lastModified` comes from `git log` on the engine source doc, so commit order within a PR matters.** A sync run before
that doc's edit is committed embeds the _previous_ commit's date. Root CLAUDE.md's merge policy is what makes getting
this right actually pay off: squash merging is disabled on the repository, so a PR lands as a merge commit, and the
branch's own commits keep their original SHA and author date on `main` – they are not rewritten the way a squash would
rewrite them. So: edit `packages/blit386/docs/…`, commit that edit, _then_ run `pnpm run sync:docs` and commit the
regenerated mirror. Done in that order, the embedded `lastModified` already matches what `git log` reports once the PR
merges – no lag to chase, nothing to self-correct later. `pnpm run sync:docs:check`
([`scripts/check-docs-sync.mjs`](scripts/check-docs-sync.mjs)) regenerates the mirror and inspects the diff: a clean
diff passes; any diff at all – including one confined to `lastModified` lines – fails the build, since that shape now
means the commit order above wasn't followed rather than an unavoidable artifact of the merge strategy. The fix is to
re-run `pnpm run sync:docs` after the doc edit is committed and commit the result, not to ignore the failure.

What the generator does: drops the source H1 (the title comes from it), drops a lead paragraph duplicating the
description, rewrites intra-doc links to site paths (`/docs/...`) and everything else to absolute GitHub URLs, adds
frontmatter (`title`, `description`, `lastModified` from git, `editUrl` into the engine's GitHub path – both consumed by
`docsPageLayout`), and copies `packages/blit386/docs/_api-history.json` across.

MDX components: the generator passes PascalCase tags through verbatim and is MDX-aware, escaping stray braces in prose
while leaving JSX expression props (`type={{ ... }}`, `items={[ ... ]}`) intact. Any component the engine docs use must
be registered in `press.config.tsx` (`fumadocsMdx({ getMdxComponents })`) or the build breaks – `Callout`,
`Card`/`Cards`, and code blocks come from `defaultMdxComponents`; the rest are added explicitly. `Card href` is a JSX
prop and is **not** link-rewritten, so engine docs must use site-absolute `/docs/...` values.

Contributor-only engine pages (developer-experience-guide, documentation-and-versioning-guide, tooling, voice,
`security/*`, the docs README) are intentionally unmirrored – leaving them out of the manifest keeps them link-only on
GitHub.

The `Since`, `ApiAvailability`, and `PageChangelog` components all read `src/data/api-history.ts`, a typed loader over
the generated JSON. Never add a symbol to that JSON here; fix `packages/blit386` and re-sync.

## Twoslash

`fumadocs-twoslash` renders type-on-hover popups and `// ^?` callouts for blocks tagged ` ```ts twoslash `. Wired in
`source.config.ts`, popup components registered in `press.config.tsx`, CSS from `src/app.css`. `throws: false` means a
block that fails compilation degrades to plain highlighting instead of crashing the build. Correctness is
`packages/blit386`'s job – every twoslash block there must be self-contained or use a `// ---cut---` preamble.

`blit386` is a `workspace:*` devDependency (BT-414), not a pinned npm version – Twoslash resolves its type declarations
from `packages/blit386/dist`, so a doc can reference and validate unreleased engine API before it ships, and the engine
must be built (`pnpm --filter blit386 run build`) before this package's `build` in every CI/deploy job that runs one –
and now before `pnpm run dev:twoslash` too, since dev can run the transformer as well. `pnpm run test` and
`pnpm run build` self-heal a missing `packages/blit386/dist` automatically – both are prefixed with the shared
`scripts/ensure-engine-built.mjs` at the repo root (BT-480), the same guard `packages/demos` already runs (BT-399), so a
freshly created checkout or git worktree builds the engine once instead of failing `test` with a TS2307 inside Twoslash
compilation. Because `throws: false` swallows a failing block into plain highlighting rather than an error, a regression
here is silent. `grep -c twoslash-hover "dist/public/docs/<page>/index.html"` after a build (`<page>` is a placeholder,
e.g. `api/random`; keep it quoted or the shell reads `<`/`>` as redirection) is only a page-wide smoke check, not proof
a specific block typechecked – a page with several blocks can show a nonzero count while one block still silently failed
(see BT-427). To confirm one block specifically, grep the built HTML for a distinctive identifier from that block's
source and check whether it renders as a hoverable `twoslash-hover` token instead of plain syntax-highlighted text.

### The gate

`isTwoslashEnabled()` in `scripts/twoslash-config.mjs` decides whether the transformer runs. Absent an override it
mirrors `getDefaultAdapter()` in `waku/dist/lib/utils/config.js` exactly – true for `CLOUDFLARE` **or** `WORKERS_CI`,
read for plain truthiness, so `CLOUDFLARE=0` counts as on. That asymmetry is deliberate: the contract is "Twoslash runs
iff Waku selected its Cloudflare adapter", and checking only `CLOUDFLARE` is what let a Cloudflare Workers Builds run
ship the site with every popup missing, silently, because `throws: false` degrades rather than errors (BT-188).
`BLIT386_TWOSLASH` is the human escape hatch and gets human semantics: set it to force Twoslash on in dev, or to
`0`/`false` to force it off during a build for a faster loop. `NODE_ENV` is not a usable signal because
`source.config.ts` is evaluated by the fumadocs-mdx Vite plugin before Vite writes `NODE_ENV=production`.

Keep the check in `twoslash-config.mjs`; do not re-inline an env read into `source.config.ts`.
`scripts/__tests__/twoslash-enabled.test.mjs` pins every case, including the `package.json` copies of the env-var names
– the only copies that live outside TypeScript.

### Dev mode and its real cost (measured 2026-08-21, M4 Max / 64 GB, Node 26.7.0)

`pnpm run dev:twoslash` turns popups on locally. It is **not** the default, and it carries `--max-old-space-size=8192`,
because dev-mode Twoslash is genuinely expensive – though not for the reason this file asserted until BT-188 measured
it.

**The language service is cheap.** `fumadocs-twoslash` memoizes the twoslasher in a module-level `cachedInstance`, and
`twoslash` caches the virtual TS environment keyed on a hash of the compiler options – every block here uses the same
options, so exactly **one** language service serves the whole process, not one per MDX file. Replaying all 155 blocks
through it peaks at **318 MB RSS / 120 MB heap** in 4.0 s, p50 8 ms per block, and the heap is flat: three full sweeps
end at 318, 322, 323 MB. Dev is lazier still – with `async: true` the eager pass reads frontmatter only, so Twoslash
runs per page you actually open. `blit386.d.ts` is **288,348 bytes**, not the ~192 KB previously claimed here.

**The rendered payload is what costs.** A twoslashed page serves **~6.8 MB of HTML against ~0.6 MB plain** (`api/audio`
carries 215 hover tokens), and the dev server retains roughly **2 GB of RSS per distinct page visited**, monotonically.
The OOM stack tops out in `JsonStringify`/`ApplyReplacerFunction` – RSC payload serialization – not in TypeScript. So
the growth is unbounded in pages browsed and no fixed heap fixes a full sweep: the 4 GB default dies after 2 pages, 8 GB
after 4.

**What that means in practice.** Editing one page is fine and is the workflow the script is for: first load of
`api/audio` takes 5.3 s and settles at ~4.7 GB, then five edit-and-reload cycles hold at 2.7 s and plateau around 5.9 GB
with all 215 popups intact. **Browsing the whole docs section under `dev:twoslash` will OOM.** Restart the server if you
need to move on to another heavy page. For a faithful full-site preview use `pnpm run build && pnpm run start`, which is
single-shot and streams to disk.

Two options measured and rejected, so nobody re-tries them: `fsCache: false` is worse on both axes (353 MB peak, p50 18
ms), and `cache: false` – a fresh environment per block – costs 388 MB and 31 s for a 24x latency regression. Both are
already-correct defaults. Per-block opt-in was also considered and does not apply: every Twoslash block lives in the
generated mirror owned by `packages/blit386/docs/`, so a dev-only fence marker would have to ship into the published
engine docs – and lazy dev compilation already gives per-page opt-in for free.

## Dependency pins

`fumapress` and `waku` are the only dependencies here pinned to an exact version instead of a caret range. That is
deliberate and must stay: **`fumapress` declares `waku` as an exact-version peer dependency, not a range**, so a caret
on either side lets pnpm resolve a pair the framework does not support.

Every row is an exact pin, not a range – including the prerelease ones, so "beta.8 or newer" is never satisfied by
beta.9. Verified against the registry on 2026-08-08; `npm view fumapress@0.7.3 peerDependencies.waku` is the check –
swap the version to re-verify any other row.

| fumapress | required `waku` peer |
| --- | --- |
| 0.6.2 | `1.0.0-beta.3` |
| 0.6.3 – 0.7.3 | `1.0.0-beta.6` |
| 1.0.0-beta.1 | `1.0.0-beta.8` |
| 1.0.0-beta.2 | `1.0.0-beta.8` |

`1.0.0-beta.1` and `1.0.0-beta.2` are the only 1.0.0 prereleases published so far (there is no `beta.0`); a later beta
may pin a different waku, so re-check rather than assuming the pattern holds.

The current pair is `fumapress@0.7.3` + `waku@1.0.0-beta.6` (BT-455) – the newest peer-correct combination on the 0.x
line. Both packages share one Renovate group for the same reason; do not split them back apart, or Renovate proposes a
fumapress bump and a waku bump as two PRs, neither installable on its own.

**Do not move `waku` past beta.6 while `fumapress` is on 0.7.x.** waku beta.8 is sanctioned only by `fumapress` 1.0.0
beta.1 or beta.2, and nothing published sanctions beta.9 at all. That release is a rewrite rather than a bump: it
renames `ServerPlugin` to `PressPlugin` and `ConfigContext` to `AppShape`, and moves layouts onto the config object. All
four local plugins in `src/` plus every `createDocsLayoutPage` and `createRootLayout` call in `press.config.tsx` would
need reworking.

Two behavioral changes came in with 0.7.x and are already absorbed. Takumi went v1 to v2 (0.7.2), which re-tuned the
WebP encoder – OG cards are roughly 55% smaller with pixel-identical output, so **file size is not a validity signal
across that boundary; check geometry (1200x630) instead**. Base UI replaced Radix (0.7.0), which is why `waku.config.ts`
no longer carries an `optimizeDeps.include` workaround for `use-sync-external-store`: the 0.7.0 Vite plugin auto-detects
those CJS deps, and the twoslash popups are now Base UI triggers.

Revisit trigger: when `fumapress` 1.0.0 goes stable.

A framework bump now has a partial safety net. `pnpm run test:unit` (BT-440) covers the plugin logic itself – `/mcp`
`tools/list` and `search_docs` ranking, `Accept: text/markdown` negotiation and the `ASSETS` fall-through, the
`/feed.xml` document, and the `next`-channel headers – so a rename or signature change in the `ServerPlugin` contract
turns those red rather than silently degrading production. That is the largest part of what used to be a manual diff.

It is not the whole of it. The suite calls the plugins directly with doubles, so it cannot see anything that lives in
the wiring or the build, and these still need a real build diffed against a baseline captured on the old pins:

- per-page `twoslash-hover` counts (the transformer only runs when `isTwoslashEnabled()` is true, and `throws: false`
  degrades a failing block silently)
- `dist/server/wrangler.json` assertions – `run_worker_first`, `nodejs_compat`, `vars.BLIT386_CHANNEL`
- the plugin chain order in `press.config.tsx`, which the unit tests do not construct
- OG card geometry (1200x630), and the layout and RSC surface generally

A green typecheck still proves almost nothing here.

## Markdown for Agents

`markdownNegotiationPlugin` serves a canonical doc URL as markdown when the request carries `Accept: text/markdown`
(`Content-Type: text/markdown; charset=utf-8` plus an estimated `x-markdown-tokens` header); browsers still get HTML.
The output matches the `*.md` variants from the llms.txt plugin, whose `autoRedirect` is disabled so we return a direct
200 rather than a 302.

This requires `run_worker_first: true` on the assets config. Cloudflare otherwise serves pre-rendered static HTML before
the Worker runs and matches assets by path alone, ignoring `Accept`, so the Worker would never see canonical doc
requests. With the Worker first, the plugin re-implements assets-first by forwarding non-negotiated requests to the
`ASSETS` binding. Waku regenerates `dist/server/wrangler.json` on every build, so `scripts/patch-wrangler.mjs` injects
`run_worker_first` there; the root `wrangler.jsonc` carries it only for parity. Cloudflare's managed "Markdown for
Agents" feature is not used – it needs Pro+ and only rewrites origin HTML on proxied zones, not Worker-rendered
responses.

## MCP server

A JSON-RPC 2.0 endpoint at `/mcp` (streamable-HTTP, no auth), with two tools: `search_docs` and `get_docs_summary`
(which returns `/llms.txt`). `search_docs` scans loader pages in-process and scores title and description matches above
body matches. It deliberately does **not** build a FlexSearch index in-process – that exceeds the Worker CPU limit
(error 1102), the same reason site search runs in static mode.

`public/.well-known/mcp/server-card.json` has a downstream copy. `@blit386/kit` generates the same server name and URL
into every scaffolded game (`.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor) and cannot import across the
package boundary, so the values are duplicated in `packages/kit/src/adapters.ts`. Renaming the server or moving the
endpoint means editing both; `packages/kit/test/mcp-config.test.mjs` compares them and fails when they disagree.

## Blog media

Short screen captures are self-hosted, not embedded from a video platform.
`pnpm run encode:video -- <input> --out <dir>` produces the three files `VideoEmbed` expects: `<name>.av1.mp4`,
`<name>.h264.mp4`, and a lossless `<name>.webp` poster. The encoder is tuned for flat pixel art – AV1 `scm=1`
screen-content mode, x264 `-tune animation`, and a crop rather than a scale to reach even dimensions, so nothing is
resampled. Audio is stripped. Both codec levels are pinned so the `codecs=` strings in `src/components/video-embed.tsx`
stay exact; `scripts/__tests__/encode-video.test.mjs` guards that and the file-suffix contract.

Output goes under `public/media/<section>/<post-slug>/` (for example `public/media/blog/hot-reload-release-1-4-0/`). The
`/media/` prefix is deliberate: `public/_headers` serves `/media/*` with a one-year immutable `Cache-Control`, and a
`/blog/*` rule would also have matched the post HTML routes. The post-slug path segment is the cache key – a new post
gets a new directory, never a new file added to an existing one. Raw `.mov` sources stay local (`captures/` is
gitignored) and this package has no Git LFS.

Three `_headers` entries exist for this and must not be tightened back: `media-src 'self'` in the CSP (it was `'none'`,
which blocks all playback), plus `autoplay=(self)` and `fullscreen=(self)` in `Permissions-Policy`. Clips autoplay muted
and loop, but `controls` is always rendered – a loop over five seconds needs a pause affordance (WCAG 2.2.2). An inline
script beside the element cancels autoplay under `prefers-reduced-motion: reduce`, since CSS cannot and a client
component could only act after hydration.

Keep clips short; treat a few megabytes as the ceiling. A direct `ASSETS`-binding response does **not** honor Range
requests – verified against both `pnpm run start` and production, where a `Range:` GET returns `200` with the full body
and no `Accept-Ranges`. That follows from `run_worker_first: true`: the Worker forwards to the `ASSETS` binding, and
that response carries no range support. Once Cloudflare's edge cache holds the object, though, a cache hit may still be
served as `206 Partial Content` for a Range request – that is normal edge-cache behavior independent of what the origin
supports, and not something this package controls. A viewer therefore cannot reliably seek past what has buffered on a
cache miss – a non-issue for a 20-second autoplay loop, a real one for a multi-minute clip. `-movflags +faststart` is
what keeps playback starting early regardless. Cloudflare's per-file static-asset limit is 25 MiB.

## Deploy

`pnpm run build` produces `dist/public/` and `dist/server/`; `pnpm run deploy` runs
`wrangler deploy --config dist/server/wrangler.json --name blit386`. `.github/workflows/deploy.yml` runs two jobs
against this package, both using the org-level `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, each building
the site itself rather than reusing `ci.yml`'s artifact (a tag-triggered job cannot reuse artifacts from a
push-triggered `ci.yml` run):

- `deploy-website` deploys to the `blit386` Worker (`blit386.dev`) on a release tag push (`x.y.z`, no `v` prefix, no
  prerelease suffix) or a manual `workflow_dispatch`.
- `deploy-website-next` deploys to the `blit386-next` Worker (`next.blit386.dev`) on every push to `main`, no path
  filter. It sets `BLIT386_CHANNEL=next` on the build step, which makes `press.config.tsx` render the unreleased-work
  banner, add `<meta name="robots" content="noindex">`, and point canonical/OG/sitemap URLs at `next.blit386.dev`
  instead of production – all baked into the static HTML once during the build (`process.env.BLIT386_CHANNEL`, Node
  context). `src/channel-headers.ts` sets `X-Robots-Tag: noindex` and serves a disallow-all `robots.txt` the same way,
  but reads `c.env.BLIT386_CHANNEL` at **request time** instead: that module's top level re-runs inside the deployed
  Worker on every cold start (to rebuild the Fumapress plugin list), where `process.env.BLIT386_CHANNEL` is not the CI
  build step's shell value – confirmed locally with `wrangler dev`, where relying on the build-time value silently never
  set the header at all. `scripts/patch-wrangler.mjs` injects `vars.BLIT386_CHANNEL: 'next'` into
  `dist/server/wrangler.json` for exactly this reason.

The Worker is named `blit386` (custom domain `blit386.dev`); the preview Worker is `blit386-next` (custom domain
`next.blit386.dev`). The root `wrangler.jsonc` also declares `"name": "blit386"`, but that value never actually reaches
Cloudflare – both deploy paths pass `--name` explicitly. The root config exists for parity (notably `run_worker_first`);
the config actually deployed is `dist/server/wrangler.json`, regenerated by Waku on every build and then patched by
`scripts/patch-wrangler.mjs`.

Both Workers run with `observability.enabled: true` (BT-441), so Workers Logs captures every invocation – the only way
to see a runtime error on `blit386.dev`'s `/mcp` JSON-RPC endpoint or the markdown-negotiation path without reproducing
it locally. Same injection story as `run_worker_first`: `scripts/patch-wrangler.mjs` sets it on the generated
`dist/server/wrangler.json`, and the root `wrangler.jsonc` carries it only for parity. Query logs via the Cloudflare
dashboard (Workers & Pages -> `blit386` or `blit386-next` -> Logs) or
`pnpm --filter blit386-website exec wrangler tail <worker-name>` – running through the workspace `exec` invokes the
pinned local `wrangler` devDependency rather than whatever a bare `wrangler` on `PATH` resolves to.

All four `cloudflare/wrangler-action` steps in `.github/workflows/deploy.yml` (`deploy-demos`, `deploy-website`,
`deploy-demos-next`, `deploy-website-next`) pin the same `wranglerVersion` and set the same `packageManager: pnpm`, even
though only the two `deploy-website*` jobs strictly need the version pinned – so a deploy always runs the same wrangler
as local `pnpm run deploy` / `pnpm run start`, not whatever `wrangler-action` defaults to. That pin must match this
package's `wrangler` devDependency exactly; a Renovate bump to one without the other silently drifts the two apart.
