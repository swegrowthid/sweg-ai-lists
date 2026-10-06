/** Single import point for the sweg-ai API. Pages call these functions and render
 *  the result; no page hand-rolls fetch, headers, timeouts, or error text.
 *  Nothing here touches the DOM - shapes in, rows out. */

import { z } from 'astro/zod';

/** Build-time override: `PUBLIC_SWEG_API_BASE=http://127.0.0.1:8080 bun run build`.
 *  Defaults to the live host so the static build works with no env set.
 *  In `astro dev` the browser calls same-origin `/api` instead - the dev
 *  server proxies it to this base (see astro.config.mjs), so localhost
 *  never hits the API's CORS allowlist. Server-side code always uses the
 *  absolute base: Node fetch needs a full URL. */
export const API_BASE =
  !import.meta.env.SSR && import.meta.env.DEV
    ? '/api'
    : (import.meta.env?.PUBLIC_SWEG_API_BASE as string | undefined)?.replace(/\/+$/, '') ||
      'https://api.ai-sweg.my.id';

/** Every request is aborted after this long. Pages treat any throw as "API
 *  unavailable" and render an empty list, so a slow or dead API can never
 *  hang the build. */
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
  /** Null for top-level categories; the parent's slug for derivatives (max two levels). */
  parent_slug: z.string().nullable().optional(),
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
  /** Username of the author, joined from users at read time. Absent on
   *  older API responses; callers fall back to a truncated author_id. */
  author_username: z.string().optional(),
  categories: z.array(CategorySchema),
  /** Sent by POST /posts and GET /posts/{slug}; the list endpoint omits it. */
  items: z.array(PostItemSchema).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

const NewsSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** External link to the source post; news has no local detail page. */
  url: z.string(),
  /** May be the empty string - rows then render title only. */
  summary: z.string(),
  /** Midnight UTC of the source card's date; treat as a date, not an instant. */
  published_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const ToolSchema = z.object({
  /** Source-table id, PREFIX-NNN: P = providers, CA = coding-agents, ADE = ade. */
  id: z.string(),
  category: z.string(),
  name: z.string(),
  /** Empty string when the source cell is not a link. */
  website: z.string(),
  website_label: z.string(),
  status: z.string(),
  /** YYYY-MM-DD calendar date from the source table, or raw text if exotic. */
  updated: z.string(),
  /** Providers only. */
  top_up: z.boolean().optional(),
  subscribe: z.boolean().optional(),
  min_spend: z.string().optional(),
  /** ADE only: entries from the source "AI Features" cell. */
  ai_features: z.array(z.string()).optional(),
});

const ToolCategorySchema = z.object({
  slug: z.string(),
  name: z.string(),
  prefix: z.string(),
  source_file: z.string(),
  source_url: z.string(),
  count: z.number(),
});

/** Paging metadata the server applies to a list page. */
const PageMetaSchema = z.object({
  /** 1-based page number being served. */
  page: z.number(),
  /** Page size the server applied, after its own cap. */
  per_page: z.number(),
  /** Rows matching the filter across every page. */
  total: z.number(),
  /** Pages `total` makes at `per_page`; 0 when nothing matched. */
  total_pages: z.number(),
});

const ToolListSchema = z.object({
  /** Rows are parsed one by one in fetchTools, so a single bad row never
   *  costs the client the whole page. */
  data: z.array(z.unknown()),
  meta: PageMetaSchema,
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
export type ApiNews = z.infer<typeof NewsSchema>;
export type ApiTool = z.infer<typeof ToolSchema>;
export type ApiToolCategory = z.infer<typeof ToolCategorySchema>;
export type ApiPageMeta = z.infer<typeof PageMetaSchema>;

/** One page of the tools catalog plus the paging metadata for the rest. */
export interface ApiToolPage {
  data: ApiTool[];
  meta: ApiPageMeta;
}
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
  /** Optional - the API generates one from the title when omitted. */
  slug?: string;
  title: string;
  /** Slug of an existing category - top-level or one of its derivatives. */
  category: string;
  /** Array order is display order. Send only the fields owned by each `kind`. */
  items: { kind: ItemKind; body_text?: string; url?: string; filename?: string; mime?: string }[];
}

/** A row shaped for EntryRows.astro: `{ url, title, summary, category, author, display, date, attrs? }`. */
export interface ApiRow {
  url: string;
  title: string;
  summary: string;
  category: string;
  /** Display text for the category cell; defaults to CATEGORY_NAME/category. */
  categoryLabel?: string;
  /** Overrides the default `/s/<category>` link - news points at `/news`. */
  categoryHref?: string;
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

/** Public digest feed, newest `published_at` first. Read-only: the API fills it
 *  by daily sync, so callers only ever GET it. */
export async function fetchNews(fetchImpl?: FetchLike): Promise<ApiNews[]> {
  return toRows(NewsSchema, await apiFetch<unknown>('/news', { fetchImpl }), '/news');
}

export interface ToolQuery {
  /** Group name: all, provider, coding-agent or ade. The source slugs and id
   *  prefixes (providers, coding-agents, p, ca, ...) resolve to the same rows. */
  group?: string;
  /** Older spelling of `group`; the API still reads it. */
  category?: string;
  /** Case-insensitive substring of the tool name. */
  q?: string;
  /** Sort key: `name` or `updated`. Empty keeps the source catalog order. */
  sort?: string;
  /** Sort direction, `asc` or `desc`. Only read when `sort` is set. */
  order?: string;
  /** 1-based page number. */
  page?: number;
  /** Rows per page. The API rejects anything above 100. */
  perPage?: number;
}

/** One page of the tools catalog. The server does the grouping, sorting and
 *  paging; `meta` counts every row the filter matches, not just this page, so a
 *  caller can drive a pager without a second request. */
export async function fetchTools(query: ToolQuery = {}, fetchImpl?: FetchLike): Promise<ApiToolPage> {
  const params = new URLSearchParams();
  if (query.group) params.set('group', query.group);
  if (query.category) params.set('category', query.category);
  if (query.q) params.set('q', query.q);
  if (query.sort) params.set('sort', query.sort);
  if (query.order) params.set('order', query.order);
  if (query.page) params.set('page', String(query.page));
  if (query.perPage) params.set('per_page', String(query.perPage));
  const search = params.toString();
  const path = search ? `/tools?${search}` : '/tools';
  const raw = toOne(ToolListSchema, await apiFetch<unknown>(path, { fetchImpl }), '/tools');
  return { data: toRows(ToolSchema, raw.data, '/tools'), meta: raw.meta };
}

export async function fetchToolCategories(fetchImpl?: FetchLike): Promise<ApiToolCategory[]> {
  return toRows(ToolCategorySchema, await apiFetch<unknown>('/tools/categories', { fetchImpl }), '/tools/categories');
}

export async function fetchUsers(token: string, fetchImpl?: FetchLike): Promise<ApiUser[]> {
  return toRows(UserSchema, await apiFetch<unknown>('/users', { token, fetchImpl }), '/users');
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

/** Changes the password; the API revokes all refresh tokens. Responds 204. */
export async function updatePassword(
  currentPassword: string,
  newPassword: string,
  token: string,
  fetchImpl?: FetchLike,
): Promise<void> {
  await apiFetch<void>('/users/password', {
    method: 'PUT',
    body: { current_password: currentPassword, new_password: newPassword },
    token,
    fetchImpl,
  });
}

// --- writes ------------------------------------------------------------------

export async function createPost(input: CreatePostInput, token: string, fetchImpl?: FetchLike): Promise<ApiPost> {
  return toOne(
    PostSchema,
    await apiFetch<unknown>('/posts', { method: 'POST', body: input, token, fetchImpl }),
    '/posts',
  );
}

/** Owner-only: the API answers 403 for someone else's post. 204, nothing back. */
export async function deletePost(slug: string, token: string, fetchImpl?: FetchLike): Promise<void> {
  const path = `/posts/${encodeURIComponent(slug)}`;
  await apiFetch<void>(path, { method: 'DELETE', token, fetchImpl });
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
    url: `/entry/?s=${encodeURIComponent(post.slug)}`,
    title: post.title,
    summary,
    category,
    author: post.author_username || post.author_id.slice(0, 8),
    display: 'post',
    date: postDate(post),
    attrs: {
      'data-kind': 'post',
      'data-category': category,
      'data-text': `${post.title} ${summary}`.toLowerCase(),
    },
  };
}

/** `published_at` is midnight UTC, a calendar date: pin UTC so the rendered
 *  "Sep 27" cannot shift a day between server build and browser timezone. */
export function newsDate(entry: ApiNews): string {
  const published = new Date(entry.published_at);
  if (Number.isNaN(+published)) return '';
  return published.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const NEWS_SOURCE = 'zainfathoni.com';

/** `updated` is a YYYY-MM-DD calendar date: pin UTC like newsDate. Exotic
 *  formats the parser cannot read fall back to the raw source text. */
export function toolDate(tool: ApiTool): string {
  const parsed = new Date(tool.updated);
  if (Number.isNaN(+parsed)) return tool.updated;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Domain line under the name: the site label, then whatever the category's
 *  extra columns say (provider terms, ADE feature list). */
export function toolSummary(tool: ApiTool): string {
  const parts = [tool.website_label];
  if (tool.top_up) parts.push('top up');
  if (tool.subscribe) parts.push('subscribe');
  if (tool.min_spend) parts.push(`min ${tool.min_spend}`);
  if (tool.ai_features?.length) parts.push(tool.ai_features.join(', '));
  return parts.filter(Boolean).join(' · ');
}

/** A news entry as an EntryRows row. Title links straight out to the source
 *  post; the category slot points back to `/news` instead of a `/s/` shelf. */
export function newsToRow(entry: ApiNews): ApiRow {
  return {
    url: entry.url,
    title: entry.title,
    summary: entry.summary,
    category: 'digest',
    categoryHref: '/news',
    author: NEWS_SOURCE,
    display: 'news',
    date: newsDate(entry),
    attrs: {
      'data-kind': 'news',
      'data-text': `${entry.title} ${entry.summary}`.toLowerCase(),
    },
  };
}

/** Display names for the three fixed tool categories (slug -> label). The
 *  /tools filter select is hardcoded to these plus "all". */
export const TOOL_CATEGORY_NAME: Record<string, string> = {
  providers: 'Providers',
  'coding-agents': 'Coding Agents',
  ade: 'AI Dev Environment',
};

/** Group query value for each source category slug. The API reads a slug and a
 *  short group name alike; the /tools URL and its select use the short one. */
export const TOOL_GROUP_VALUE: Record<string, string> = {
  providers: 'provider',
  'coding-agents': 'coding-agent',
  ade: 'ade',
};

/** A tool as an EntryRows row. Title links out to the tool's website; the
 *  category slot links back to `/tools` pre-filtered to that group. */
export function toolToRow(tool: ApiTool, categoryLabel?: string): ApiRow {
  const summary = toolSummary(tool);
  return {
    url: tool.website,
    title: tool.name,
    summary,
    category: tool.category,
    categoryLabel,
    categoryHref: `/tools/?group=${encodeURIComponent(TOOL_GROUP_VALUE[tool.category] ?? tool.category)}`,
    author: tool.status,
    display: 'tool',
    date: toolDate(tool),
    attrs: {
      'data-kind': 'tool',
      'data-tool-id': tool.id,
      'data-category': tool.category,
      'data-text': tool.name.toLowerCase(),
    },
  };
}
