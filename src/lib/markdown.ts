function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value, 'https://swegai.invalid');
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function renderInline(source: string): string {
  const pattern = /(`+)(.+?)\1|!?\[([^\]]*)\]\(([^)\s]+)(?:\s+[^)]*)?\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|(?<![\w])\*([^*]+)\*(?![\w])|(?<![\w])_([^_]+)_(?![\w])/g;
  let html = '';
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(source.slice(cursor, index));
    if (match[1]) html += `<code>${escapeHtml(match[2].replace(/\n/g, ' '))}</code>`;
    else if (match[3] !== undefined) {
      const href = match[0].startsWith('!') ? null : safeHref(match[4]);
      html += href
        ? `<a href="${escapeHtml(href)}">${renderInline(match[3])}</a>`
        : renderInline(match[3]);
    } else if (match[5] || match[6]) html += `<strong>${escapeHtml(match[5] ?? match[6])}</strong>`;
    else if (match[7]) html += `<del>${escapeHtml(match[7])}</del>`;
    else html += `<em>${escapeHtml(match[8] ?? match[9])}</em>`;
    cursor = index + match[0].length;
  }

  return html + escapeHtml(source.slice(cursor));
}

function isListItem(line: string): boolean {
  return /^\s*(?:[-+*]|\d+[.)])\s+/.test(line);
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

/** Plain-text excerpt for compact previews; full Markdown still renders below. */
export function markdownToPlainText(source: string): string {
  return source
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Render common Markdown from the API without trusting embedded HTML or URLs. */
export function markdownToSafeHtml(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }

    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1];
      const code: string[] = [];
      index++;
      while (index < lines.length && !new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(lines[index])) {
        code.push(lines[index++]);
      }
      if (index < lines.length) index++;
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index++;
      continue;
    }

    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
      blocks.push('<hr>');
      index++;
      continue;
    }

    if (index + 1 < lines.length && isTableSeparator(lines[index + 1]) && line.includes('|')) {
      const header = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(tableCells(lines[index++]));
      }
      const head = header.map((cell) => `<th>${renderInline(cell)}</th>`).join('');
      const body = rows.map((row) => `<tr>${header.map((_, cell) => `<td>${renderInline(row[cell] ?? '')}</td>`).join('')}</tr>`).join('');
      blocks.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    if (isListItem(line)) {
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      const items: string[] = [];
      while (index < lines.length && isListItem(lines[index])) {
        const current = lines[index].replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '');
        const continuation: string[] = [current];
        index++;
        while (index < lines.length && /^\s{2,}\S/.test(lines[index])) {
          continuation.push(lines[index++].trim());
        }
        items.push(`<li>${renderInline(continuation.join(' '))}</li>`);
      }
      blocks.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      }
      blocks.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`);
      continue;
    }

    const paragraph = [line];
    index++;
    while (index < lines.length && lines[index].trim() && !/^\s*(?:`{3,}|~{3,}|#{1,6}\s|>|(?:[-*_]\s*){3,})/.test(lines[index]) && !isListItem(lines[index])) {
      paragraph.push(lines[index++]);
    }
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return blocks.join('\n');
}
