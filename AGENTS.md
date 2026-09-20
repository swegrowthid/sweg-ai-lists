# Repository Guidelines

## Project Overview

- `swegai`: community catalog of AI skills and AI settings.
- A "skill" is a SKILL.md package that teaches an agent a job.
- A "setting" is a reusable system prompt or agent config.
- Static Astro 7 site. Visual style is a port of skillbay.sh: plain links, gray hairlines, tables, no decoration.

## Architecture & Data Flow

```text
src/content/entries/*.md
  -> glob loader (src/content.config.ts, zod schema)
  -> getCollection("entries") in each page
  -> filter status === "approved"
  -> sort newest-first by data.updated
  -> EntryRows.astro (one table markup for all lists)
  -> static HTML in dist/
```

- One collection, `entries`. `kind: skill | setting` is the discriminant. Do not split collections.
- Detail differences render from `kind`: skills show `install`; settings show `target` + `model`.
- The only client-side JS: search filter on `/search` and example tabs on entry pages. Everything else is server-rendered.
- `/search` is prerendered: it ships all approved rows with `data-*` filter keys and filters in the browser. Do not add SSR for this.

## Key Directories

```text
src/content/entries/      one markdown file per entry, slug = filename
src/pages/index.astro     home: sidebar + newest table
src/pages/s/[slug].astro  category listing (paths generated from CATEGORIES)
src/pages/entry/[slug].astro  detail page (.posting layout + examples)
src/pages/search.astro    client-filtered search over prerendered rows
src/components/           EntryRows (list table), ExampleCompare (tabs + panes)
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
bunx astro sync    # regenerate content types after schema changes
```

## Code Conventions & Common Patterns

- Category slugs come from `CATEGORIES` in `src/data/site.ts` only. Display a name with `CATEGORY_NAME[slug] ?? slug`.
- Sort and filter in the page, never in `EntryRows.astro`. The component takes a ready `rows` array: `{ url, title, summary, category, author, display, date, attrs? }`.
- `display` cell: skills `"free"`, settings `"setting"`. Dates: `toLocaleDateString("en-US", { month: "short", day: "numeric" })`.
- CSS vocabulary is shared, from the skillbay port: `.rows`, `.box`, `.attrs`, `.st`, `.kind`, `.price`, `.muted`, `.small`, `.compare`, `.tabs`, `.posting`, `.form`. Reuse these; do not invent parallel classes.
- No Tailwind, no UI libraries, no client frameworks. Vanilla inline `<script>` only where interaction is required.
- Relative imports: two levels from `src/pages/x.astro` (`../layouts/`), three levels from `src/pages/x/y.astro` (`../../layouts/`). This was the one build breaker; check it first.
- Add an entry: create `src/content/entries/<slug>.md` matching the schema in `src/content.config.ts`, then run `bunx astro sync`.

## Important Files

- `src/content.config.ts`: the zod schema. Change fields here first, then seed files.
- `src/data/site.ts`: brand text, categories, nav. Rename here, not in pages.
- `src/layouts/Base.astro`: every page renders through it. `crumb` prop adds a breadcrumb segment.
- `src/styles/style.css`: design tokens (link `#0000ee`, accent `#551a8b`, green `#060`, 980px column, 600px breakpoint).

## Runtime/Tooling Preferences

- Bun is the package manager and script runner. Node >= 22.12.
- TypeScript is pinned to 6.x: `astro check` cannot load the TS 7 native compiler. Do not upgrade `typescript` past 6 without testing `bunx astro check`.
- `@astrojs/check` is a devDependency; `astro check` needs it.

## Testing & QA

- No unit test framework. The gate is: `bunx astro check` (0 errors) + `bun run build` (all pages generate) + a browser smoke test of home, one category, one detail, one search query.
- Schema violations surface at `bunx astro sync` or build time; fix frontmatter, not the schema, when a seed file is wrong.
- Verify search filtering with query params (`/search/?q=review&kind=skill`) in a real browser; the filter logic is client-side.
