import { isAvifSourceMissing } from "@carma-commons/image-pyramid";
import type { PreviewQualityLevel } from "../../core/constants";
import {
  createSharedPreviewThumbnail,
  readSharedThumbnailBlob,
} from "./shared-preview-thumbnail";

export type ThumbnailSource = Readonly<{
  previewPath: string;
  imageId: string;
  originalImageUrl?: string;
  avifPyramidUrl?: string;
  avifOnly?: boolean;
  minimumQualityLevel?: PreviewQualityLevel;
  nativeSize?: { width: number; height: number };
}>;
type Entry = {
  blob: Blob | null;
  encodedBytes: number;
  revision?: string;
  persisted: boolean;
  bitmap: ImageBitmap | null;
  blobUrl: string | null;
  leases: number;
  retired: boolean;
};
export type PreviewThumbnailLease = Readonly<{
  bitmap: ImageBitmap;
  blobUrl: string;
  release: () => void;
}>;

const thumbnailBudget = () => {
  const memory = (
    globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined
  )?.deviceMemory;
  return (
    (memory && memory >= 8 ? 32 : memory && memory >= 4 ? 16 : 8) * 1024 * 1024
  );
};
const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
let sharedJob: { abort: AbortController; url: string } | null = null;
const busy = () => sharedJob !== null;
let activeUrl: string | null = null;
let activeBackground = false;
let activeSource: ThumbnailSource | null = null;
let queuedSource: { url: string; source: ThumbnailSource } | null = null;
const missingUntil = new Map<string, number>();
const MISSING_COOLDOWN_MS = 15000;
const missingKey = (url: string) => url.replace(/#avif-only$/, "");
const missingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const notifyAvailability = (key: string) => {
  for (const [url, subscribers] of listeners)
    if (missingKey(url) === key) for (const listener of subscribers) listener();
};
const clearMissing = (key: string, notify = true) => {
  const removed = missingUntil.delete(key);
  clearTimeout(missingTimers.get(key));
  missingTimers.delete(key);
  if (removed && notify) notifyAvailability(key);
};
const isCoolingDown = (url: string) => {
  const key = missingKey(url),
    until = missingUntil.get(key);
  if (until !== undefined && until <= Date.now()) clearMissing(key);
  return (missingUntil.get(key) ?? 0) > Date.now();
};
export const isPreviewSourceMissing = (source: ThumbnailSource) =>
  isCoolingDown(sourceUrl(source));
export const reportPreviewSourceAvailable = (source: ThumbnailSource) =>
  clearMissing(missingKey(sourceUrl(source)));
export const reportPreviewSourceMissing = (source: ThumbnailSource) => {
  const key = missingKey(sourceUrl(source));
  clearMissing(key, false);
  missingUntil.set(key, Date.now() + MISSING_COOLDOWN_MS);
  missingTimers.set(
    key,
    setTimeout(() => clearMissing(key), MISSING_COOLDOWN_MS)
  );
  while (missingUntil.size > 128)
    clearMissing(missingUntil.keys().next().value!);
  notifyAvailability(key);
};
const stopActive = () => {
  globalThis.window.clearTimeout(timeout);
  sharedJob?.abort.abort();
  sharedJob = null;
  activeUrl = null;
  activeSource = null;
  activeBackground = false;
};
const backgroundSources = new Map<string, ThumbnailSource>();
let timeout: number | undefined;
let epoch = 0;

const sourceUrl = (source: ThumbnailSource) =>
  source.avifPyramidUrl
    ? new URL(source.avifPyramidUrl, globalThis.window.location.href).href
    : `native-missing:${source.previewPath}:${source.imageId}`;
const close = (entry: Entry) => {
  entry.bitmap?.close();
  entry.bitmap = null;
  if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
  entry.blobUrl = null;
};
const touch = (url: string, entry: Entry) => {
  entries.delete(url);
  entries.set(url, entry);
};
const trim = () => {
  const budget = thumbnailBudget();
  let decodedBytes = [...entries.values()].reduce(
    (sum, entry) =>
      sum + (entry.bitmap ? entry.bitmap.width * entry.bitmap.height * 4 : 0),
    0
  );
  for (const entry of entries.values()) {
    if (decodedBytes <= budget) break;
    if (entry.bitmap && entry.leases === 0) {
      decodedBytes -= entry.bitmap.width * entry.bitmap.height * 4;
      entry.bitmap.close();
      entry.bitmap = null;
    }
  }
  let encodedBytes = [...entries.values()].reduce(
    (sum, entry) => sum + (entry.blob?.size ?? 0),
    0
  );
  for (const entry of entries.values()) {
    if (encodedBytes <= budget) break;
    if (entry.blob && !entry.bitmap && entry.leases === 0 && entry.persisted) {
      encodedBytes -= entry.blob.size;
      if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
      entry.blobUrl = null;
      entry.blob = null;
    }
  }
  // If storage is unavailable, a compressed derivative is the last RAM tier.
  // Original compressed AVIF/JPEG data remains in its source/cache independently.
  for (const entry of entries.values()) {
    if (encodedBytes <= 2 * budget) break;
    if (entry.blob && !entry.bitmap && entry.leases === 0 && !entry.persisted) {
      encodedBytes -= entry.blob.size;
      if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
      entry.blobUrl = null;
      entry.blob = null;
    }
  }
};

const drainBackground = () => {
  if (busy()) return;
  const next = queuedSource;
  queuedSource = null;
  if (next) {
    start(next.url, next.source, false);
    return;
  }
  const background = [...backgroundSources.entries()].at(-1);
  if (background) {
    backgroundSources.delete(background[0]);
    start(background[0], background[1], true);
  }
};

const startShared = (
  url: string,
  source: ThumbnailSource,
  background: boolean
) => {
  const job = { abort: new AbortController(), url };
  const token = epoch;
  sharedJob = job;
  activeUrl = url;
  activeSource = source;
  activeBackground = background;
  const finish = () => {
    if (sharedJob !== job) return;
    globalThis.window.clearTimeout(timeout);
    sharedJob = null;
    activeUrl = null;
    activeSource = null;
    activeBackground = false;
    if (token === epoch) drainBackground();
  };
  timeout = globalThis.window.setTimeout(() => {
    job.abort.abort();
    finish();
  }, 10000);
  void (async () => {
    const cached = entries.get(url);
    const stored =
      cached?.blob ??
      (cached?.persisted
        ? await readSharedThumbnailBlob(url, cached.revision, job.abort.signal)
        : undefined);
    const result = stored
      ? {
          blob: stored,
          bitmap: await createImageBitmap(stored),
          revision: cached?.revision,
          persisted: cached?.persisted ?? false,
        }
      : await createSharedPreviewThumbnail(source, url, job.abort.signal);
    if (sharedJob !== job || token !== epoch || job.abort.signal.aborted) {
      result.bitmap.close();
      return;
    }
    const previous = entries.get(url);
    if (previous) {
      previous.retired = true;
      if (previous.leases === 0) close(previous);
    }
    const entry: Entry = {
      blob: result.blob,
      encodedBytes: result.blob.size,
      bitmap: result.bitmap,
      revision: result.revision,
      persisted: result.persisted,
      blobUrl: null,
      leases: 0,
      retired: false,
    };
    touch(url, entry);
    clearMissing(missingKey(url), false);
    listeners.get(url)?.forEach((listener) => listener());
    trim();
    if ("persistence" in result && result.persistence)
      void result.persistence.then((persisted) => {
        if (entries.get(url) === entry) {
          entry.persisted = persisted;
          trim();
        }
      });
  })()
    .catch((error) => {
      if (
        !job.abort.signal.aborted &&
        sharedJob === job &&
        token === epoch &&
        isAvifSourceMissing(error)
      )
        reportPreviewSourceMissing(source);
    })
    .finally(finish);
};

const start = (url: string, source: ThumbnailSource, background: boolean) => {
  if (isCoolingDown(url)) {
    drainBackground();
    return;
  }
  const cached = entries.get(url);
  if (cached?.bitmap) {
    touch(url, cached);
    drainBackground();
    return;
  }
  if (!source.avifPyramidUrl) return;
  startShared(url, source, background);
};

export const prefetchPreviewThumbnail = (
  source: ThumbnailSource | null,
  options?: { enqueue?: boolean }
) => {
  if (!source) {
    queuedSource = null;
    if (busy() && !activeBackground) {
      stopActive();
      drainBackground();
    }
    return;
  }
  if (!source.avifPyramidUrl) return;
  const url = sourceUrl(source);
  if (isCoolingDown(url)) return;
  const cached = entries.get(url);
  if (cached?.bitmap) {
    touch(url, cached);
    if (!options?.enqueue) queuedSource = null;
    return;
  }
  if (busy()) {
    if (options?.enqueue) {
      if (url === activeUrl) activeBackground = true;
      if (url !== activeUrl) {
        backgroundSources.delete(url);
        backgroundSources.set(url, source);
      }
      while (backgroundSources.size > 64)
        backgroundSources.delete(backgroundSources.keys().next().value!);
      return;
    }
    if (url === activeUrl) {
      backgroundSources.delete(url);
      queuedSource = null;
      return;
    }
    queuedSource = { url, source };
    backgroundSources.delete(url);
    if (activeBackground && activeUrl && activeSource) {
      if (!backgroundSources.has(activeUrl)) {
        const pending = [...backgroundSources.entries()];
        backgroundSources.clear();
        backgroundSources.set(activeUrl, activeSource);
        for (const [key, value] of pending) backgroundSources.set(key, value);
        while (backgroundSources.size > 64)
          backgroundSources.delete(backgroundSources.keys().next().value!);
      }
      stopActive();
      drainBackground();
    }
    return;
  }
  start(url, source, !!options?.enqueue);
};

/** Pin a decoded thumbnail until the progressive image replaces its texture. */
export const acquirePreviewThumbnail = (
  source: ThumbnailSource
): PreviewThumbnailLease | null => {
  const url = sourceUrl(source);
  const entry = entries.get(url);
  if (!entry?.bitmap || !entry.blob) return null;
  touch(url, entry);
  entry.leases++;
  entry.blobUrl ??= URL.createObjectURL(entry.blob);
  let released = false;
  return {
    bitmap: entry.bitmap,
    blobUrl: entry.blobUrl,
    release: () => {
      if (released) return;
      released = true;
      entry.leases--;
      if (entry.retired && entry.leases === 0) close(entry);
      trim();
    },
  };
};

export const subscribePreviewThumbnail = (
  source: ThumbnailSource,
  listener: () => void
) => {
  const url = sourceUrl(source);
  const subscribers = listeners.get(url) ?? new Set<() => void>();
  subscribers.add(listener);
  listeners.set(url, subscribers);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(url);
  };
};

/** Release the bounded optimistic cache when its viewer leaves the scene. */
export const disposePreviewThumbnailPrefetch = () => {
  epoch++;
  sharedJob?.abort.abort();
  sharedJob = null;
  backgroundSources.clear();
  for (const timer of missingTimers.values()) clearTimeout(timer);
  missingTimers.clear();
  missingUntil.clear();
  queuedSource = null;
  activeUrl = null;
  activeBackground = false;
  activeSource = null;
  globalThis.window.clearTimeout(timeout);
  for (const entry of entries.values()) {
    entry.retired = true;
    if (entry.leases === 0) close(entry);
  }
  entries.clear();
};
