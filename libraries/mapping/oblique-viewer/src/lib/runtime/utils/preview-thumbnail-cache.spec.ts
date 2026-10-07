import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquirePreviewThumbnail,
  isPreviewSourceMissing,
  reportPreviewSourceMissing,
  disposePreviewThumbnailPrefetch,
  prefetchPreviewThumbnail,
  subscribePreviewThumbnail,
} from "./preview-thumbnail-cache";

type Result = {
  bitmap?: ImageBitmap;
  blob?: Blob;
  error?: string;
  missing?: boolean;
};
class ThumbnailWorker {
  static instances: ThumbnailWorker[] = [];
  onmessage: ((event: MessageEvent<Result>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    ThumbnailWorker.instances.push(this);
  }
  reply(result: Result) {
    this.onmessage?.({ data: result } as MessageEvent<Result>);
  }
}
const source = (imageId: string) => ({ previewPath: "/images", imageId });
const bitmap = () =>
  ({ width: 128, height: 64, close: vi.fn() } as unknown as ImageBitmap);
const complete = (image: ImageBitmap = bitmap()) => {
  ThumbnailWorker.instances.at(-1)!.reply({
    bitmap: image,
    blob: new Blob(["thumbnail"], { type: "image/jpeg" }),
  });
  return image;
};
beforeEach(() => {
  vi.useFakeTimers();
  ThumbnailWorker.instances = [];
  vi.stubGlobal("Worker", ThumbnailWorker);
  const NativeURL = globalThis.URL;
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static createObjectURL = vi.fn(() => "blob:thumbnail");
      static revokeObjectURL = vi.fn();
    }
  );
});
afterEach(() => {
  disposePreviewThumbnailPrefetch();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded hover thumbnail prefetch", () => {
  it("requests Level-5 JPEG only and retains only the latest queued hover", () => {
    prefetchPreviewThumbnail(source("first"));
    prefetchPreviewThumbnail(source("obsolete"));
    prefetchPreviewThumbnail(source("latest"));
    expect(ThumbnailWorker.instances).toHaveLength(1);
    expect(
      ThumbnailWorker.instances[0].postMessage.mock.lastCall?.[0].url
    ).toMatch(/\/images\/5\/first\.jpg$/);
    complete();
    expect(ThumbnailWorker.instances).toHaveLength(2);
    expect(
      ThumbnailWorker.instances[1].postMessage.mock.lastCall?.[0].url
    ).toMatch(/\/images\/5\/latest\.jpg$/);
    complete();
    prefetchPreviewThumbnail(source("first"));
    expect(ThumbnailWorker.instances).toHaveLength(2);
  });

  it("keeps every enqueued carousel thumbnail while prioritizing only the latest hover", () => {
    prefetchPreviewThumbnail(source("first"));
    prefetchPreviewThumbnail(source("second"), { enqueue: true });
    prefetchPreviewThumbnail(source("third"), { enqueue: true });
    prefetchPreviewThumbnail(source("second"), { enqueue: true });
    prefetchPreviewThumbnail(source("obsolete-hover"));
    prefetchPreviewThumbnail(source("latest-hover"));
    const receive = vi.fn(),
      obsolete = vi.fn();
    const unsubscribe = subscribePreviewThumbnail(source("second"), receive);
    subscribePreviewThumbnail(source("obsolete-hover"), obsolete);
    complete();
    expect(
      ThumbnailWorker.instances.at(-1)!.postMessage.mock.lastCall![0].url
    ).toMatch(/\/latest-hover\.jpg$/);
    complete();
    expect(
      ThumbnailWorker.instances.at(-1)!.postMessage.mock.lastCall![0].url
    ).toMatch(/\/second\.jpg$/);
    complete();
    expect(receive).toHaveBeenCalledOnce();
    unsubscribe();
    expect(
      ThumbnailWorker.instances.at(-1)!.postMessage.mock.lastCall![0].url
    ).toMatch(/\/third\.jpg$/);
    complete();
    expect(ThumbnailWorker.instances).toHaveLength(4);
    expect(obsolete).not.toHaveBeenCalled();
    expect(
      ThumbnailWorker.instances.every(
        (worker) => worker.terminate.mock.calls.length === 1
      )
    ).toBe(true);
    const lease = acquirePreviewThumbnail(source("second"))!;
    expect(lease.blobUrl).toBe("blob:thumbnail");
    prefetchPreviewThumbnail(source("second"), { enqueue: true });
    expect(ThumbnailWorker.instances).toHaveLength(4);
    lease.release();
  });

  it("bounds the background queue to the latest 64 entries and clears pending entries on disposal", () => {
    prefetchPreviewThumbnail(source("first"), { enqueue: true });
    for (let index = 0; index < 70; index++)
      prefetchPreviewThumbnail(source("queued-" + index), { enqueue: true });
    complete();
    expect(ThumbnailWorker.instances).toHaveLength(2);
    expect(
      ThumbnailWorker.instances[1].postMessage.mock.lastCall![0].url
    ).toMatch(/\/queued-69\.jpg$/);
    const urls = [
      ThumbnailWorker.instances[1].postMessage.mock.lastCall![0].url,
    ];
    for (let index = 69; index > 6; index--) {
      complete();
      urls.push(
        ThumbnailWorker.instances.at(-1)!.postMessage.mock.lastCall![0].url
      );
    }
    expect(urls).toHaveLength(64);
    expect(urls.at(-1)).toMatch(/\/queued-6\.jpg$/);
    prefetchPreviewThumbnail(source("never-started"), { enqueue: true });
    const active = ThumbnailWorker.instances.at(-1)!;
    disposePreviewThumbnailPrefetch();
    active.reply({ bitmap: bitmap(), blob: new Blob(["obsolete"]) });
    expect(ThumbnailWorker.instances).toHaveLength(65);
    expect(acquirePreviewThumbnail(source("never-started"))).toBeNull();
  });

  it("lets a ninth visible subscriber pin its bitmap before trimming eight previously pinned thumbnails", () => {
    const previous: Array<{ bitmap: ImageBitmap; release: () => void }> = [];
    for (let index = 0; index < 8; index++) {
      const input = source("pinned-" + index);
      prefetchPreviewThumbnail(input, { enqueue: true });
      const image = complete();
      const lease = acquirePreviewThumbnail(input)!;
      previous.push({ bitmap: image, release: lease.release });
    }
    const input = source("ninth-visible");
    const state: { visible: ReturnType<typeof acquirePreviewThumbnail> } = {
      visible: null,
    };
    const notify = vi.fn(() => {
      state.visible = acquirePreviewThumbnail(input);
    });
    const unsubscribe = subscribePreviewThumbnail(input, notify);
    prefetchPreviewThumbnail(input, { enqueue: true });
    const ninth = complete();
    expect(notify).toHaveBeenCalledOnce();
    expect(state.visible).not.toBeNull();
    expect(state.visible!.bitmap).toBe(ninth);
    expect(ninth.close).not.toHaveBeenCalled();
    for (const entry of previous)
      expect(entry.bitmap.close).not.toHaveBeenCalled();
    // Unpinning an older LRU satisfies the budget without evicting the new visible photo.
    previous[0].release();
    expect(previous[0].bitmap.close).toHaveBeenCalledOnce();
    expect(acquirePreviewThumbnail(source("pinned-0"))).toBeNull();
    expect(ninth.close).not.toHaveBeenCalled();
    unsubscribe();
    previous.slice(1).forEach((entry) => entry.release());
    state.visible!.release();
  });

  it("keeps eight decoded bitmaps, reuses cached blobs and pins visible textures", () => {
    prefetchPreviewThumbnail(source("0"));
    const pinned = complete();
    const lease = acquirePreviewThumbnail(source("0"))!;
    const images: ImageBitmap[] = [];
    for (let index = 1; index <= 8; index++) {
      prefetchPreviewThumbnail(source(String(index)));
      images.push(complete());
    }
    expect(pinned.close).not.toHaveBeenCalled();
    expect(images[0].close).toHaveBeenCalledOnce();
    prefetchPreviewThumbnail(source("1"));
    expect(
      ThumbnailWorker.instances.at(-1)!.postMessage.mock.lastCall?.[0].blob
    ).toBeInstanceOf(Blob);
    complete();
    lease.release();
    disposePreviewThumbnailPrefetch();
    expect(pinned.close).toHaveBeenCalledOnce();
  });

  it("closes a superseded completion after disposal and stops pending work", () => {
    prefetchPreviewThumbnail(source("old"));
    const worker = ThumbnailWorker.instances[0];
    prefetchPreviewThumbnail(source("queued"));
    disposePreviewThumbnailPrefetch();
    const stale = bitmap();
    worker.reply({ bitmap: stale, blob: new Blob(["stale"]) });
    expect(stale.close).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalled();
    expect(ThumbnailWorker.instances).toHaveLength(1);
    expect(acquirePreviewThumbnail(source("old"))).toBeNull();
  });
  it("keys a warm AVIF thumbnail separately while retaining its original TIFF fallback URL", () => {
    const input = {
      ...source("2026-photo"),
      originalImageUrl: "/2026/tiff/Nord/2026-photo.tif",
      avifPyramidUrl: "/2026/avif/Nord/2026-photo.avif",
      nativeSize: { width: 1024, height: 768 },
    };
    prefetchPreviewThumbnail(input);
    const sent = ThumbnailWorker.instances[0].postMessage.mock.lastCall![0];
    expect(sent.url).toMatch(/\/2026\/tiff\/Nord\/2026-photo\.tif$/);
    expect(sent.avifPyramidUrl).toMatch(
      /\/2026\/avif\/Nord\/2026-photo\.avif$/
    );
    expect(sent.tiff).toBe(true);
    const decoded = complete();
    const lease = acquirePreviewThumbnail(input)!;
    expect(lease.bitmap).toBe(decoded);
    expect(
      acquirePreviewThumbnail({ ...input, avifPyramidUrl: undefined })
    ).toBeNull();
    lease.release();
  });
  it("separates AVIF-only thumbnails from former TIFF fallbacks and sends only the AVIF URL", () => {
    const input = {
      ...source("only"),
      originalImageUrl: "/original/only.tif",
      avifPyramidUrl: "/2026/only.avif",
      nativeSize: { width: 1024, height: 768 },
    };
    prefetchPreviewThumbnail(input);
    complete();
    expect(acquirePreviewThumbnail({ ...input, avifOnly: true })).toBeNull();
    prefetchPreviewThumbnail({ ...input, avifOnly: true });
    const sent =
      ThumbnailWorker.instances.at(-1)!.postMessage.mock.lastCall![0];
    expect(sent.url).toMatch(/\/2026\/only\.avif$/);
    expect(sent.avifOnly).toBe(true);
    expect(sent.tiff).toBeUndefined();
    expect(sent.blob).toBeUndefined();
    complete();
  });
  it("does not derive or fetch a legacy thumbnail for an absent AVIF-only source", () => {
    prefetchPreviewThumbnail({
      ...source("pending"),
      avifOnly: true,
      originalImageUrl: "/original/pending.tif",
    });
    expect(ThumbnailWorker.instances).toHaveLength(0);
    expect(
      acquirePreviewThumbnail({ ...source("pending"), avifOnly: true })
    ).toBeNull();
  });
  it("keeps active and queued navigation backgrounds alive when hover clears", () => {
    const first = { ...source("next"), avifPyramidUrl: "/next.avif" };
    prefetchPreviewThumbnail(first, { enqueue: true });
    prefetchPreviewThumbnail(source("later"), { enqueue: true });
    prefetchPreviewThumbnail(null);
    expect(ThumbnailWorker.instances[0].terminate).not.toHaveBeenCalled();
    complete();
    const lease = acquirePreviewThumbnail(first);
    expect(lease).not.toBeNull();
    lease!.release();
    expect(
      ThumbnailWorker.instances.at(-1)!.postMessage.mock.lastCall![0].url
    ).toMatch(/later\.jpg$/);
  });
  it("preempts a background for foreground and rejects its late completion", () => {
    prefetchPreviewThumbnail(source("background"), { enqueue: true });
    const old = ThumbnailWorker.instances[0];
    prefetchPreviewThumbnail(source("urgent"));
    expect(old.terminate).toHaveBeenCalledOnce();
    expect(
      ThumbnailWorker.instances.at(-1)!.postMessage.mock.lastCall![0].url
    ).toMatch(/urgent\.jpg$/);
    const stale = bitmap();
    old.reply({ bitmap: stale, blob: new Blob(["late"]) });
    expect(stale.close).toHaveBeenCalledOnce();
    expect(acquirePreviewThumbnail(source("background"))).toBeNull();
    complete();
    expect(
      ThumbnailWorker.instances.at(-1)!.postMessage.mock.lastCall![0].url
    ).toMatch(/background\.jpg$/);
  });
  it("backs off missing assets for15seconds without blocking other preloads", () => {
    prefetchPreviewThumbnail(source("missing"), { enqueue: true });
    ThumbnailWorker.instances[0].reply({
      error: "Thumbnail preview:404",
      missing: true,
    });
    prefetchPreviewThumbnail(source("missing"));
    prefetchPreviewThumbnail(source("missing"), { enqueue: true });
    expect(ThumbnailWorker.instances).toHaveLength(1);
    prefetchPreviewThumbnail(source("available"), { enqueue: true });
    complete();
    const lease = acquirePreviewThumbnail(source("available"));
    expect(lease).not.toBeNull();
    lease!.release();
    vi.advanceTimersByTime(15001);
    prefetchPreviewThumbnail(source("missing"), { enqueue: true });
    expect(ThumbnailWorker.instances).toHaveLength(3);
  });
});

describe("shared missing source availability", () => {
  it("notifies subscribers on missing and TTL expiry and permits retry", () => {
    const item = source("published-later"),
      listener = vi.fn();
    const unsubscribe = subscribePreviewThumbnail(item, listener);
    reportPreviewSourceMissing(item);
    expect(isPreviewSourceMissing(item)).toBe(true);
    prefetchPreviewThumbnail(item);
    expect(ThumbnailWorker.instances).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15000);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(isPreviewSourceMissing(item)).toBe(false);
    prefetchPreviewThumbnail(item);
    complete();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
  it("does not classify a generic error containing a pixel count as HTTP missing", () => {
    const item = source("invalid");
    prefetchPreviewThumbnail(item);
    ThumbnailWorker.instances[0].reply({ error: "Unexpected image width 404" });
    expect(isPreviewSourceMissing(item)).toBe(false);
  });
});
