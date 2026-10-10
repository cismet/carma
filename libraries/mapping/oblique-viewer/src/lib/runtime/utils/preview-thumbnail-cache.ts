import { getRegisteredNativeAvif } from "@carma-commons/image-pyramid";
import { PREVIEW_QUALITY } from "../../core/constants";
import { getPreviewImageUrl } from "./imageUrls";

export type ThumbnailSource = Readonly<{
  previewPath: string;
  imageId: string;
  originalImageUrl?: string;
  avifPyramidUrl?: string;
  avifFormat?: "native";
  avifPyramidFallbackUrl?: string;
  avifOnly?: boolean;
  nativeSize?: { width: number; height: number };
}>;
type Entry = {
  blob: Blob;
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

const BITMAP_LIMIT = 8;
const BLOB_LIMIT = 16;
const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
let worker: Worker | null = null;
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
  worker?.terminate();
  worker = null;
  activeUrl = null;
  activeSource = null;
  activeBackground = false;
};
const backgroundSources = new Map<string, ThumbnailSource>();
let timeout: number | undefined;
let epoch = 0;

const sourceUrl = (source: ThumbnailSource) => {
  if (source.avifOnly && !source.avifPyramidUrl)
    return `avif-only-missing:${source.previewPath}:${source.imageId}`;
  const url = new URL(
    source.avifPyramidUrl ??
      source.originalImageUrl ??
      getPreviewImageUrl(
        source.previewPath,
        PREVIEW_QUALITY.LEVEL_5,
        source.imageId
      ),
    globalThis.window.location.href
  ).href;
  const contract =
    source.avifFormat || source.avifPyramidFallbackUrl
      ? `${url}#source=${encodeURIComponent(
          JSON.stringify([source.avifFormat, source.avifPyramidFallbackUrl])
        )}`
      : url;
  return source.avifOnly ? `${contract}#avif-only` : contract;
};
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
  let bitmaps = [...entries.values()].filter((entry) => entry.bitmap).length;
  for (const entry of entries.values()) {
    if (bitmaps <= BITMAP_LIMIT) break;
    if (entry.bitmap && entry.leases === 0) {
      entry.bitmap.close();
      entry.bitmap = null;
      bitmaps--;
    }
  }
  for (const [url, entry] of entries) {
    if (entries.size <= BLOB_LIMIT) break;
    if (entry.leases === 0) {
      close(entry);
      entries.delete(url);
    }
  }
};

const drainBackground = () => {
  if (worker) return;
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
  const token = epoch;
  let currentWorker: Worker;
  try {
    currentWorker = new Worker(
      new URL("./preview-thumbnail.worker.ts", import.meta.url),
      { type: "module" }
    );
  } catch {
    return;
  }
  worker = currentWorker;
  activeUrl = url;
  activeBackground = background;
  activeSource = source;
  const finish = () => {
    currentWorker.terminate();
    if (worker !== currentWorker) return;
    globalThis.window.clearTimeout(timeout);
    worker = null;
    activeUrl = null;
    activeBackground = false;
    activeSource = null;
    if (token === epoch) drainBackground();
  };
  currentWorker.onmessage = (
    event: MessageEvent<{
      bitmap?: ImageBitmap;
      blob?: Blob;
      error?: string;
      missing?: boolean;
    }>
  ) => {
    const { bitmap, blob, error, missing } = event.data;
    if (token === epoch && worker === currentWorker && missing)
      reportPreviewSourceMissing(source);
    if (
      worker !== currentWorker ||
      token !== epoch ||
      error ||
      !bitmap ||
      !blob
    ) {
      bitmap?.close();
      finish();
      return;
    }
    const previous = entries.get(url);
    if (previous && previous.leases === 0) close(previous);
    clearMissing(missingKey(url), false);
    const entry: Entry = {
      blob,
      bitmap,
      blobUrl: null,
      leases: 0,
      retired: false,
    };
    touch(url, entry);
    // Visible subscribers must acquire their lease before inactive entries are trimmed.
    listeners.get(url)?.forEach((listener) => listener());
    trim();
    finish();
  };
  currentWorker.onerror = finish;
  currentWorker.onmessageerror = finish;
  timeout = globalThis.window.setTimeout(finish, 10000);
  try {
    currentWorker.postMessage({
      url: new URL(
        (source.avifOnly ? source.avifPyramidUrl : source.originalImageUrl) ??
          getPreviewImageUrl(
            source.previewPath,
            PREVIEW_QUALITY.LEVEL_5,
            source.imageId
          ),
        globalThis.window.location.href
      ).href,
      avifPyramidUrl: source.avifPyramidUrl
        ? new URL(source.avifPyramidUrl, globalThis.window.location.href).href
        : undefined,
      avifFormat: source.avifFormat,
      avifPyramidFallbackUrl: source.avifPyramidFallbackUrl
        ? new URL(
            source.avifPyramidFallbackUrl,
            globalThis.window.location.href
          ).href
        : undefined,
      nativeSize: source.nativeSize,
      avifOnly: source.avifOnly,
      blob: cached?.blob,
      nativeAvifFile: source.avifPyramidUrl
        ? getRegisteredNativeAvif(source.avifPyramidUrl)?.previewFile ??
          getRegisteredNativeAvif(source.avifPyramidUrl)?.localFile
        : undefined,
      ...(source.originalImageUrl && !source.avifOnly
        ? { tiff: true, nativeSize: source.nativeSize }
        : {}),
    });
  } catch {
    finish();
  }
};

/** Prioritize the latest hover ahead of a bounded carousel thumbnail queue. */
export const prefetchPreviewThumbnail = (
  source: ThumbnailSource | null,
  options?: { enqueue?: boolean }
) => {
  if (!source) {
    queuedSource = null;
    if (worker && !activeBackground) {
      stopActive();
      drainBackground();
    }
    return;
  }
  if (source.avifOnly && !source.avifPyramidUrl) return;
  const url = sourceUrl(source);
  if (isCoolingDown(url)) return;
  const cached = entries.get(url);
  if (cached?.bitmap) {
    touch(url, cached);
    if (!options?.enqueue) queuedSource = null;
    return;
  }
  if (worker) {
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
  if (!entry?.bitmap) return null;
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
  backgroundSources.clear();
  for (const timer of missingTimers.values()) clearTimeout(timer);
  missingTimers.clear();
  missingUntil.clear();
  queuedSource = null;
  activeUrl = null;
  activeBackground = false;
  activeSource = null;
  globalThis.window.clearTimeout(timeout);
  worker?.terminate();
  worker = null;
  for (const entry of entries.values()) {
    entry.retired = true;
    if (entry.leases === 0) close(entry);
  }
  entries.clear();
};
