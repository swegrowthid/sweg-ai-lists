/** Internal navigation for inline scripts. Every script-driven redirect goes
 *  through `goInternal`, so one check is what keeps a crafted value from
 *  turning a redirect into an open redirect. */

/** A same-origin path: one leading slash, never protocol-relative ("//" or
 *  "/\"), no backslash anywhere (browsers fold it to a slash), no control
 *  characters. Slashes and query strings are fine. */
const INTERNAL_PATH = /^\/(?!\/)[^\u0000-\u001f\\]*$/;

/** Send the browser to an internal path. A value that fails the check is
 *  ignored on purpose: a blocked redirect must never fall through to some
 *  other target. */
export function goInternal(path: string): void {
  if (!INTERNAL_PATH.test(path)) return;
  location.assign(path);
}

/** A raw, untrusted `next` value as carried by URL params, storage records,
 *  and links. Data only — it becomes navigable solely through goInternal. */
export type NextCandidate = string;

/** Reduce an untrusted `next` value to a same-origin path candidate.
 *  Parses against location.origin: same-origin → pathname+search, anything
 *  else (foreign origin, scheme, protocol-relative, malformed) → '/'.
 *  The result is still only a candidate — goInternal applies INTERNAL_PATH
 *  at navigation time. Client-side only; never call during SSR. */
export function safeNext(raw: string | null | undefined): NextCandidate {
  if (!raw) return '/';
  try {
    const url = new URL(raw, location.origin);
    return url.origin === location.origin ? `${url.pathname}${url.search}` : '/';
  } catch {
    return '/';
  }
}
