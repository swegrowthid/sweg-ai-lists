import { useEffect, useState, type MouseEvent } from 'react';
import {
  fetchToolCategories,
  fetchTools,
  toolToRow,
  TOOL_CATEGORY_NAME,
  TOOL_GROUP_VALUE,
} from '../lib/api';
import type { ApiPageMeta, ApiRow, ApiTool, ToolQuery } from '../lib/api';

/** Rows per request. Matches the prerendered page size and stays under the
 *  API cap of 100. */
const PAGE_SIZE = 50;

/** Wait this long after the last keystroke before the search reaches the
 *  server; every new keystroke cancels the pending one. */
const SEARCH_DEBOUNCE_MS = 250;

/** Every pager link points here, so the hrefs stay valid without JS. */
const TOOLS_PATH = '/tools/';

/** The three fixed catalog groups. `value` is what the URL and the API carry.
 *  Hints state the boundary the 2026 landscape draws between the groups:
 *  provider owns the model, coding agent owns the task, ADE owns the workspace. */
const GROUPS = [
  { value: '', label: 'all', hint: '' },
  {
    value: 'provider',
    label: 'providers',
    hint: 'providers: labs that train and sell foundation models via API or open weights',
  },
  {
    value: 'coding-agent',
    label: 'coding agents',
    hint: 'coding agents: hand one a task; it plans, edits, tests, and returns a reviewable change',
  },
  {
    value: 'ade',
    label: 'ade',
    hint: 'ai dev environments: agent-first workspaces that own the editor, runtime, and deploy surface',
  },
] as const;

type GroupValue = (typeof GROUPS)[number]['value'];

/** One select drives both sort key and direction. `key|dir` matches the URL
 *  params `sort` + `order`, so shared links keep their meaning. */
const SORT_OPTIONS = [
  { value: '', label: 'source order' },
  { value: 'name|asc', label: 'name a-z' },
  { value: 'name|desc', label: 'name z-a' },
  { value: 'updated|desc', label: 'newest first' },
  { value: 'updated|asc', label: 'oldest first' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

/** The query the URL carries. `sort` is the combined `key|dir` the select uses. */
interface Params {
  q: string;
  group: GroupValue;
  sort: SortValue;
  page: number;
}

/** The two states a page can be in: live server data, or the build snapshot
 *  plus a visible notice. There is no `partial` any more: one request per page
 *  either arrives whole or the page falls back to the baked rows. */
type LoadStatus = 'ready' | 'degraded';

/** Read the query out of the URL. Unknown group and sort values fall back to
 *  the defaults instead of producing a request the API would answer 400 to. */
function readParams(): Params {
  const params = new URLSearchParams(location.search);
  const rawGroup = params.get('group') ?? params.get('category') ?? '';
  const group = TOOL_GROUP_VALUE[rawGroup] ?? rawGroup;
  const key = params.get('sort') ?? '';
  const dir = params.get('order') === 'desc' ? 'desc' : 'asc';
  const parsed = Number.parseInt(params.get('page') ?? '1', 10);
  return {
    q: params.get('q') ?? '',
    group: GROUPS.find((g) => g.value === group)?.value ?? '',
    sort: key ? (SORT_OPTIONS.find((o) => o.value === `${key}|${dir}`)?.value ?? '') : '',
    page: Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
  };
}

/** One URL for one query state. Pager links always carry `page`; other links
 *  only when it is not 1, so `/tools/` stays the canonical first page. */
function hrefFor(next: Params, withPage = false): string {
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.group) params.set('group', next.group);
  const [key = '', dir = ''] = next.sort.split('|');
  if (key) {
    params.set('sort', key);
    params.set('order', dir);
  }
  if (withPage || next.page > 1) params.set('page', String(next.page));
  const search = params.toString();
  return `${TOOLS_PATH}${search ? `?${search}` : ''}`;
}

/** The API query for one URL state. */
function apiQuery(next: Params): ToolQuery {
  const [key = '', dir = ''] = next.sort.split('|');
  return {
    q: next.q.trim() || undefined,
    group: next.group || undefined,
    sort: key || undefined,
    order: key ? dir : undefined,
    page: next.page,
    perPage: PAGE_SIZE,
  };
}

/** Page numbers for the pager: every page when the list is short, otherwise
 *  the first and last page plus a window around the current one. */
function pageItems(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total]);
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) pages.add(p);
  if (current <= 3) for (let p = 2; p <= Math.min(total - 1, 4); p += 1) pages.add(p);
  if (current >= total - 2) for (let p = Math.max(2, total - 3); p <= total - 1; p += 1) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | '...')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) items.push('...');
    items.push(p);
  });
  return items;
}

/** One table row in the exact shape EntryRows renders, so the tools list looks
 *  like every other list on the site. */
function Row({ row }: { row: ApiRow }) {
  return (
    <tr {...row.attrs}>
      <td className="d">{row.date}</td>
      <td className="entry-main">
        {row.url ? (
          <a className="entry-title" href={row.url}>
            {row.title}
          </a>
        ) : (
          <span className="entry-title">{row.title}</span>
        )}
        <span className="entry-kind">{row.attrs['data-kind'] ?? row.display}</span>
        {row.summary && row.summary !== row.title ? <span className="entry-summary">{row.summary}</span> : null}
      </td>
      <td className="c category-cell">
        <a href={row.categoryHref ?? `/s/${row.category}`}>{row.categoryLabel ?? row.category}</a>
      </td>
      <td className="c author-cell">{row.author}</td>
      <td className="p">
        <span className="price">{row.display}</span>
      </td>
    </tr>
  );
}

interface Props {
  /** Build-time page 1: what the static page shows before hydration, and what
   *  a failed runtime fetch falls back to. */
  tools: ApiTool[];
  /** Build-time meta for page 1, or null when the build could not reach the API. */
  meta: ApiPageMeta | null;
  /** True when the build itself could not reach the API. */
  buildFailed: boolean;
}

export default function ToolsCatalog({ tools, meta, buildFailed }: Props) {
  const [rows, setRows] = useState<ApiTool[]>(tools);
  const [pageMeta, setPageMeta] = useState<ApiPageMeta | null>(meta);
  const [status, setStatus] = useState<LoadStatus>(buildFailed ? 'degraded' : 'ready');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState<Params>({ q: '', group: '', sort: '', page: 1 });
  const [attempt, setAttempt] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // The URL is the query state: apply it once on entry, then keep it in sync.
  useEffect(() => {
    const params = readParams();
    setInput(params.q);
    setQuery(params);
    history.replaceState(null, '', hrefFor(params));
    setHydrated(true);
  }, []);

  // Back and forward buttons replay the URL they carry.
  useEffect(() => {
    const onPop = () => {
      const params = readParams();
      setInput(params.q);
      setQuery(params);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // One request per page. A newer query aborts the request it replaces, so a
  // slow response can never overwrite a newer one.
  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    setBusy(true);
    setAttempted(true);
    fetchTools(apiQuery(query), undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRows(result.data);
        setPageMeta(result.meta);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
        // Degraded, never silent: keep the baked page-1 rows on screen and say
        // so above the table.
        setRows(tools);
        setPageMeta(meta);
        setStatus('degraded');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
    // `tools` and `meta` are the stable build-time fallback this effect
    // restores on failure; they never change after mount.
  }, [query, hydrated, attempt, tools, meta]);

  // Search waits for a pause in typing, then rewrites the URL in place: a
  // keystroke is not a history entry.
  useEffect(() => {
    if (!hydrated || input === query.q) return;
    const timer = setTimeout(() => {
      const next = { ...query, q: input, page: 1 };
      history.replaceState(null, '', hrefFor(next));
      setQuery(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, query, hydrated]);

  // Chip counts come from the category endpoint, not from the visible page.
  useEffect(() => {
    let live = true;
    fetchToolCategories()
      .then((cats) => {
        if (!live) return;
        const by: Record<string, number> = {};
        let all = 0;
        for (const cat of cats) {
          const group = TOOL_GROUP_VALUE[cat.slug] ?? cat.slug;
          by[group] = (by[group] ?? 0) + cat.count;
          all += cat.count;
        }
        by[''] = all;
        setCounts(by);
      })
      .catch(() => {
        // Counts are decoration; the state notice already covers a dead API.
      });
    return () => {
      live = false;
    };
  }, []);

  function pickGroup(value: GroupValue): void {
    const next = { ...query, q: input, group: value, page: 1 };
    history.pushState(null, '', hrefFor(next));
    setQuery(next);
  }

  function pickSort(value: SortValue): void {
    const next = { ...query, q: input, sort: value, page: 1 };
    history.pushState(null, '', hrefFor(next));
    setQuery(next);
  }

  function jumpTo(page: number): void {
    const next = { ...query, page };
    history.pushState(null, '', hrefFor(next, true));
    setQuery(next);
  }

  // Plain left clicks page in place; modified clicks keep the browser's own
  // behaviour (new tab, copy link) on the real href.
  function goPage(event: MouseEvent<HTMLAnchorElement>, page: number): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    jumpTo(page);
  }

  function clearFilters(): void {
    const next: Params = { q: '', group: '', sort: '', page: 1 };
    history.pushState(null, '', hrefFor(next));
    setInput('');
    setQuery(next);
  }

  const viewMeta = pageMeta ?? { page: 1, per_page: PAGE_SIZE, total: rows.length, total_pages: rows.length ? 1 : 0 };
  const needle = query.q.trim();
  const hint = GROUPS.find((g) => g.value === query.group)?.hint ?? '';
  const note = [needle && `"${needle}"`, query.group && GROUPS.find((g) => g.value === query.group)?.label]
    .filter(Boolean)
    .join(' ');
  const rowViews = rows.map((tool) => toolToRow(tool, TOOL_CATEGORY_NAME[tool.category]));

  return (
    <>
      <form className="searchbar" role="search" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label className="inline" htmlFor="tool-q">
            search
          </label>
          <input
            id="tool-q"
            type="search"
            value={input}
            placeholder="name, site, status, min spend, features"
            onChange={(event) => setInput(event.currentTarget.value)}
          />
        </div>
        <div className="field">
          <label className="inline" htmlFor="tool-sort">
            order by
          </label>
          <select
            id="tool-sort"
            value={query.sort}
            onChange={(event) => pickSort(SORT_OPTIONS.find((o) => o.value === event.currentTarget.value)?.value ?? '')}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="chips" role="group" aria-label="group">
          {GROUPS.map((g) => (
            <button
              key={g.value}
              type="button"
              className="chip"
              aria-pressed={query.group === g.value}
              onClick={() => pickGroup(g.value)}
            >
              {g.label}
              {counts ? ` ${g.value === '' ? (counts[''] ?? 0) : (counts[g.value] ?? 0)}` : ''}
            </button>
          ))}
        </div>
      </form>

      {hint ? <p className="small muted">{hint}</p> : null}

      <p className="small" id="count">
        {`${rows.length} of ${viewMeta.total} ${viewMeta.total === 1 ? 'tool' : 'tools'}${
          status === 'ready' && note ? ` matching ${note}` : ''
        }`}
      </p>

      {status === 'degraded' ? (
        <div className="notice" role="status">
          <p>
            {attempted
              ? `the live catalog is unavailable${
                  rows.length > 0 ? ` - showing the first ${rows.length} rows from the last build` : ''
                }. search, filters, and paging need the live catalog.`
              : 'the catalog is unavailable at build time. loading the live catalog...'}
          </p>
          <button type="button" className="category-toggle" onClick={() => setAttempt((n) => n + 1)} disabled={busy}>
            try again
          </button>
        </div>
      ) : null}

      {rowViews.length > 0 ? (
        <table className="rows" aria-busy={busy}>
          <tbody>
            {rowViews.map((row) => (
              <Row key={row.attrs['data-tool-id'] ?? row.title} row={row} />
            ))}
          </tbody>
        </table>
      ) : busy ? (
        <p className="small muted">loading the catalog...</p>
      ) : status === 'degraded' ? null : (
        <div className="empty-state">
          {viewMeta.total === 0 ? (
            <p>{note ? 'no tools match those filters.' : 'no tools yet. check back soon.'}</p>
          ) : (
            <p>no rows on this page.</p>
          )}
          {note ? (
            <button type="button" className="category-toggle" onClick={clearFilters}>
              clear filters
            </button>
          ) : viewMeta.total > 0 ? (
            <button type="button" className="category-toggle" onClick={() => jumpTo(1)}>
              back to page 1
            </button>
          ) : null}
        </div>
      )}

      {status === 'ready' && viewMeta.total_pages > 1 ? (
        <nav className="pager" aria-label="catalog pages">
          {query.page > 1 ? (
            <a href={hrefFor({ ...query, page: query.page - 1 }, true)} onClick={(e) => goPage(e, query.page - 1)}>
              prev
            </a>
          ) : (
            <span className="disabled" aria-disabled="true">
              prev
            </span>
          )}
          {pageItems(query.page, viewMeta.total_pages).map((item, index) =>
            item === '...' ? (
              <span key={`gap-${index}`} className="gap">
                ...
              </span>
            ) : (
              <a
                key={item}
                href={hrefFor({ ...query, page: item }, true)}
                aria-current={item === query.page ? 'page' : undefined}
                onClick={(e) => goPage(e, item)}
              >
                {item}
              </a>
            ),
          )}
          {query.page < viewMeta.total_pages ? (
            <a href={hrefFor({ ...query, page: query.page + 1 }, true)} onClick={(e) => goPage(e, query.page + 1)}>
              next
            </a>
          ) : (
            <span className="disabled" aria-disabled="true">
              next
            </span>
          )}
        </nav>
      ) : null}
    </>
  );
}
