import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquirePreviewThumbnail,
  disposePreviewThumbnailPrefetch,
  prefetchPreviewThumbnail,
} from "./preview-thumbnail-cache";

type Result = { bitmap?: ImageBitmap; blob?: Blob; error?: string };
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
const source = (imageId: string) => ({ previewPath: "/bridge", imageId });
const bitmap = () =>
  ({ width: 128, height: 64, close: vi.fn() } as unknown as ImageBitmap);
const complete = (image: ImageBitmap = bitmap()) => {
  ThumbnailWorker.instances
    .at(-1)!
    .reply({
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
  it("requests Level-6 JPEG only and retains only the latest queued hover", () => {
    prefetchPreviewThumbnail(source("first"));
    prefetchPreviewThumbnail(source("obsolete"));
    prefetchPreviewThumbnail(source("latest"));
    expect(ThumbnailWorker.instances).toHaveLength(1);
    expect(
      ThumbnailWorker.instances[0].postMessage.mock.lastCall?.[0].url
    ).toMatch(/\/bridge\/6\/first\.jpg$/);
    complete();
    expect(ThumbnailWorker.instances).toHaveLength(2);
    expect(
      ThumbnailWorker.instances[1].postMessage.mock.lastCall?.[0].url
    ).toMatch(/\/bridge\/6\/latest\.jpg$/);
    complete();
    prefetchPreviewThumbnail(source("first"));
    expect(ThumbnailWorker.instances).toHaveLength(2);
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
});
