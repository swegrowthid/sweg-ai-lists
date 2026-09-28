/** Browser session helpers: the token pair lives in localStorage and the
 *  access token is a JWT whose payload carries `sub` (user id) and `username`.
 *  Shared by pages that need to know who is logged in (profile, submit,
 *  post detail delete action). Nothing here renders. */

import { refresh } from './api';
import type { TokenPair } from './api';

export const TOKEN_KEY = 'sweg-ai-tokens';

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

/** A live pair, or null. A dead access token gets one silent refresh -
 *  the refresh token is what keeps the session, not the access token. */
export async function ensurePair(): Promise<TokenPair | null> {
  const pair = storedPair();
  if (!pair?.access_token) return null;
  const c = claims(pair.access_token);
  if (c?.exp && c.exp * 1000 > Date.now()) return pair;
  if (!pair.refresh_token) return null;
  try {
    const fresh = await refresh(pair.refresh_token);
    savePair(fresh);
    return fresh;
  } catch {
    return null;
  }
}
