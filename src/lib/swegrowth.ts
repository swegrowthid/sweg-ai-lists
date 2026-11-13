/** Sign in with a swegrowth.id account. swegrowth.id runs on Supabase Auth
 *  (Google), so this sends the browser through that project's OAuth with PKCE,
 *  trades the returned code for a Supabase session, then trades that session
 *  for this site's own token pair at POST /auth/supabase. No Supabase client
 *  library: two fetches and a redirect. */

import { exchangeSupabase } from './api';
import type { TokenPair } from './api';

/** Build-time settings. Both unset hides the button: see `swegrowthEnabled`. */
const SUPABASE_URL = ((import.meta.env.PUBLIC_SWEGROWTH_SUPABASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
const SUPABASE_KEY = (import.meta.env.PUBLIC_SWEGROWTH_SUPABASE_KEY as string | undefined) ?? '';

export const swegrowthEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** The page Supabase sends the browser back to. Must be in the swegrowth.id
 *  project's Auth > URL Configuration > Redirect URLs. */
export const CALLBACK_PATH = '/login/swegrowth';

const PENDING_KEY = 'sweg-ai-swegrowth-pending';

interface Pending {
  verifier: string;
  next: string;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Leaves for Google via the swegrowth.id project. `next` is an internal path. */
export async function startSwegrowthSignIn(next: string): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, next } satisfies Pending));

  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect_to', `${location.origin}${CALLBACK_PATH}`);
  url.searchParams.set('code_challenge', base64url(digest));
  url.searchParams.set('code_challenge_method', 's256');
  location.assign(url.toString());
}

/** Why a return trip failed, in words the callback page can show as-is. */
export class SwegrowthError extends Error {}

/** Finishes the return trip: code -> Supabase session -> this site's pair.
 *  Returns the pair and where to go next. The Supabase session is only a
 *  ticket here, so it is signed out once spent; swegrowth.id itself keeps
 *  its own session untouched. */
export async function finishSwegrowthSignIn(params: URLSearchParams): Promise<{ pair: TokenPair; next: string }> {
  const denied = params.get('error_description') || params.get('error');
  if (denied) throw new SwegrowthError(`swegrowth.id said: ${denied}`);

  const code = params.get('code');
  let pending: Pending | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null');
  } catch {
    pending = null;
  }
  sessionStorage.removeItem(PENDING_KEY);
  if (!code || !pending?.verifier) throw new SwegrowthError('this sign-in link is incomplete or was already used.');

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ auth_code: code, code_verifier: pending.verifier }),
  });
  if (!res.ok) throw new SwegrowthError('swegrowth.id did not accept this sign-in. try again.');
  const session = (await res.json()) as { access_token?: string };
  if (!session.access_token) throw new SwegrowthError('swegrowth.id sent back no session. try again.');

  const pair = await exchangeSupabase(session.access_token);
  void fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${session.access_token}` },
  }).catch(() => {});
  return { pair, next: pending.next || '/' };
}
