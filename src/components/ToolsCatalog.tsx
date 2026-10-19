import { useEffect, useMemo, useState } from 'react';
import { fetchTools, toolToRow, TOOL_CATEGORY_NAME, TOOL_GROUP_VALUE } from '../lib/api';
import type { ApiRow, ApiTool } from '../lib/api';

/** One request page. The API caps `per_page` at 100. */
const PAGE = 100;

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

/** Where the catalog stands: the full list, one failed page, a dead API. */
type LoadStatus = 'loading' | 'ready' | 'partial' | 'error';

function groupFromParams(params: URLSearchParams): GroupValue {
  const raw = params.get('group') ?? params.get('category') ?? '';
  const value = TOOL_GROUP_VALUE[raw] ?? raw;
  return GROUPS.find((g) => g.value === value)?.value ?? '';
}

function sortFromParams(params: URLSearchParams): SortValue {
  const key = params.get('sort');
  if (!key) return '';
  const dir = params.get('order') === 'desc' ? 'desc' : 'asc';
  return SORT_OPTIONS.find((o) => o.value === `${key}|${dir}`)?.value ?? '';
}

function compare(a: ApiTool, b: ApiTool, sort: SortValue): number {
  const dir = sort.endsWith('|desc') ? -1 : 1;
  if (sort.startsWith('name')) return dir * a.name.localeCompare(b.name);
  return dir * a.updated.localeCompare(b.updated);
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
  /** Build-time first rows: what the static page shows before hydration. */
  tools: ApiTool[];
}

export default function ToolsCatalog({ tools }: Props) {
  const [catalog, setCatalog] = useState<ApiTool[]>(tools);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<GroupValue>('');
  const [sort, setSort] = useState<SortValue>('');

  /** Pull every page of the catalog. One lost page keeps what arrived
   *  (`partial`); a dead API keeps the build snapshot or shows `error`. */
  async function loadAll(): Promise<void> {
    setStatus('loading');
    const all: ApiTool[] = [];
    let page = 1;
    let totalPages = 1;
    try {
      while (page <= totalPages) {
        const result = await fetchTools({ page, perPage: PAGE });
        all.push(...result.data);
        totalPages = result.meta.total_pages;
        page += 1;
      }
      setCatalog(all);
      setStatus('ready');
    } catch {
      if (all.length > 0) {
        setCatalog(all);
        setStatus('partial');
      } else if (tools.length > 0) {
        setStatus('partial');
      } else {
        setStatus('error');
      }
    }
  }

  // The URL is the query state: apply it on entry, rewrite it on change.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQ(params.get('q') ?? '');
    setGroup(groupFromParams(params));
    setSort(sortFromParams(params));
    void loadAll();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (group) params.set('group', group);
    const [key = '', dir = ''] = sort.split('|');
    if (key) {
      params.set('sort', key);
      params.set('order', dir);
    }
    const query = params.size ? `?${params}` : '';
    history.replaceState(null, '', `${location.pathname}${query}`);
  }, [q, group, sort]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let picked = catalog;
    if (group) picked = picked.filter((t) => (TOOL_GROUP_VALUE[t.category] ?? t.category) === group);
    if (sort) picked = [...picked].sort((a, b) => compare(a, b, sort));
    // The search box matches name, site, status, billing, and features.
    if (needle)
      picked = picked.filter((t) =>
        [t.name, t.website_label, t.status, t.min_spend ?? '', ...(t.ai_features ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    return picked.map((t) => toolToRow(t, TOOL_CATEGORY_NAME[t.category]));
  }, [catalog, q, group, sort]);

  /** Row count per group, for the filter chips. */
  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    for (const tool of catalog) {
      const g = TOOL_GROUP_VALUE[tool.category] ?? tool.category;
      by[g] = (by[g] ?? 0) + 1;
    }
    return by;
  }, [catalog]);

  const total = catalog.length;
  const filtered = rows.length !== total || Boolean(q.trim()) || Boolean(group);
  const hint = GROUPS.find((g) => g.value === group)?.hint ?? '';
  const note = [q.trim() && `"${q.trim()}"`, group && GROUPS.find((g) => g.value === group)?.label]
    .filter(Boolean)
    .join(' ');

  function clearFilters(): void {
    setQ('');
    setGroup('');
    setSort('');
  }

  return (
    <>
      <form className="searchbar" role="search" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label className="inline" htmlFor="tool-q">
            name
          </label>
          <input
            id="tool-q"
            type="search"
            value={q}
            placeholder="search name, site, feature"
            onChange={(event) => setQ(event.currentTarget.value)}
          />
        </div>
        <div className="field">
          <label className="inline" htmlFor="tool-sort">
            order by
          </label>
          <select
            id="tool-sort"
            value={sort}
            onChange={(event) => setSort(SORT_OPTIONS.find((o) => o.value === event.currentTarget.value)?.value ?? '')}
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
              aria-pressed={group === g.value}
              onClick={() => setGroup(g.value)}
            >
              {g.label}
              {status !== 'loading' ? ` ${g.value === '' ? total : (counts[g.value] ?? 0)}` : ''}
            </button>
          ))}
        </div>
      </form>

      {hint ? <p className="small muted">{hint}</p> : null}

      <p className="small" id="count">
        {filtered
          ? `${rows.length} of ${total} ${total === 1 ? 'tool' : 'tools'}${note ? ` matching ${note}` : ''}`
          : `${total} ${total === 1 ? 'tool' : 'tools'}`}
      </p>
      {status === 'loading' ? <p className="small muted">loading the full catalog…</p> : null}
      {status === 'partial' ? (
        <p className="small err">only part of the catalog loaded - showing {total} tools.</p>
      ) : null}

      {status === 'error' && rows.length === 0 ? (
        <div className="empty-state">
          <p>the catalog could not load.</p>
          <button type="button" className="category-toggle" onClick={() => void loadAll()}>
            try again
          </button>
        </div>
      ) : rows.length > 0 ? (
        <table className="rows">
          <tbody>
            {rows.map((row) => (
              <Row key={row.attrs['data-tool-id'] ?? row.title} row={row} />
            ))}
          </tbody>
        </table>
      ) : status === 'loading' ? null : (
        <div className="empty-state">
          <p>{total === 0 ? 'no tools yet. check back soon.' : 'no tools match those filters.'}</p>
          {total > 0 ? (
            <button type="button" className="category-toggle" onClick={clearFilters}>
              clear filters
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}
