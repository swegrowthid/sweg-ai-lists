/** HTML renderer for the homepage's top tools-by-thumbs rows. The static page and
 *  its API refresh share this so both render the same escaped markup. */

import { TOOL_CATEGORY_NAME, toolToRow } from './api';
import type { ApiTool } from './api';

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export function popularToolsRowsHtml(tools: ApiTool[]): string {
  return tools
    .map((tool) => {
      const row = toolToRow(tool, TOOL_CATEGORY_NAME[tool.category]);
      const attrs = Object.entries(row.attrs)
        .map(([key, value]) => ` ${key}="${esc(value)}"`)
        .join('');
      const title = row.url
        ? `<a class="entry-title" href="${esc(row.url)}">${esc(row.title)}</a>`
        : `<span class="entry-title">${esc(row.title)}</span>`;
      const summary =
        row.summary && row.summary !== row.title ? `<span class="entry-summary">${esc(row.summary)}</span>` : '';

      return (
        `<tr${attrs}><td class="d">${esc(row.date)}</td>` +
        `<td class="entry-main">${title}<span class="entry-kind">tool</span>${summary}</td>` +
        `<td class="c category-cell"><a href="${esc(row.categoryHref ?? `/tools/?group=${encodeURIComponent(tool.category)}`)}">${esc(row.categoryLabel ?? tool.category)}</a></td>` +
        `<td class="c author-cell">${esc(row.author)}</td>` +
        `<td class="p"><span class="price">tool</span></td>` +
        `<td class="c votes-cell"><span class="chip vote-chip vote-count" title="${tool.votes} ${tool.votes === 1 ? 'thumb' : 'thumbs'}">` +
        '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59A1.99 1.99 0 0 0 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" /></svg>' +
        `<span aria-hidden="true">${tool.votes}</span><span class="sr-only">${tool.votes} ${tool.votes === 1 ? 'thumb' : 'thumbs'}</span></span></td></tr>`
      );
    })
    .join('');
}
