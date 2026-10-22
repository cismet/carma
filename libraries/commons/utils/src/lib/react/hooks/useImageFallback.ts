import { useCallback, useEffect, useMemo, useState } from "react";

import { getImageUrlCandidates } from "../../changeImageEndpoints";

const DEFAULT_TIMEOUT_MS = 2000;
const LOG_DEBOUNCE_MS = 1000;

// mirror urls that failed too, logged together once loading settles
const failedMirrorUrls = new Set<string>();
let logTimer: ReturnType<typeof setTimeout> | undefined;

const reportFailedMirrorUrl = (url: string) => {
  if (failedMirrorUrls.has(url)) {
    return;
  }
  failedMirrorUrls.add(url);
  clearTimeout(logTimer);
  logTimer = setTimeout(() => {
    console.warn("[IMAGE FALLBACK] not available on our server", [
      ...failedMirrorUrls,
    ]);
  }, LOG_DEBOUNCE_MS);
};

interface ImageFallbackOptions {
  /** Max wait for a candidate before moving on; the last one waits for the browser */
  timeoutMs?: number;
  /** When false only the given url is tried */
  enabled?: boolean;
}

interface ImageFallbackState {
  url: string | undefined;
  index: number;
  loaded: boolean;
}

/**
 * Steps through the original url and its mirror (see getImageUrlCandidates)
 * until one loads. Wire `onLoad`/`onError` to the image element; `failed`
 * turns true once every candidate errored.
 */
export const useImageFallback = (
  url: string | undefined,
  { timeoutMs = DEFAULT_TIMEOUT_MS, enabled = true }: ImageFallbackOptions = {}
) => {
  const candidates = useMemo(
    () => (enabled ? getImageUrlCandidates(url) : url ? [url] : []),
    [url, enabled]
  );

  const [state, setState] = useState<ImageFallbackState>({
    url,
    index: 0,
    loaded: false,
  });
  // reset synchronously when the url changes
  const current: ImageFallbackState =
    state.url === url ? state : { url, index: 0, loaded: false };

  const advance = useCallback(() => {
    setState((prev) => {
      const base =
        prev.url === url ? prev : { url, index: 0, loaded: false };
      if (base.loaded) {
        return base;
      }
      return { ...base, index: base.index + 1 };
    });
  }, [url]);

  const onLoad = useCallback(() => {
    setState((prev) => {
      const base =
        prev.url === url ? prev : { url, index: 0, loaded: false };
      return { ...base, loaded: true };
    });
  }, [url]);

  const isLastCandidate = current.index >= candidates.length - 1;

  const onError = useCallback(() => {
    // every candidate after the original is a mirror url
    const candidate = candidates[current.index];
    if (current.index > 0 && candidate) {
      reportFailedMirrorUrl(candidate);
    }
    advance();
  }, [candidates, current.index, advance]);

  useEffect(() => {
    if (current.loaded || isLastCandidate) {
      return;
    }
    const timer = setTimeout(advance, timeoutMs);
    return () => clearTimeout(timer);
  }, [current.loaded, current.index, isLastCandidate, advance, timeoutMs]);

  const failed = current.index >= candidates.length;

  return {
    src: failed ? undefined : candidates[current.index],
    failed,
    isLastCandidate,
    onLoad,
    onError,
  };
};
