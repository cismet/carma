import { PREVIEW_QUALITY } from "../../core/constants";
import { getPreviewImageUrl } from "./imageUrls";

type ThumbnailSource = Readonly<{
  previewPath: string;
  imageId: string;
  originalImageUrl?: string;
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
let activeTiff = false;
let queuedSource: { url: string; source: ThumbnailSource } | null = null;
let timeout: number | undefined;
let epoch = 0;

const sourceUrl = ({
  previewPath,
  imageId,
  originalImageUrl,
}: ThumbnailSource) =>
  new URL(
    originalImageUrl ??
      getPreviewImageUrl(previewPath, PREVIEW_QUALITY.LEVEL_6, imageId),
    globalThis.window.location.href
  ).href;
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

const start = (url: string, source: ThumbnailSource) => {
  const cached = entries.get(url);
  if (cached?.bitmap) {
    touch(url, cached);
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
  activeTiff = !!source.originalImageUrl;
  const finish = () => {
    currentWorker.terminate();
    if (worker !== currentWorker) return;
    globalThis.window.clearTimeout(timeout);
    worker = null;
    activeUrl = null;
    activeTiff = false;
    const next = queuedSource;
    queuedSource = null;
    if (next && token === epoch) start(next.url, next.source);
  };
  currentWorker.onmessage = (
    event: MessageEvent<{ bitmap?: ImageBitmap; blob?: Blob; error?: string }>
  ) => {
    const { bitmap, blob, error } = event.data;
    if (token !== epoch || error || !bitmap || !blob) {
      bitmap?.close();
      finish();
      return;
    }
    const previous = entries.get(url);
    if (previous && previous.leases === 0) close(previous);
    const entry: Entry = {
      blob,
      bitmap,
      blobUrl: null,
      leases: 0,
      retired: false,
    };
    touch(url, entry);
    trim();
    if (entries.get(url)?.bitmap)
      listeners.get(url)?.forEach((listener) => listener());
    finish();
  };
  currentWorker.onerror = finish;
  currentWorker.onmessageerror = finish;
  timeout = globalThis.window.setTimeout(finish, 10000);
  try {
    currentWorker.postMessage({
      url,
      blob: cached?.blob,
      ...(source.originalImageUrl
        ? { tiff: true, nativeSize: source.nativeSize }
        : {}),
    });
  } catch {
    finish();
  }
};

/** One optimistic JPEG/TIFF thumbnail worker and one replaceable next hover. */
export const prefetchPreviewThumbnail = (source: ThumbnailSource | null) => {
  if (!source) {
    queuedSource = null;
    if (activeTiff) {
      globalThis.window.clearTimeout(timeout);
      worker?.terminate();
      worker = null;
      activeUrl = null;
      activeTiff = false;
    }
    return;
  }
  const url = sourceUrl(source);
  const cached = entries.get(url);
  if (cached?.bitmap) {
    touch(url, cached);
    queuedSource = null;
    return;
  }
  if (worker) {
    queuedSource = url === activeUrl ? null : { url, source };
    return;
  }
  start(url, source);
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
  queuedSource = null;
  activeUrl = null;
  activeTiff = false;
  globalThis.window.clearTimeout(timeout);
  worker?.terminate();
  worker = null;
  for (const entry of entries.values()) {
    entry.retired = true;
    if (entry.leases === 0) close(entry);
  }
  entries.clear();
};
