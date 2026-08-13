/**
 * Helpers that depend on browser globals (`window`, `Date`, DOM nodes).
 *
 * Kept separate from the pure output formatting so tests can be explicit about
 * which globals they are standing up.
 */

// `URL.hostname` and `window.location.hostname` both keep the brackets around
// an IPv6 literal, so the bracketed form is the one that actually appears. The
// bare form is kept as a defensive alias.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Rewrites a preview URL so it is reachable from the operator's browser.
 *
 * Otter registers preview URLs from inside the stack, so they usually say
 * `localhost`. That is correct when the board is open on the same machine and
 * wrong when it is open from another host — there, `localhost` would resolve to
 * the operator's own machine rather than the one running the container.
 *
 * Unparseable input is returned untouched rather than thrown away, so a
 * malformed registration still shows the operator what was recorded.
 */
export function normalizePreviewUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    const isTargetLocal = LOCAL_HOSTNAMES.has(parsed.hostname);
    const browserHost = window.location.hostname;
    const browserIsLocal = LOCAL_HOSTNAMES.has(browserHost);
    if (isTargetLocal && browserHost && !browserIsLocal) {
      parsed.hostname = browserHost;
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/** Renders an ISO timestamp as a local clock time, or a placeholder if invalid. */
export function formatHistoryClock(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return "--:--:--";
  }
  return new Date(parsed).toLocaleTimeString();
}

/**
 * True when a keyboard event originated inside a text-entry element.
 *
 * Global shortcuts (push-to-talk on Shift+Space, in particular) must not fire
 * while the operator is typing a prompt.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  // `isContentEditable` is not implemented by every DOM environment, so coerce
  // rather than returning it directly — the declared `boolean` must hold.
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    Boolean(target.isContentEditable)
  );
}
