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
