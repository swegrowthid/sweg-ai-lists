# Repository Guidelines

## Project Overview

- `swegai`: community catalog of AI posts. Posts live in the API database (Go + Supabase), not in this repo.
- A "post" is a user-submitted entry: title, one category (plus optional derivative), and 1-20 items (markdown, text, link, or file).
- Static Astro 7 site. Visual style is a port of skillbay.sh: plain links, gray hairlines, tables, no decoration.

## Architecture & Data Flow

```text
GET /posts (Go API; author_username via JOIN users at read time)
  -> fetchPosts() in src/lib/api.ts (zod PostSchema at the edge)
  -> postToRow(post) -> rows, sorted newest-first in each page
  -> EntryRows.astro (one table markup for all lists)
  -> static HTML in dist/ + client-side refresh on home
```

- Post rows come from the API only. The old local `src/content/entries` mock catalog is deleted; do not reintroduce content collections.
- `author_username` is optional in `PostSchema` (older servers omit it); `postToRow` falls back to `author_id.slice(0, 8)`.
- The only client-side JS: search filter on `/search`, the `/entry/?s=` detail mount (`src/lib/postDetail.ts`), the API refresh on home + `/news`, and the React island on `/tools`. Everything else is server-rendered.
- `/search` is prerendered: it ships all API post rows with `data-*` filter keys and filters in the browser. Do not add SSR for this.

## Key Directories

```text
src/pages/index.astro     home: sidebar + newest table
src/pages/s/[slug].astro  category listing (paths generated from CATEGORIES)
src/pages/entry/[slug].astro  detail shell (.posting layout, body client-rendered by postDetail.ts)
src/pages/search.astro    client-filtered search over prerendered rows
src/pages/news.astro      AI Tools Digest listing from GET /news (external links, no detail page)
src/pages/tools.astro     AI tools catalog shell - renders the ToolsCatalog island
src/components/           EntryRows (list table), ToolsCatalog.tsx (React island: tools table, chip filters, instant search)
src/layouts/Base.astro    masthead, topnav, footer, global stylesheet
src/data/site.ts          SITE, CATEGORIES, CATEGORY_NAME, NAV - single source of truth
src/styles/style.css      the whole design system, no framework
```

## Development Commands

```sh
bun install
bun run dev        # dev server at localhost:4321
bun run build      # static build to dist/
bun run preview    # serve the build
bunx astro check   # type check, must be 0 errors
```

## Code Conventions & Common Patterns

- Category slugs come from `CATEGORIES` in `src/data/site.ts` only. Display a name with `CATEGORY_NAME[slug] ?? slug`.
- Sort and filter in the page, never in `EntryRows.astro`. The component takes a ready `rows` array: `{ url, title, summary, category, author, display, date, attrs? }`.
- `display` cell: posts `"post"` (set in `postToRow`). Dates: `toLocaleDateString("en-US", { month: "short", day: "numeric" })`.
- CSS vocabulary is shared, from the skillbay port: `.rows`, `.box`, `.attrs`, `.st`, `.kind`, `.price`, `.muted`, `.small`, `.posting`, `.form`. Reuse these; do not invent parallel classes.
- React is the only client framework, via `@astrojs/react`, and only for the `/tools` island (`src/components/ToolsCatalog.tsx`). No Tailwind, no UI libraries. Other interaction uses vanilla inline `<script>`.
- Relative imports: two levels from `src/pages/x.astro` (`../layouts/`), three levels from `src/pages/x/y.astro` (`../../layouts/`). This was the one build breaker; check it first.
- Add a post: logged-in users submit at `/submit` (POST /posts, Bearer). There is no file-based content.

## Important Files

- `src/lib/api.ts`: zod schemas, fetchers, and mappers (`postToRow`). Wire fields change here first; the backend `api/openapi.yaml` is the contract source.
- `src/data/site.ts`: brand text, categories, nav. Rename here, not in pages.
- `src/layouts/Base.astro`: every page renders through it. `crumb` prop adds a breadcrumb segment.
- `src/styles/style.css`: design tokens (link `#0000ee`, accent `#551a8b`, green `#060`, 980px column, 600px breakpoint).

## Runtime/Tooling Preferences

- Bun is the package manager and script runner. Node >= 22.12.
- TypeScript is pinned to 6.x: `astro check` cannot load the TS 7 native compiler. Do not upgrade `typescript` past 6 without testing `bunx astro check`.
- `@astrojs/check` is a devDependency; `astro check` needs it.

## Testing & QA

- No unit test framework. The gate is: `bunx astro check` (0 errors) + `bun run build` (all pages generate) + a browser smoke test of home, one category, one detail, one search query.
- Malformed API rows are dropped by zod at the edge (`toRows`). Fix `PostSchema` only when the wire contract changed (`api/openapi.yaml` in the backend repo is the source of truth).
- Verify search filtering with query params (`/search/?q=dotfiles&kind=post`) in a real browser; the filter logic is client-side.
