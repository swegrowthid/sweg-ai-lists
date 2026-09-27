/** Single import point for the sweg-ai API. Pages call these functions and render
 *  the result; no page hand-rolls fetch, headers, timeouts, or error text.
 *  Nothing here touches the DOM - shapes in, rows out. */

import { z } from 'astro/zod';

/** Build-time override: `PUBLIC_SWEG_API_BASE=http://127.0.0.1:8080 bun run build`.
 *  Defaults to the live host so the static build works with no env set. */
export const API_BASE =
  (import.meta.env?.PUBLIC_SWEG_API_BASE as string | undefined)?.replace(/\/+$/, '') ||
  'https://api.ai-sweg.my.id';

/** Every request is aborted after this long. Pages treat any throw as "API
 *  unavailable" and fall back to the local entries collection, so a slow or
 *  dead API can never hang the build. */
const TIMEOUT_MS = 8000;

/** An HTTP response the API refused, or a body that does not match the spec.
 *  `status` is 0 for the latter, so callers can tell "server said no" from
 *  "server answered garbage" without a second error type. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

// --- response shapes ---------------------------------------------------------
// The wire format is a remote contract, so each schema below is parsed once at
// the boundary and the exported interfaces are that schema's output type - see
// `toRows` / `toOne` for what happens when a response does not match.

const CategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const PostItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['markdown', 'text', 'link', 'file']),
  position: z.number(),
  body_text: z.string().optional(),
  url: z.string().optional(),
  filename: z.string().optional(),
  mime: z.string().optional(),
});

const PostSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  author_id: z.string(),
  categories: z.array(CategorySchema),
  /** Sent by POST /posts and GET /posts/{slug}; the list endpoint omits it. */
  items: z.array(PostItemSchema).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

const TokenPairSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
  refresh_expires_in: z.number(),
});

const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ApiCategory = z.infer<typeof CategorySchema>;
export type ApiPostItem = z.infer<typeof PostItemSchema>;
export type ApiPost = z.infer<typeof PostSchema>;
export type TokenPair = z.infer<typeof TokenPairSchema>;
export type ApiUser = z.infer<typeof UserSchema>;
export type ItemKind = ApiPostItem['kind'];

// --- request shapes ----------------------------------------------------------
// Built here, never parsed from a response, so they are plain types.

export interface CreateCategoryInput {
  slug: string;
  name: string;
}

export interface CreatePostInput {
  slug: string;
  title: string;
  /** Existing category slugs, one to eight. */
  categories: string[];
  /** Array order is display order. Send only the fields owned by each `kind`. */
  items: { kind: ItemKind; body_text?: string; url?: string; filename?: string; mime?: string }[];
}

/** A row shaped for EntryRows.astro: `{ url, title, summary, category, author, display, date, attrs? }`. */
export interface ApiRow {
  url: string;
  title: string;
  summary: string;
  category: string;
  author: string;
  display: string;
  date: string;
  attrs: Record<string, string>;
}

export type FetchLike = typeof fetch;

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** Object bodies are JSON-encoded; a string body is sent as-is. */
  body?: unknown;
  /** Bearer token for the endpoints that need one. */
  token?: string;
  /** Injected in place of the global fetch - lets callers and tests drive responses. */
  fetchImpl?: FetchLike;
}

/** DESIGN: fetch then map. This is the only function that talks to the network.
 *  - the path is joined exactly: `API_BASE + '/' + path`, never a trailing slash
 *  - non-2xx -> ApiError carrying the server's text/plain message
 *  - 204 -> undefined (logout carries no body)
 *  - a caller signal is combined with the deadline instead of replacing it
 *  - a timeout aborts with a TimeoutError DOMException, a dead socket fails
 *    with a TypeError, and malformed JSON throws a SyntaxError: all three
 *    propagate untouched so callers can tell them apart from an ApiError
 *  Nothing here is Node-only, so a bundled browser script can call it too. */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { token, fetchImpl = fetch, body, signal, headers: initHeaders, ...init } = opts;
  const url = `${API_BASE}/${path.replace(/^\/+|\/+$/g, '')}`;
  const headers = new Headers(initHeaders);
  const json = body !== undefined && typeof body !== 'string' && !(body instanceof URLSearchParams);
  if (json && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const deadline = AbortSignal.timeout(TIMEOUT_MS);

  const res = await fetchImpl(url, {
    ...init,
    headers,
    body: json ? JSON.stringify(body) : (body as BodyInit | undefined),
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });

  if (!res.ok) throw new ApiError(res.status, (await res.text()).trim());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A list endpoint keeps only the rows that match its schema: one malformed
 *  post must not take down a page that can still render the other rows. */
function toRows<T>(schema: z.ZodType<T>, raw: unknown, where: string): T[] {
  if (!Array.isArray(raw)) throw new ApiError(0, `unexpected response shape from ${where}`);
  return raw.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** A detail endpoint returns exactly one row, so a mismatch is an error. */
function toOne<T>(schema: z.ZodType<T>, raw: unknown, where: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError(0, `unexpected response shape from ${where}`);
  return parsed.data;
}

// --- reads -------------------------------------------------------------------

export async function fetchCategories(fetchImpl?: FetchLike): Promise<ApiCategory[]> {
  return toRows(CategorySchema, await apiFetch<unknown>('/categories', { fetchImpl }), '/categories');
}

export interface PostQuery {
  /** Category slug. */
  category?: string;
  /** Case-insensitive substring of the title. */
  q?: string;
}

export async function fetchPosts(query: PostQuery = {}, fetchImpl?: FetchLike): Promise<ApiPost[]> {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  if (query.q) params.set('q', query.q);
  const search = params.toString();
  const path = search ? `/posts?${search}` : '/posts';
  return toRows(PostSchema, await apiFetch<unknown>(path, { fetchImpl }), '/posts');
}

export async function fetchPost(slug: string, fetchImpl?: FetchLike): Promise<ApiPost> {
  const path = `/posts/${encodeURIComponent(slug)}`;
  return toOne(PostSchema, await apiFetch<unknown>(path, { fetchImpl }), path);
}

// --- auth --------------------------------------------------------------------

export async function login(identifier: string, password: string, fetchImpl?: FetchLike): Promise<TokenPair> {
  return toOne(
    TokenPairSchema,
    await apiFetch<unknown>('/auth/login', { method: 'POST', body: { identifier, password }, fetchImpl }),
    '/auth/login',
  );
}

export async function register(
  username: string,
  email: string,
  password: string,
  fetchImpl?: FetchLike,
): Promise<ApiUser> {
  return toOne(
    UserSchema,
    await apiFetch<unknown>('/users/register', { method: 'POST', body: { username, email, password }, fetchImpl }),
    '/users/register',
  );
}

/** Rotates the refresh token; the old one dies immediately. */
export async function refresh(refreshToken: string, fetchImpl?: FetchLike): Promise<TokenPair> {
  return toOne(
    TokenPairSchema,
    await apiFetch<unknown>('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken }, fetchImpl }),
    '/auth/refresh',
  );
}

/** Revokes the refresh token. Responds 204, so there is nothing to return. */
export async function logout(refreshToken: string, fetchImpl?: FetchLike): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken }, fetchImpl });
}

// --- writes ------------------------------------------------------------------

export async function createPost(input: CreatePostInput, token: string, fetchImpl?: FetchLike): Promise<ApiPost> {
  return toOne(
    PostSchema,
    await apiFetch<unknown>('/posts', { method: 'POST', body: input, token, fetchImpl }),
    '/posts',
  );
}

export async function createCategory(
  input: CreateCategoryInput,
  token: string,
  fetchImpl?: FetchLike,
): Promise<ApiCategory> {
  return toOne(
    CategorySchema,
    await apiFetch<unknown>('/categories', { method: 'POST', body: input, token, fetchImpl }),
    '/categories',
  );
}

// --- mappers -----------------------------------------------------------------
// Pure: a parsed post in, what a row renders out. No fetch, no DOM.

const SUMMARY_MAX = 140;

/** Opening of the first markdown/text item, otherwise the title. Runs of
 *  whitespace collapse so a snippet of body text reads as one line. */
export function postSummary(post: ApiPost): string {
  const body = post.items?.find((item) => item.kind === 'markdown' || item.kind === 'text')?.body_text;
  const text = (body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return post.title;
  return text.length > SUMMARY_MAX ? text.slice(0, SUMMARY_MAX).trimEnd() : text;
}

/** "Sep 26" - the same format every list row uses. */
export function postDate(post: ApiPost): string {
  const created = new Date(post.created_at);
  if (Number.isNaN(+created)) return '';
  return created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Posts must carry a category, but a sparse response should render as
 *  "uncategorized" rather than as an empty `/s/` link. */
const UNCATEGORIZED = 'uncategorized';

/** An API post as an EntryRows row. API rows are `display: 'post'` and carry
 *  `data-kind: post`, so the search page's kind filter can select them. */
export function postToRow(post: ApiPost): ApiRow {
  const summary = postSummary(post);
  const category = post.categories[0]?.slug ?? UNCATEGORIZED;
  return {
    url: `/entry/${post.slug}`,
    title: post.title,
    summary,
    category,
    author: post.author_id.slice(0, 8),
    display: 'post',
    date: postDate(post),
    attrs: {
      'data-kind': 'post',
      'data-category': category,
      'data-text': `${post.title} ${summary}`.toLowerCase(),
    },
  };
}
