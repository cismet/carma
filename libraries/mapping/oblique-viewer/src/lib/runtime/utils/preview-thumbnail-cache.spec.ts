import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import {
  acquirePreviewThumbnail,
  isPreviewSourceMissing,
  reportPreviewSourceMissing,
  disposePreviewThumbnailPrefetch,
  prefetchPreviewThumbnail,
  subscribePreviewThumbnail,
} from "./preview-thumbnail-cache";

const shared = vi.hoisted(() => ({ create: vi.fn(), read: vi.fn() }));
vi.mock("./shared-preview-thumbnail", () => ({
  createSharedPreviewThumbnail: shared.create,
  readSharedThumbnailBlob: shared.read,
}));
type SharedResult = {
  bitmap: ImageBitmap;
  blob: Blob;
  revision?: string;
  persisted: boolean;
};
const sharedPending: Array<{
  resolve: (result: SharedResult) => void;
  reject: (error: unknown) => void;
  signal: AbortSignal;
}> = [];
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const completeShared = async (result: Partial<SharedResult> = {}) => {
  const image = result.bitmap ?? bitmap();
  sharedPending.shift()!.resolve({
    bitmap: image,
    blob: new Blob(["thumbnail"], { type: "image/png" }),
    persisted: false,
    ...result,
  });
  await settle();
  return image;
};

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
const source = (imageId: string) => ({
  previewPath: "/images",
  imageId,
  avifPyramidUrl: `/images/${imageId}.avif`,
  nativeSize: { width: 1024, height: 768 },
});
const bitmap = () =>
  ({ width: 512, height: 512, close: vi.fn() } as unknown as ImageBitmap);

beforeEach(() => {
  vi.useFakeTimers();
  ThumbnailWorker.instances = [];
  sharedPending.length = 0;
  shared.create
    .mockReset()
    .mockImplementation(
      (_source, _key, signal: AbortSignal) =>
        new Promise<SharedResult>((resolve, reject) =>
          sharedPending.push({ resolve, reject, signal })
        )
    );
  shared.read.mockReset();
  vi.stubGlobal("navigator", { deviceMemory: undefined });
  vi.stubGlobal("Blob", NodeBlob);
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
  it("uses the shared native pool and retains only the latest queued hover", async () => {
    prefetchPreviewThumbnail(source("first"));
    prefetchPreviewThumbnail(source("obsolete"));
    prefetchPreviewThumbnail(source("latest"));
    expect(shared.create).toHaveBeenCalledTimes(1);
    expect(shared.create.mock.lastCall?.[0].imageId).toBe("first");
    await completeShared();
    expect(shared.create.mock.lastCall?.[0].imageId).toBe("latest");
    await completeShared();
    prefetchPreviewThumbnail(source("first"));
    expect(shared.create).toHaveBeenCalledTimes(2);
    expect(ThumbnailWorker.instances).toEqual([]);
  });

  it("retains carousel entries while prioritizing the latest hover", async () => {
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
    await completeShared();
    expect(shared.create.mock.lastCall?.[0].imageId).toBe("latest-hover");
    await completeShared();
    expect(shared.create.mock.lastCall?.[0].imageId).toBe("second");
    await completeShared();
    expect(receive).toHaveBeenCalledOnce();
    unsubscribe();
    expect(shared.create.mock.lastCall?.[0].imageId).toBe("third");
    await completeShared();
    expect(shared.create).toHaveBeenCalledTimes(4);
    expect(obsolete).not.toHaveBeenCalled();
    const lease = acquirePreviewThumbnail(source("second"))!;
    expect(lease.blobUrl).toBe("blob:thumbnail");
    prefetchPreviewThumbnail(source("second"), { enqueue: true });
    expect(shared.create).toHaveBeenCalledTimes(4);
    lease.release();
  });

  it("bounds the background queue to64 and prevents dispatch after disposal", async () => {
    prefetchPreviewThumbnail(source("first"), { enqueue: true });
    for (let i = 0; i < 70; i++)
      prefetchPreviewThumbnail(source(`queued-${i}`), { enqueue: true });
    await completeShared();
    const ids = [shared.create.mock.lastCall?.[0].imageId];
    for (let i = 69; i > 6; i--) {
      await completeShared();
      ids.push(shared.create.mock.lastCall?.[0].imageId);
    }
    expect(ids).toHaveLength(64);
    expect(ids[0]).toBe("queued-69");
    expect(ids.at(-1)).toBe("queued-6");
    prefetchPreviewThumbnail(source("never-started"), { enqueue: true });
    const active = sharedPending[0];
    disposePreviewThumbnailPrefetch();
    expect(active.signal.aborted).toBe(true);
    const late = await completeShared();
    expect(late.close).toHaveBeenCalledOnce();
    expect(shared.create).toHaveBeenCalledTimes(65);
    expect(acquirePreviewThumbnail(source("never-started"))).toBeNull();
  });

  it("pins a ninth visible thumbnail before trimming older pinned content", async () => {
    const previous: Array<{ bitmap: ImageBitmap; release: () => void }> = [];
    for (let i = 0; i < 8; i++) {
      const input = source(`pinned-${i}`);
      prefetchPreviewThumbnail(input, { enqueue: true });
      const image = await completeShared();
      previous.push({
        bitmap: image,
        release: acquirePreviewThumbnail(input)!.release,
      });
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
    const ninth = await completeShared();
    expect(notify).toHaveBeenCalledOnce();
    expect(state.visible?.bitmap).toBe(ninth);
    expect(ninth.close).not.toHaveBeenCalled();
    previous.forEach((entry) =>
      expect(entry.bitmap.close).not.toHaveBeenCalled()
    );
    previous[0].release();
    expect(previous[0].bitmap.close).toHaveBeenCalledOnce();
    expect(acquirePreviewThumbnail(source("pinned-0"))).toBeNull();
    expect(ninth.close).not.toHaveBeenCalled();
    unsubscribe();
    previous.slice(1).forEach((entry) => entry.release());
    state.visible!.release();
  });

  it("reuses a retained PNG after bitmap eviction without another AVIF query", async () => {
    prefetchPreviewThumbnail(source("0"));
    const pinned = await completeShared();
    const lease = acquirePreviewThumbnail(source("0"))!;
    const images: ImageBitmap[] = [];
    for (let i = 1; i <= 8; i++) {
      prefetchPreviewThumbnail(source(String(i)));
      images.push(await completeShared());
    }
    expect(pinned.close).not.toHaveBeenCalled();
    expect(images[0].close).toHaveBeenCalledOnce();
    const restored = bitmap();
    const decode = vi.fn().mockResolvedValue(restored);
    vi.stubGlobal("createImageBitmap", decode);
    prefetchPreviewThumbnail(source("1"));
    await settle();
    expect(decode).toHaveBeenCalledWith(expect.any(Blob));
    expect(shared.create).toHaveBeenCalledTimes(9);
    lease.release();
    disposePreviewThumbnailPrefetch();
    expect(pinned.close).toHaveBeenCalledOnce();
  });

  it("closes a late shared completion after disposal without starting queued work", async () => {
    prefetchPreviewThumbnail(source("old"));
    const job = sharedPending[0];
    prefetchPreviewThumbnail(source("queued"));
    disposePreviewThumbnailPrefetch();
    expect(job.signal.aborted).toBe(true);
    const stale = await completeShared();
    expect(stale.close).toHaveBeenCalledOnce();
    expect(shared.create).toHaveBeenCalledTimes(1);
    expect(acquirePreviewThumbnail(source("old"))).toBeNull();
  });
  it("routes AVIF through the shared pool while retaining the original download URL", async () => {
    const input = {
      ...source("2026-photo"),
      originalImageUrl: "/2026/tiff/Nord/2026-photo.tif",
      avifPyramidUrl: "/2026/avif/Nord/2026-photo.avif",
      nativeSize: { width: 1024, height: 768 },
    };
    prefetchPreviewThumbnail(input);
    expect(ThumbnailWorker.instances).toHaveLength(0);
    expect(shared.create).toHaveBeenCalledOnce();
    expect(shared.create.mock.calls[0][0]).toEqual(input);
    expect(shared.create.mock.calls[0][1]).toMatch(
      /\/2026\/avif\/Nord\/2026-photo\.avif$/
    );
    const decoded = await completeShared();
    const lease = acquirePreviewThumbnail(input)!;
    expect(lease.bitmap).toBe(decoded);
    expect(
      acquirePreviewThumbnail({ ...input, avifPyramidUrl: undefined })
    ).toBeNull();
    lease.release();
  });
  it("uses one native identity regardless of original download metadata", async () => {
    const input = { ...source("only"), originalImageUrl: "/original/only.tif" };
    prefetchPreviewThumbnail(input);
    const image = await completeShared();
    const lease = acquirePreviewThumbnail({ ...input, avifOnly: true });
    expect(lease?.bitmap).toBe(image);
    prefetchPreviewThumbnail({ ...input, avifOnly: true });
    expect(shared.create).toHaveBeenCalledOnce();
    expect(ThumbnailWorker.instances).toEqual([]);
    lease!.release();
  });
  it("does not derive or fetch a legacy thumbnail for an absent AVIF-only source", () => {
    prefetchPreviewThumbnail({
      ...source("pending"),
      avifPyramidUrl: undefined,
      avifOnly: true,
      originalImageUrl: "/original/pending.tif",
    });
    expect(ThumbnailWorker.instances).toHaveLength(0);
    expect(
      acquirePreviewThumbnail({ ...source("pending"), avifOnly: true })
    ).toBeNull();
  });
  it("keeps shared active and queued navigation backgrounds alive when hover clears", async () => {
    const first = {
      ...source("next"),
      avifPyramidUrl: "/next.avif",
      nativeSize: { width: 1024, height: 768 },
    };
    prefetchPreviewThumbnail(first, { enqueue: true });
    prefetchPreviewThumbnail(source("later"), { enqueue: true });
    prefetchPreviewThumbnail(null);
    expect(sharedPending[0].signal.aborted).toBe(false);
    expect(ThumbnailWorker.instances).toHaveLength(0);
    await completeShared();
    const lease = acquirePreviewThumbnail(first);
    expect(lease).not.toBeNull();
    lease!.release();
    expect(shared.create.mock.lastCall?.[0].imageId).toBe("later");
  });
  it("rehydrates an evicted AVIF PNG from persistent storage without another source query", async () => {
    const png = new Blob([new Uint8Array(2 * 1024 * 1024)], {
      type: "image/png",
    });
    const inputs = Array.from({ length: 9 }, (_, i) => ({
      ...source(`avif-${i}`),
      avifPyramidUrl: `/image-${i}.avif`,
      nativeSize: { width: 1024, height: 768 },
    }));
    const images: ImageBitmap[] = [];
    for (const input of inputs) {
      prefetchPreviewThumbnail(input);
      images.push(
        await completeShared({
          blob: png,
          revision: "etag-v1",
          persisted: true,
        })
      );
    }
    expect(images[0].close).toHaveBeenCalledOnce();
    expect(acquirePreviewThumbnail(inputs[0])).toBeNull();
    const restored = bitmap();
    const decode = vi.fn().mockResolvedValue(restored);
    vi.stubGlobal("createImageBitmap", decode);
    shared.read.mockResolvedValue(png);
    prefetchPreviewThumbnail(inputs[0]);
    await settle();
    expect(shared.read).toHaveBeenCalledWith(
      expect.stringContaining("image-0.avif"),
      "etag-v1",
      expect.any(AbortSignal)
    );
    expect(decode).toHaveBeenCalledWith(png);
    expect(shared.create).toHaveBeenCalledTimes(9);
    expect(ThumbnailWorker.instances).toHaveLength(0);
    const lease = acquirePreviewThumbnail(inputs[0])!;
    expect(lease.bitmap).toBe(restored);
    lease.release();
  });

  it("rehydrates a persisted PNG even when its decoded bitmap is still resident", async () => {
    const png = new Blob([new Uint8Array(2 * 1024 * 1024)], {
      type: "image/png",
    });
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      ...source(`retained-${i}`),
      avifPyramidUrl: `/retained-${i}.avif`,
      nativeSize: { width: 1024, height: 768 },
    }));
    const images: ImageBitmap[] = [];
    for (const input of inputs) {
      prefetchPreviewThumbnail(input);
      images.push(
        await completeShared({
          blob: png,
          revision: "etag-v1",
          persisted: true,
        })
      );
    }
    expect(images[0].close).not.toHaveBeenCalled();
    shared.read.mockResolvedValue(png);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap()));
    prefetchPreviewThumbnail(inputs[0]);
    await settle();
    const lease = acquirePreviewThumbnail(inputs[0]);
    expect(lease).not.toBeNull();
    expect(shared.create).toHaveBeenCalledTimes(5);
    expect(ThumbnailWorker.instances).toHaveLength(0);
    lease!.release();
  });

  it("aborts a shared thumbnail on disposal and closes its late bitmap", async () => {
    const input = {
      ...source("cancelled-shared"),
      avifPyramidUrl: "/cancel.avif",
      nativeSize: { width: 1024, height: 768 },
    };
    prefetchPreviewThumbnail(input);
    const job = sharedPending[0];
    disposePreviewThumbnailPrefetch();
    expect(job.signal.aborted).toBe(true);
    const late = await completeShared();
    expect(late.close).toHaveBeenCalledOnce();
    expect(acquirePreviewThumbnail(input)).toBeNull();
    expect(ThumbnailWorker.instances).toHaveLength(0);
  });

  it("preempts background work and rejects its late completion before resuming it", async () => {
    prefetchPreviewThumbnail(source("background"), { enqueue: true });
    const old = sharedPending[0];
    prefetchPreviewThumbnail(source("urgent"));
    expect(old.signal.aborted).toBe(true);
    expect(shared.create.mock.lastCall?.[0].imageId).toBe("urgent");
    const stale = await completeShared();
    expect(stale.close).toHaveBeenCalledOnce();
    expect(acquirePreviewThumbnail(source("background"))).toBeNull();
    await completeShared();
    expect(shared.create.mock.lastCall?.[0].imageId).toBe("background");
  });
  it("backs off native404 for15seconds without retrying a legacy asset", async () => {
    prefetchPreviewThumbnail(source("missing"), { enqueue: true });
    const { AvifHttpError } = await import("@carma-commons/image-pyramid");
    sharedPending.shift()!.reject(new AvifHttpError(404, "missing"));
    await settle();
    prefetchPreviewThumbnail(source("missing"));
    prefetchPreviewThumbnail(source("missing"), { enqueue: true });
    expect(shared.create).toHaveBeenCalledTimes(1);
    prefetchPreviewThumbnail(source("available"), { enqueue: true });
    await completeShared();
    const lease = acquirePreviewThumbnail(source("available"));
    expect(lease).not.toBeNull();
    lease!.release();
    vi.advanceTimersByTime(15001);
    prefetchPreviewThumbnail(source("missing"), { enqueue: true });
    expect(shared.create).toHaveBeenCalledTimes(3);
    expect(ThumbnailWorker.instances).toEqual([]);
  });
});

describe("shared missing source availability", () => {
  it("notifies subscribers on missing and TTL expiry and permits retry", async () => {
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
    await completeShared();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
  it("does not classify a generic error containing a pixel count as HTTP missing", async () => {
    const item = source("invalid");
    prefetchPreviewThumbnail(item);
    sharedPending.shift()!.reject(new Error("Unexpected image width 404"));
    await settle();
    expect(isPreviewSourceMissing(item)).toBe(false);
  });
});
