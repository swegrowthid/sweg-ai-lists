/** Client-side renderer for post rows. Produces the exact markup EntryRows
 *  emits for `postToRow`, so a browser refresh paints rows identical to the
 *  build-time snapshot. String building only - no DOM access here. */

import { postToRow } from './api';
import type { ApiPost } from './api';

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export function postRowsHtml(posts: ApiPost[], extraAttrs?: (post: ApiPost) => Record<string, string>): string {
  return posts
    .map((post) => {
      const row = postToRow(post);
      const attrs = { ...row.attrs, ...(extraAttrs?.(post) ?? {}) };
      const attrText = Object.entries(attrs)
        .map(([key, value]) => ` ${key}="${esc(value)}"`)
        .join('');
      const summary =
        row.summary && row.summary !== row.title ? `<span class="entry-summary">${esc(row.summary)}</span>` : '';
      return (
        `<tr${attrText}><td class="d">${esc(row.date)}</td>` +
        `<td class="entry-main"><a class="entry-title" href="${esc(row.url)}">${esc(row.title)}</a>` +
        `<span class="entry-kind">${esc(row.attrs['data-kind'] ?? row.display)}</span>${summary}</td>` +
        `<td class="c category-cell"><a href="${esc(row.categoryHref ?? `/s/${row.category}`)}">${esc(row.categoryLabel ?? row.category)}</a></td>` +
        `<td class="c author-cell">${esc(row.author)}</td>` +
        `<td class="p"><span class="price">${esc(row.display)}</span></td></tr>`
      );
    })
    .join('');
}
