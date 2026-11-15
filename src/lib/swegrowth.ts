/** Sign in with a swegrowth.id account. swegrowth.id runs on Supabase Auth
 *  (Google): start gates the serving origin, mints a PKCE pair, parks the
 *  verifier in localStorage, and leaves for Google; the callback spends the
 *  single-use pending record on the code exchange, then trades the Supabase
 *  session for this site's own token pair at POST /auth/supabase. No Supabase
 *  client library. Every export is browser-side: location, storage, fetch. */

import { CANONICAL_ORIGIN } from '../data/site';
import { ApiError, exchangeSupabase } from './api';
import type { TokenPair } from './api';
import { savePair } from './session';
import type { NextCandidate } from './nav';

/** Build-time settings. Both unset hides the button: see `swegrowthEnabled`. */
const SUPABASE_URL = ((import.meta.env.PUBLIC_SWEGROWTH_SUPABASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
const SUPABASE_KEY = (import.meta.env.PUBLIC_SWEGROWTH_SUPABASE_KEY as string | undefined) ?? '';

export const swegrowthEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** The page Supabase sends the browser back to. Must be in the swegrowth.id
 *  project's Auth > URL Configuration > Redirect URLs. */
export const CALLBACK_PATH = '/login/swegrowth';

const PENDING_KEY = 'swe-ai-swegrowth-pending';
const PENDING_TTL_MS = 280_000;

export interface PendingAuth {
  verifier: string;
  next: string;
  at: number;
}

export interface LocationLike {
  origin: string;
  pathname: string;
  search: string;
}

export type ServingOrigin =
  | { readonly kind: 'canonical'; readonly origin: string }
  | { readonly kind: 'loopback'; readonly origin: string; readonly host: string }
  | { readonly kind: 'foreign'; readonly origin: string; readonly host: string };

export type CanonicalDecision =
  | { readonly _tag: 'proceed' }
  | { readonly _tag: 'redirect'; readonly target: string };

export interface QueryParams {
  next?: string;
  sso?: string;
  code?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
}

export interface ProviderErrorParams {
  error: string;
  error_code?: string;
  error_description?: string;
}

export type AuthCode = string;

export type Landing =
  | { readonly _tag: 'failed'; readonly params: ProviderErrorParams }
  | { readonly _tag: 'missing' }
  | { readonly _tag: 'code'; readonly code: AuthCode };

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
}

/** The only error type crossing the auth surface to pages. `message` is
 *  provider/API-controlled text — render via textContent ONLY. `next` feeds
 *  the /login?next=<enc> back-link. */
export class SwegrowthError extends Error {
  readonly kind: 'provider' | 'exchange' | 'incomplete';
  readonly next?: string;

  constructor(kind: 'provider' | 'exchange' | 'incomplete', message: string, next?: string) {
    super(message);
    this.name = 'SwegrowthError';
    this.kind = kind;
    this.next = next;
  }
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Loopback hostnames only — callers pass `location.hostname`, so the value
 *  carries no port and `import.meta.env.DEV` is never consulted. Bracketed
 *  IPv6 like '[::1]' is tolerated. */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  const bare = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  if (bare === 'localhost' || bare === '::1' || bare === '0.0.0.0') return true;
  if (bare.endsWith('.localhost')) return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare);
}

/** 'proceed' on the canonical origin or any loopback host; anything else is
 *  redirected to canonical with pathname+search verbatim and 'sso=1' appended
 *  iff the search carries no `sso` key at all (the key, not the value —
 *  sso=0 cannot shadow the resume marker). */
export function resolveAuthOrigin(loc: LocationLike, canonical: string): CanonicalDecision {
  let parsed: URL;
  let canon: string;
  try {
    parsed = new URL(loc.origin);
    canon = new URL(canonical).origin;
  } catch {
    throw new Error('unparseable origin');
  }
  const host = parsed.hostname;
  if (parsed.origin === canon || isLoopbackHost(host)) return { _tag: 'proceed' };
  const pathname = loc.pathname || '/';
  const hasSso = new URLSearchParams(loc.search).has('sso');
  const sep = loc.search ? '&' : '?';
  const target = `${canon}${pathname}${loc.search}${hasSso ? '' : `${sep}sso=1`}`;
  return { _tag: 'redirect', target };
}

export function parseSearch(search: string): QueryParams {
  const p = new URLSearchParams(search);
  const q: QueryParams = {};
  const next = p.get('next');
  if (next !== null) q.next = next;
  const sso = p.get('sso');
  if (sso !== null) q.sso = sso;
  const code = p.get('code');
  if (code !== null) q.code = code;
  const error = p.get('error');
  if (error !== null) q.error = error;
  const ec = p.get('error_code');
  if (ec !== null) q.error_code = ec;
  const ed = p.get('error_description');
  if (ed !== null) q.error_description = ed;
  return q;
}

/** Any provider error key wins over a code — a denied round-trip never
 *  reaches the exchange. */
export function classifyLanding(q: QueryParams): Landing {
  if (q.error !== undefined || q.error_code !== undefined || q.error_description !== undefined) {
    return {
      _tag: 'failed',
      params: {
        error: q.error ?? '',
        ...(q.error_code !== undefined ? { error_code: q.error_code } : {}),
        ...(q.error_description !== undefined ? { error_description: q.error_description } : {}),
      },
    };
  }
  if (q.code) return { _tag: 'code', code: q.code };
  return { _tag: 'missing' };
}

function stripParams(keys: string[]): void {
  try {
    const url = new URL(location.href);
    for (const key of keys) url.searchParams.delete(key);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // replaceState unsupported — non-fatal by design
  }
}

/** Callback page: drop ?code/?error/?error_code/?error_description before paint. */
export function stripAuthParams(): void {
  stripParams(['code', 'error', 'error_code', 'error_description']);
}

/** Auth entry mount: consume the sso=1 resume marker; it is never a nav target. */
export function stripResumeMarker(): void {
  stripParams(['sso']);
}

export async function mintPkce(): Promise<PkcePair> {
  if (!crypto?.getRandomValues || !crypto?.subtle?.digest) {
    throw new SwegrowthError('incomplete', 'this browser cannot run swegrowth.id sign-in.');
  }
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: base64url(digest) };
}

function shapePending(raw: string | null): PendingAuth | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingAuth>;
    if (typeof p?.verifier !== 'string' || !p.verifier) return null;
    if (typeof p?.next !== 'string') return null;
    if (p.at !== undefined && typeof p.at !== 'number') return null;
    return { verifier: p.verifier, next: p.next, at: typeof p.at === 'number' ? p.at : 0 };
  } catch {
    return null;
  }
}

function fresh(p: PendingAuth): boolean {
  return p.at > 0 && Date.now() - p.at <= PENDING_TTL_MS;
}

function writePending(p: PendingAuth): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

/** Read without delete — provider-error branch peeks next this way. */
export function peekPending(): PendingAuth | null {
  try {
    const p = shapePending(localStorage.getItem(PENDING_KEY));
    return p && fresh(p) ? p : null;
  } catch {
    return null;
  }
}

/** Read + delete exactly once, BEFORE any exchange attempt. */
export function consumePending(): PendingAuth | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    const p = shapePending(raw);
    return p && fresh(p) ? p : null;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(pkce: PkcePair, loc: LocationLike): string {
  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect_to', `${loc.origin}${CALLBACK_PATH}`);
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 's256');
  return url.toString();
}

/** Order is load-bearing: gate → mint → write → navigate. The pending record
 *  must exist before the verifier can leave, so a storage failure aborts
 *  before the authorize navigation. */
export async function startSwegrowthSignIn(next: NextCandidate): Promise<void> {
  if (!swegrowthEnabled) {
    throw new SwegrowthError('incomplete', 'swegrowth.id sign-in is not configured on this build.');
  }
  const decision = resolveAuthOrigin(location, CANONICAL_ORIGIN);
  if (decision._tag === 'redirect') {
    location.assign(decision.target);
    return;
  }
  const pkce = await mintPkce();
  try {
    writePending({ verifier: pkce.verifier, next, at: Date.now() });
  } catch {
    throw new SwegrowthError('incomplete', 'this browser cannot keep the sign-in state.');
  }
  location.assign(buildAuthorizeUrl(pkce, location));
}

export async function exchangePkce(code: AuthCode, verifier: string): Promise<SupabaseTokenResponse> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new SwegrowthError('exchange', 'could not reach swegrowth.id. try again.');
  }
  if (!res.ok) {
    throw new SwegrowthError('exchange', 'swegrowth.id did not accept this sign-in. try again.');
  }
  let session: SupabaseTokenResponse;
  try {
    session = (await res.json()) as SupabaseTokenResponse;
  } catch {
    throw new SwegrowthError('exchange', 'swegrowth.id sent back an unreadable session.');
  }
  if (typeof session?.access_token !== 'string' || !session.access_token ||
      typeof session?.refresh_token !== 'string' || !session.refresh_token) {
    throw new SwegrowthError('exchange', 'swegrowth.id sent back no usable session.');
  }
  return session;
}

/** GoTrue's /logout authenticates by the session JWT in the Authorization
 *  header — the access token. Fire-and-forget: never awaited, never throws. */
export function discardSupabaseSession(accessToken: string): void {
  void fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
}

/** The page calls this ONLY on Landing.code. Consumes the pending record
 *  before the exchange attempt, then exchange → backend pair → save →
 *  Supabase logout. Every failure folds into SwegrowthError carrying `next`;
 *  SwegrowthError is the single error channel to the page. */
export async function finishSwegrowthSignIn(code: AuthCode): Promise<{ next: NextCandidate }> {
  const pending = consumePending();
  if (!pending) {
    throw new SwegrowthError('incomplete', 'this sign-in link is incomplete or was already used.');
  }
  const next = pending.next || '/';
  try {
    const session = await exchangePkce(code, pending.verifier);
    const pair: TokenPair = await exchangeSupabase(session.access_token);
    savePair(pair);
    discardSupabaseSession(session.access_token);
    return { next };
  } catch (error) {
    if (error instanceof SwegrowthError) {
      throw new SwegrowthError(error.kind, error.message, next);
    }
    if (error instanceof ApiError) {
      throw new SwegrowthError('exchange', error.message, next);
    }
    throw new SwegrowthError('exchange', 'could not finish the swegrowth.id sign-in.', next);
  }
}
