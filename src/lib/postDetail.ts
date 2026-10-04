/** Client-side API-post detail renderer. Shared by /entry/?s=<slug>, the
 *  prerendered /entry/<slug> shell, and the 404 fallback - a post must open
 *  no matter when it was created, and the static build cannot know slugs
 *  that do not exist yet. */

import { SITE } from '../data/site';
import { ApiError, deletePost, fetchPost, postSummary } from './api';
import type { ApiPost, ApiPostItem } from './api';
import { claims, clearPair, ensurePair, handleExpiredSession, isTokenExpired, storedPair } from './session';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function note(text: string, cls = 'muted'): HTMLParagraphElement {
  return el('p', cls, text);
}

function renderItem(item: ApiPostItem): HTMLElement {
  if (item.kind === 'link') {
    const p = el('p', 'item-link');
    const a = el('a');
    a.href = item.url ?? '#';
    a.textContent = item.url ?? '';
    p.append(a);
    return p;
  }
  if (item.kind === 'file') {
    const wrap = el('div');
    const head = el('p', 'item-file');
    head.append(el('span', 'price', item.filename ?? 'file'), ' ', el('span', 'muted', item.mime ?? 'text/markdown'));
    wrap.append(head);
    if (item.body_text) wrap.append(el('pre', 'wrap', item.body_text));
    return wrap;
  }
  return el('pre', 'wrap', item.body_text ?? '');
}

function renderPost(post: ApiPost): DocumentFragment {
  const frag = document.createDocumentFragment();
  frag.append(el('h1', undefined, post.title));
  const summary = postSummary(post);
  if (summary !== post.title) frag.append(el('p', 'detail-summary', summary));

  const attrs = el('div', 'attrs');
  attrs.append(el('span', 'kind', 'post'));
  for (const cat of post.categories) {
    const span = el('span');
    const link = el('a', undefined, cat.name);
    link.href = `/s/${encodeURIComponent(cat.slug)}`;
    span.append(link);
    attrs.append(span);
  }
  frag.append(attrs);

  const updated = new Date(post.updated_at);
  const date = Number.isNaN(+updated)
    ? post.updated_at
    : updated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  frag.append(note(`updated ${date}`, 'small'));

  const actions = el('div', 'detail-actions');
  const share = el('button', 'copy-button', 'Copy post link');
  share.type = 'button';
  const shareStatus = el('span', 'small');
  shareStatus.setAttribute('aria-live', 'polite');
  share.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      shareStatus.textContent = 'Link copied.';
    } catch {
      shareStatus.textContent = 'Copy unavailable — copy the page address from your browser.';
    }
  });
  actions.append(share, shareStatus);
  frag.append(actions);

  if (post.items?.length) {
    for (const item of post.items) frag.append(renderItem(item));
  } else {
    frag.append(note('This post has no content items yet.'));
  }
  return frag;
}

function renderError(root: HTMLElement, error: unknown): void {
  root.replaceChildren(
    el('h1', undefined, 'post not available'),
    error instanceof ApiError && error.status === 404
      ? note('This post does not exist (or was deleted).')
      : note('Could not load this post from the API - try again later.'),
    note('back to the ', 'small'),
  );
  const back = root.lastElementChild as HTMLParagraphElement;
  const a = el('a', undefined, 'list');
  a.href = '/';
  back.append(a, '.');
}

async function deleteFlow(slug: string, line: HTMLElement): Promise<void> {
  if (!confirm('Delete this post? This cannot be undone.')) return;
  line.textContent = 'deleting…';
  // A dead access token gets one silent refresh before the call.
  const pair = await ensurePair();
  if (!pair?.access_token) {
    // The delete button renders only for a logged-in owner, so a dead pair
    // here is always an expired session: clear it and force a fresh login.
    handleExpiredSession();
    return;
  }
  try {
    await deletePost(slug, pair.access_token);
    location.href = '/';
  } catch (error) {
    if (isTokenExpired(error)) {
      handleExpiredSession();
      return;
    }
    line.textContent =
      error instanceof ApiError && error.status === 403
        ? 'only the author can delete this post.'
        : error instanceof ApiError
          ? error.message
          : 'could not reach the API - the post is not deleted.';
    line.className = 'small err';
  }
}

/** Fetches and renders the post under `slug` into `root`, replacing whatever
 *  placeholder the page shipped. Shows a delete action when the logged-in
 *  account owns the post. */
export async function mountPostDetail(root: HTMLElement, slug: string): Promise<void> {
  root.replaceChildren(note('loading post…'));
  let post: ApiPost;
  try {
    post = await fetchPost(slug);
  } catch (error) {
    renderError(root, error);
    return;
  }
  root.replaceChildren(renderPost(post));
  document.title = `${post.title} - ${SITE.name}`;

  const hadTokens = !!storedPair();
  const pair = await ensurePair();
  const mine = pair?.access_token && claims(pair.access_token)?.sub === post.author_id;
  if (!mine) {
    // Tokens were stored but the refresh died - drop the corpse.
    if (hadTokens && pair === null) clearPair();
    return;
  }
  const line = note('', 'small');
  const del = el('button', 'linkbutton', 'delete');
  del.type = 'button';
  del.addEventListener('click', () => void deleteFlow(slug, line));
  line.append(del, ' · posted by you');
  root.append(line);
}
