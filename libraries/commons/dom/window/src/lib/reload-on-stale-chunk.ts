/**
 * A tab that was opened before a deployment still runs the old entry chunk,
 * which names lazy chunks by the hashes of that build. The deployment replaces
 * the assets folder, so the first lazy import after it (an addon switched on
 * later, for example) fails with "Failed to fetch dynamically imported module"
 * and the app falls into its error page. Reloading fetches the new index.html
 * and with it the current chunk names.
 *
 * Vite dispatches `vite:preloadError` for every failed dynamic import that
 * goes through its preload helper, which covers all `import()` calls in app
 * and library code of a production build.
 *
 * The reload happens at most once per window of time: a chunk that is missing
 * from the current deployment as well would otherwise reload the page forever,
 * so a second failure right after a reload keeps the error page up.
 */
const RELOAD_GUARD_MS = 60_000;

/**
 * The messages browsers give a dynamic import whose file is gone: Chromium,
 * Firefox and Safari, then Vite's own for a stylesheet of the chunk.
 */
const STALE_CHUNK_MESSAGES = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
  "Unable to preload CSS",
];

/** whether an error is a lazy chunk that the current deployment no longer has */
export const isStaleChunkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return STALE_CHUNK_MESSAGES.some((part) => message.includes(part));
};

export type ReloadOnStaleChunkOptions = {
  /**
   * Asked on every failure; false leaves the error to the app's error page,
   * for screens where a reload of its own would interrupt someone.
   */
  shouldReload?: () => boolean;
};

let reloadOnStaleChunkInstalled = false;

export const reloadOnStaleChunk = (
  storageKeyPrefix: string,
  { shouldReload = () => true }: ReloadOnStaleChunkOptions = {}
): void => {
  if (reloadOnStaleChunkInstalled || typeof window === "undefined") {
    return;
  }
  reloadOnStaleChunkInstalled = true;

  const storageKey = `${storageKeyPrefix}:staleChunkReloadAt`;

  window.addEventListener("vite:preloadError", (event) => {
    if (!shouldReload()) {
      return;
    }
    try {
      const lastReloadAt = Number(window.sessionStorage.getItem(storageKey));
      if (Date.now() - lastReloadAt < RELOAD_GUARD_MS) {
        console.warn(
          "[STALE CHUNK] lazy chunk still missing after reload, keeping error",
          event
        );
        return;
      }
      window.sessionStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // without a stored guard a chunk that is really gone would reload forever
      return;
    }
    console.warn("[STALE CHUNK] lazy chunk missing, reloading page", event);
    window.location.reload();
  });
};
