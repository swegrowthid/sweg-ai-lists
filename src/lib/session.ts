/** Browser session helpers: the token pair lives in localStorage and the
 *  access token is a JWT whose payload carries `sub` (user id) and `username`.
 *  Shared by pages that need to know who is logged in (profile, submit,
 *  post detail delete action). Nothing here renders. */

import { ApiError, logout, refresh } from './api';
import type { TokenPair } from './api';

export const TOKEN_KEY = 'sweg-ai-tokens';

/** What ensurePair hands back: the live pair, or null for no live session. */
export type EnsuredPair = TokenPair | null;

export interface Claims {
  /** User id (uuid) - matches ApiPost.author_id and ApiUser.id. */
  sub?: string;
  username?: string;
  exp?: number;
}

export function storedPair(): TokenPair | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function savePair(pair: TokenPair): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(pair));
}

export function clearPair(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Clears the browser session immediately and revokes the refresh token. */
export function logoutSession(): void {
  const pair = storedPair();
  clearPair();
  if (pair?.refresh_token) void logout(pair.refresh_token).catch(() => {});
}

/** Decodes the JWT payload. Returns null on any malformed input - the token
 *  is client-held and untrusted, so a bad payload means "treat as logged out". */
export function claims(token: string): Claims | null {
  try {
    const body = token.split('.')[1];
    return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** One refresh per browser: serialized through a Web Lock so two tabs that go
 *  stale together do not race the same refresh token at POST /auth/refresh.
 *  The loser's replay would trip the backend's reuse detection and revoke the
 *  whole token family, logging BOTH tabs out - so the winner's fresh pair,
 *  visible in localStorage, is reused instead of refreshing twice.
 *  A transient failure is not proof the session is dead, so only a 401 (the
 *  refresh token itself is rejected) resolves to null; anything else throws
 *  for the caller to report as unreachable. */
async function rotate(staleRefresh: string): Promise<TokenPair | null> {
  const run = async (): Promise<TokenPair | null> => {
    const current = storedPair();
    if (current?.refresh_token && current.refresh_token !== staleRefresh) {
      // Another tab already rotated - adopt its pair when live, else continue
      // with ITS refresh token (the stale one this call started with is dead).
      const c = current.access_token ? claims(current.access_token) : null;
      if (c?.exp && c.exp * 1000 > Date.now()) return current;
    }
    if (!current?.refresh_token) return null;
    return rotateFresh(current.refresh_token);
  };
  const locks =
    typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  // ponytail: global lock, browsers without Web Locks keep a small two-tab
  // race; add a localStorage lease lock if that ever bites.
  if (locks) return locks.request('sweg-ai-refresh', run);
  return run();
}

async function rotateFresh(refreshToken: string): Promise<TokenPair | null> {
  try {
    const fresh = await refresh(refreshToken);
    savePair(fresh);
    return fresh;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** A live pair, or null. A dead access token gets one silent refresh -
 *  the refresh token is what keeps the session, not the access token. */
export async function ensurePair(): Promise<TokenPair | null> {
  const pair = storedPair();
  if (!pair?.access_token) return null;
  const c = claims(pair.access_token);
  if (c?.exp && c.exp * 1000 > Date.now()) return pair;
  if (!pair.refresh_token) return null;
  return rotate(pair.refresh_token);
}

/** A 401 that kills the session: the API rejected the token itself (expired
 *  or revoked). A credential answer - "invalid credentials", "current password
 *  is incorrect" - keeps the session; that message is the caller's to show. */
export function isTokenExpired(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  const reason = error.message.toLowerCase();
  return !(reason.includes('password') || reason.includes('credential'));
}

/** Best practice for a dead token: drop it and force a fresh login. Sends the
 *  browser once to /login?expired=1 with `next` for the return trip. Stays put
 *  on the login page itself, so the form can never loop. */
let expiryRedirecting = false;
export function handleExpiredSession(): void {
  clearPair();
  if (expiryRedirecting || location.pathname.startsWith('/login')) return;
  expiryRedirecting = true;
  const here = `${location.pathname}${location.search}`;
  location.assign(`/login?expired=1${here === '/' ? '' : `&next=${encodeURIComponent(here)}`}`);
}
