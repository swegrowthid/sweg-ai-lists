/** Client-side renderer for news rows. Produces the exact markup EntryRows
 *  emits for `newsToRow`, so a browser refresh paints rows identical to the
 *  build-time snapshot. String building only - no DOM access here. */

import { NEWS_SOURCE, newsToRow } from './api';
import type { ApiNews } from './api';

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export function newsRowsHtml(entries: ApiNews[], limit?: number): string {
  const slice = limit === undefined ? entries : entries.slice(0, limit);
  return slice
    .map((entry) => {
      const row = newsToRow(entry);
      const attrs = Object.entries(row.attrs)
        .map(([key, value]) => ` ${key}="${esc(value)}"`)
        .join('');
      const summary =
        row.summary && row.summary !== row.title ? `<span class="entry-summary">${esc(row.summary)}</span>` : '';
      return (
        `<tr${attrs}><td class="d">${esc(row.date)}</td>` +
        `<td class="entry-main"><a class="entry-title" href="${esc(row.url)}">${esc(row.title)}</a>` +
        `<span class="entry-kind">news</span>${summary}</td>` +
        `<td class="c category-cell"><a href="/news">digest</a></td>` +
        `<td class="c author-cell">${esc(NEWS_SOURCE)}</td>` +
        `<td class="p"><span class="price">news</span></td></tr>`
      );
    })
    .join('');
}
