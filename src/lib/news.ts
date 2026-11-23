/** Pure helpers for the AI News surfaces: URL query state, diverse teaser
 *  picks, date-bucketed row markup, and the pager. String building only - no
 *  DOM access here, so the Astro build and the browser controller render
 *  identical markup. */

import { NEWS_SOURCE, newsDate } from './api';
import type { ApiNews, ApiNewsSource, ApiPageMeta, NewsQuery } from './api';

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** The four lens groups the API registry assigns every source. Order is the
 *  chip order on /news. */
export const NEWS_GROUPS = [
  { value: 'lab', label: 'Lab' },
  { value: 'press', label: 'Press' },
  { value: 'research', label: 'Research' },
  { value: 'digest', label: 'Digest' },
] as const;

export type NewsGroupValue = (typeof NEWS_GROUPS)[number]['value'];

/** Display label for a group slug; unknown or absent groups render "news". */
export function newsGroupLabel(group: string | undefined): string {
  return NEWS_GROUPS.find((g) => g.value === group)?.label ?? 'news';
}

/** The query state /news carries in its URL: search text, lens group, source
 *  name, and 1-based page. Anything the API would reject is dropped here so a
 *  shared link can never produce a 400. */
export interface NewsParams {
  q: string;
  group: string;
  source: string;
  page: number;
}

/** Read the query out of a URL search string (`location.search` or a link's
 *  `?...` part). Normalizes `q`, `group`, and `source` to match the backend
 *  filter rules; unknown group values fall back to unfiltered. */
export function readNewsParams(search: string): NewsParams {
  const params = new URLSearchParams(search);
  const group = (params.get('group') ?? '').trim().toLowerCase();
  const rawPage = (params.get('page') ?? '1').trim();
  const parsed = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  return {
    q: (params.get('q') ?? '').trim(),
    group: NEWS_GROUPS.some((g) => g.value === group) ? group : '',
    source: (params.get('source') ?? '').trim(),
    page: Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1,
  };
}

/** Match a source name case-insensitively against the backend source list so
 *  shared links like `?source=openai` select `OpenAI`. Unknown names pass
 *  through trimmed so the API answers its empty page. */
export function canonicalNewsSource(source: string, sources: readonly ApiNewsSource[]): string {
  const trimmed = source.trim();
  if (!trimmed) return '';
  const match = sources.find((entry) => entry.name.toLowerCase() === trimmed.toLowerCase());
  return match ? match.name : trimmed;
}

/** Sources available under the selected lens group. Empty group shows every
 *  registered source in registry order. */
export function sourcesForNewsGroup(sources: readonly ApiNewsSource[], group: string): ApiNewsSource[] {
  return group ? sources.filter((entry) => entry.group === group) : [...sources];
}

/** Normalize URL-derived params against the live source registry. */
export function reconcileNewsParams(next: NewsParams, sources: readonly ApiNewsSource[]): NewsParams {
  return {
    ...next,
    q: next.q.trim(),
    source: canonicalNewsSource(next.source, sources),
  };
}

/** State transition for clicking a lens chip. Clicking `all` or re-clicking the
 *  active lens resets both `group` and `source`; switching to another lens clears
 *  `source` so incompatible `(group, source)` pairs cannot lock the list to 0. */
export function pickNewsGroup(state: NewsParams, clickedGroup: string, currentQuery: string): NewsParams {
  const q = currentQuery.trim();
  if (!clickedGroup || state.group === clickedGroup) {
    return { q, group: '', source: '', page: 1 };
  }
  return { q, group: clickedGroup, source: '', page: 1 };
}

/** State transition for choosing a source from the select control. Preserves
 *  the active lens when compatible, and clears an incompatible lens so a direct
 *  source choice never returns an empty contradiction. */
export function pickNewsSource(
  state: NewsParams,
  nextSource: string,
  currentQuery: string,
  sources: readonly ApiNewsSource[],
): NewsParams {
  const source = canonicalNewsSource(nextSource, sources);
  const matched = source ? sources.find((entry) => entry.name === source) : undefined;
  const group = matched && state.group && matched.group !== state.group ? '' : state.group;
  return {
    q: currentQuery.trim(),
    group,
    source,
    page: 1,
  };
}

/** One URL for one query state. `withPage` forces the page param even on
 *  page 1, which pager links always carry so each page is a distinct URL. */
export function newsHrefFor(next: NewsParams, withPage = false): string {
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.group) params.set('group', next.group);
  if (next.source) params.set('source', next.source);
  if (withPage || next.page > 1) params.set('page', String(next.page));
  const search = params.toString();
  return `/news/${search ? `?${search}` : ''}`;
}

/** True for every /news URL this site generates: the bare path, the slash
 *  form, and any query string. The page script intercepts clicks on these to
 *  fetch in place; anything else keeps the browser's default behaviour. */
export function isNewsHref(href: string): boolean {
  return href === '/news' || href === '/news/' || href.startsWith('/news?') || href.startsWith('/news/?');
}

/** Rows per request on /news. Matches the build snapshot and stays under the
 *  API cap of 100. */
export const NEWS_PAGE_SIZE = 30;

/** The API query for one URL state. Blank text and page 1 ride as unset. */
export function newsApiQuery(next: NewsParams): NewsQuery {
  return {
    q: next.q.trim() || undefined,
    group: next.group || undefined,
    source: next.source || undefined,
    page: next.page,
    perPage: NEWS_PAGE_SIZE,
  };
}

/** Stored rows per lens group, summed from the source list. Drives the chip
 *  counts; sources without rows still count as zero. */
export function newsGroupCounts(sources: ApiNewsSource[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const source of sources) {
    counts[source.group] = (counts[source.group] ?? 0) + source.count;
  }
  return counts;
}

/** Pick `count` entries that spread across sources: at most `maxPerSource`
 *  rows from any one source on the first pass, then fill the rest newest-first
 *  so a thin registry never returns fewer than `count` when entries exist.
 *  Input order is preserved, so callers pass newest-first API order. */
export function pickDiverseNews(entries: ApiNews[], count: number, maxPerSource: number): ApiNews[] {
  const picked = new Set<ApiNews>();
  const perSource = new Map<string, number>();
  const key = (entry: ApiNews) => entry.source?.trim() ?? '';
  for (const capped of [true, false]) {
    for (const entry of entries) {
      if (picked.size >= count) return [...picked];
      if (picked.has(entry)) continue;
      const used = perSource.get(key(entry)) ?? 0;
      if (capped && used >= maxPerSource) continue;
      picked.add(entry);
      perSource.set(key(entry), used + 1);
    }
  }
  return [...picked];
}

/** Date buckets for grouped rendering, compared on UTC calendar days because
 *  `published_at` is a UTC instant. A split date simply re-heads on the next
 *  page - grouping is per rendered page, never across the whole catalog. */
export type NewsBucket = 'Today' | 'Yesterday' | 'Earlier this week' | 'Older';

const DAY_MS = 86_400_000;

export function newsBucket(publishedAt: string, now: Date): NewsBucket {
  const published = new Date(publishedAt);
  if (Number.isNaN(+published)) return 'Older';
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const publishedStart = Date.UTC(published.getUTCFullYear(), published.getUTCMonth(), published.getUTCDate());
  const days = Math.round((todayStart - publishedStart) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Earlier this week';
  return 'Older';
}

/** One news row in the site's table vocabulary: date, title + summary, lens
 *  link, source link, and a read cue. Group and source cells link back to
 *  /news filtered, so every cell is a working filter. */
function newsRowHtml(entry: ApiNews, now: Date): string {
  const source = entry.source?.trim() || NEWS_SOURCE;
  const group = entry.group?.trim() ?? '';
  const groupLabel = newsGroupLabel(group || undefined);
  const summary =
    entry.summary && entry.summary !== entry.title ? `<span class="entry-summary">${esc(entry.summary)}</span>` : '';
  const groupCell =
    group && groupLabel !== 'news'
      ? `<td class="c category-cell"><a href="/news/?group=${esc(group)}">${esc(groupLabel)}</a></td>`
      : `<td class="c category-cell">news</td>`;
  const sourceCell = `<td class="c author-cell"><a href="/news/?source=${esc(encodeURIComponent(source))}">${esc(source)}</a></td>`;
  const attrs = ` data-kind="news" data-text="${esc(`${entry.title} ${entry.summary} ${source}`.toLowerCase())}"`;
  return (
    `<tr${attrs}><td class="d">${esc(newsDate(entry, now))}</td>` +
    `<td class="entry-main"><a class="entry-title" href="${esc(entry.url)}">${esc(entry.title)}</a>` +
    `<span class="entry-kind">news</span>${summary}</td>` +
    `${groupCell}${sourceCell}` +
    `<td class="p"><a class="price news-read" href="${esc(entry.url)}">read ↗</a></td></tr>`
  );
}

/** `<tbody>` inner HTML for a page of news. `grouped` inserts a date-header
 *  row whenever the UTC day bucket changes; ungrouped is the homepage teaser.
 *  `now` is injectable so builds and tests pick the bucket boundary. */
export function newsRowsHtml(entries: ApiNews[], options: { grouped?: boolean; now?: Date } = {}): string {
  const grouped = options.grouped ?? false;
  const now = options.now ?? new Date();
  let html = '';
  let lastBucket: NewsBucket | '' = '';
  for (const entry of entries) {
    if (grouped) {
      const bucket = newsBucket(entry.published_at, now);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        html += `<tr class="news-day-head"><th colspan="5">${bucket}</th></tr>`;
      }
    }
    html += newsRowHtml(entry, now);
  }
  return html;
}

/** Page numbers for the pager: every page when short, otherwise first, last,
 *  and a window around the current one - same shape as the tools pager. */
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

/** `<nav class="pager">` inner HTML for one page of results. Every link is a
 *  real `/news/?...` URL, so paging works without JS; the page script
 *  intercepts plain clicks and fetches in place. */
export function newsPagerHtml(next: NewsParams, meta: ApiPageMeta): string {
  if (meta.total_pages <= 1) return '';
  const href = (page: number) => esc(newsHrefFor({ ...next, page }, true));
  const parts: string[] = [];
  parts.push(
    next.page > 1
      ? `<a href="${href(next.page - 1)}">prev</a>`
      : `<span class="disabled" aria-disabled="true">prev</span>`,
  );
  for (const item of pageItems(next.page, meta.total_pages)) {
    if (item === '...') {
      parts.push(`<span class="gap">...</span>`);
    } else {
      parts.push(
        `<a href="${href(item)}"${item === next.page ? ' aria-current="page"' : ''}>${item}</a>`,
      );
    }
  }
  parts.push(
    next.page < meta.total_pages
      ? `<a href="${href(next.page + 1)}">next</a>`
      : `<span class="disabled" aria-disabled="true">next</span>`,
  );
  return parts.join('');
}
