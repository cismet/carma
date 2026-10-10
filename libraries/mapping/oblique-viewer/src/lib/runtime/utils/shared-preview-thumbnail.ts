import {
  drawImageLevels,
  BoundedImageRangeCache,
} from "@carma-commons/image-pyramid";
import type { DevicePixels, Ratio } from "@carma-units";
import type { ThumbnailSource } from "./preview-thumbnail-cache";
import { nativePixelPool, nativePreviewSource } from "./native-preview-pool";

const EDGE = 512;
const VERSION = "thumbnail-png-512-v1";
const storage = (key: string) =>
  new BoundedImageRangeCache(`${key}#${VERSION}`);

export const readSharedThumbnailBlob = async (
  key: string,
  revision: string | undefined,
  signal: AbortSignal
): Promise<Blob | undefined> => {
  if (!revision) return;
  const cache = storage(key);
  const header = await cache.get(0, 4, revision, signal);
  if (!header) return;
  const length = new DataView(header.buffer, header.byteOffset, 4).getUint32(0);
  if (!length || length > 8 * 1024 * 1024 - 4) return;
  const bytes = await cache.get(4, length, revision, signal);
  return bytes
    ? new Blob([new Uint8Array(bytes)], { type: "image/png" })
    : undefined;
};

const persistBlob = async (
  key: string,
  revision: string | undefined,
  blob: Blob
) => {
  if (!revision || blob.size > 8 * 1024 * 1024 - 4) return false;
  const bytes = new Uint8Array(4 + blob.size);
  new DataView(bytes.buffer).setUint32(0, blob.size);
  bytes.set(new Uint8Array(await blob.arrayBuffer()), 4);
  await storage(key).put(0, bytes, revision);
  const header = await storage(key).get(
    0,
    4,
    revision,
    new AbortController().signal
  );
  return (
    !!header &&
    new DataView(header.buffer, header.byteOffset, 4).getUint32(0) === blob.size
  );
};

/** Whole-photo thumbnail is a coarse demand of the same per-image source, not another decoder. */
export const createSharedPreviewThumbnail = async (
  source: ThumbnailSource,
  key: string,
  signal: AbortSignal
) => {
  if (!source.avifPyramidUrl || !source.nativeSize)
    throw Error("AVIF thumbnail needs camera dimensions");
  const input = nativePreviewSource({
    imageId: source.imageId,
    path: source.previewPath,
    sourceUrl: source.avifPyramidUrl,
    avifPyramidUrl: source.avifPyramidUrl,
    nativeSize: {
      width: source.nativeSize.width as DevicePixels,
      height: source.nativeSize.height as DevicePixels,
    },
    minimumQualityLevel: source.minimumQualityLevel,
  });
  const lease = nativePixelPool.acquireDemand(input, {
    priority: "low",
    coarseOnly: true,
  });
  const abort = () => lease.release();
  signal.addEventListener("abort", abort, { once: true });
  let canvas: OffscreenCanvas | undefined;
  let bitmap: ImageBitmap | undefined;
  try {
    signal.throwIfAborted();
    const stack = await lease.ready;
    signal.throwIfAborted();
    let revision = stack.source.cacheRevision;
    const stored = await readSharedThumbnailBlob(key, revision, signal);
    if (stored) {
      bitmap = await createImageBitmap(stored);
      signal.throwIfAborted();
      return { bitmap, blob: stored, revision, persisted: true };
    }
    const pyramid = stack.pyramid!;
    const scale = Math.min(
      1,
      EDGE / Math.max(pyramid.native.width, pyramid.native.height)
    );
    const width = Math.max(1, Math.round(pyramid.native.width * scale));
    const height = Math.max(1, Math.round(pyramid.native.height * scale));
    lease.setView(
      {
        visible: {
          x: 0 as DevicePixels,
          y: 0 as DevicePixels,
          ...pyramid.native,
        },
        density: scale as Ratio,
      },
      width * height
    );
    await new Promise<void>((resolve, reject) => {
      let unsubscribe: () => void = () => undefined;
      const finish = (error?: unknown) => {
        unsubscribe();
        signal.removeEventListener("abort", stopped);
        if (error) reject(error);
        else resolve();
      };
      const stopped = () =>
        finish(signal.reason ?? new DOMException("Aborted", "AbortError"));
      const check = () => {
        if (signal.aborted) return stopped();
        if (stack.error) return finish(Error(stack.error));
        if (lease.visibleReady) finish();
      };
      unsubscribe = stack.subscribe(check);
      signal.addEventListener("abort", stopped, { once: true });
      check();
    });
    signal.throwIfAborted();
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw Error("Thumbnail canvas unavailable");
    drawImageLevels(context, stack, { originX: 0, originY: 0, scale }, canvas, {
      plan: lease.plan,
    });
    const blob = await canvas.convertToBlob({ type: "image/png" });
    signal.throwIfAborted();
    bitmap = canvas.transferToImageBitmap();
    revision = stack.source.cacheRevision;
    // Storage does not hold up the first thumbnail. The caller retains compressed RAM until committed.
    const persistence = persistBlob(key, revision, blob).catch(() => false);
    return { bitmap, blob, revision, persisted: false, persistence };
  } catch (error) {
    bitmap?.close();
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    lease.release();
    if (canvas) canvas.width = canvas.height = 1;
  }
};
