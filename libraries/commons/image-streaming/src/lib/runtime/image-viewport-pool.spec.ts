import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import type { NativePreviewWindow } from "../core/image-viewport-window";
import {
  ImageViewportPool,
  type ImageViewportSource,
} from "./image-viewport-pool";

type Request = {
  url: string;
  generation: number;
  window: NativePreviewWindow;
  activeSourceByteLimit: number;
};
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  get requests(): Request[] {
    return this.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => "url" in message);
  }
  reply(data: Record<string, unknown>) {
    this.onmessage?.({ data } as MessageEvent);
  }
}
const source = (id = "north"): ImageViewportSource => ({
  id,
  kind: "avif",
  url: `https://images.test/${id}.avif`,
  nativeSize: { width: 2000 as DevicePixels, height: 1600 as DevicePixels },
});
const windowAt = (x = 0): NativePreviewWindow => ({
  source: {
    x: x as DevicePixels,
    y: 0 as DevicePixels,
    width: 1000 as DevicePixels,
    height: 800 as DevicePixels,
  },
  target: { width: 500 as DevicePixels, height: 400 as DevicePixels },
});
const wholeWindow = (): NativePreviewWindow => ({
  source: {
    x: 0 as DevicePixels,
    y: 0 as DevicePixels,
    width: 2000 as DevicePixels,
    height: 1600 as DevicePixels,
  },
  target: windowAt().target,
});
const image = () =>
  ({ width: 500, height: 400, close: vi.fn() } as unknown as ImageBitmap);
const pools: ImageViewportPool[] = [];
const setup = (options: { maxImages?: number; maxBytes?: number } = {}) => {
  const workers: FakeWorker[] = [];
  const pool = new ImageViewportPool({
    ...options,
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  pools.push(pool);
  return { pool, workers };
};
const flush = () => vi.advanceTimersByTime(16);
const finish = (worker: FakeWorker, bitmap = image()) => {
  const request = worker.requests.at(-1)!;
  worker.reply({
    bitmap,
    generation: request.generation,
    complete: true,
    workerMemory: {
      compositionBytes: bitmap.width * bitmap.height * 4,
      decodeCanvasBytes: 0,
      workingBytes: 0,
    },
  });
  return bitmap;
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  pools.splice(0).forEach((pool) => pool.dispose());
  vi.useRealTimers();
});

describe("shared production image viewport pool", () => {
  it("keeps displayed input metadata separate from its coarser overview and readiness updates", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(windowAt());
    flush();
    const worker = workers[0];
    const generation = worker.requests.at(-1)!.generation;
    const detail = image();
    const input = { width: 1000, height: 800, level: 1, backend: "avif-pyramid" };
    const overviewInput = { width: 500, height: 400, level: 2, backend: "avif-pyramid" };
    worker.reply({
      bitmap: detail,
      generation,
      complete: true,
      sampleDensity: 0.5,
      sourceWidth: input.width,
      sourceHeight: input.height,
      sourceLevel: input.level,
      sourceBackend: input.backend,
    });
    const overview = image();
    worker.reply({
      kind: "full-image",
      bitmap: overview,
      sourceWidth: overviewInput.width,
      sourceHeight: overviewInput.height,
      sourceLevel: overviewInput.level,
      sourceBackend: overviewInput.backend,
    });
    expect(handle.snapshot()).toMatchObject({ bitmap: detail, input, overview, overviewInput });
    worker.reply({
      kind: "source-memory",
      imageId: source().id,
      sourceIdentity: source().url,
      sourceResidentBytes: 1024,
      sourceWidth: overviewInput.width,
      sourceHeight: overviewInput.height,
      sourceLevel: overviewInput.level,
      sourceBackend: overviewInput.backend,
      readiness: [{
        level: 2,
        width: 500,
        height: 400,
        cols: 1,
        rows: 1,
        tileWidth: 500,
        tileHeight: 400,
        states: new Uint8Array([3]),
        wholeOverviewReady: true,
        previouslyFetchedCells: new Uint8Array([1]),
        persistentAvailabilityVerified: false,
        persistentSnapshotExpiresAt: null,
      }],
    });
    const blurry = { width: 250, height: 200, close: vi.fn() } as unknown as ImageBitmap;
    worker.reply({
      bitmap: blurry,
      generation,
      crop: windowAt().source,
      sampleDensity: 0.25,
      complete: true,
      sourceWidth: overviewInput.width,
      sourceHeight: overviewInput.height,
      sourceLevel: overviewInput.level,
      sourceBackend: overviewInput.backend,
    });
    expect(handle.snapshot()).toMatchObject({ bitmap: detail, input, overview, overviewInput });
    expect(blurry.close).toHaveBeenCalledOnce();
    expect(detail.close).not.toHaveBeenCalled();
  });
  it("does not replace accepted input metadata with a stale viewport reply", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(windowAt());
    flush();
    const worker = workers[0];
    const originalGeneration = worker.requests.at(-1)!.generation;
    const detail = image();
    const input = { width: 1000, height: 800, level: 1, backend: "avif-pyramid" };
    worker.reply({
      bitmap: detail,
      generation: originalGeneration,
      complete: true,
      sourceWidth: input.width,
      sourceHeight: input.height,
      sourceLevel: input.level,
      sourceBackend: input.backend,
    });
    handle.setViewport(windowAt(100));
    flush();
    expect(worker.requests.at(-1)!.generation).not.toBe(originalGeneration);
    const stale = image();
    worker.reply({
      bitmap: stale,
      generation: originalGeneration,
      complete: true,
      sourceWidth: 2000,
      sourceHeight: 1600,
      sourceLevel: 0,
      sourceBackend: "jpeg",
    });
    expect(handle.snapshot()).toMatchObject({ bitmap: detail, input });
    expect(stale.close).toHaveBeenCalledOnce();
    expect(detail.close).not.toHaveBeenCalled();
  });
  it("shares scene protocol leases with the same worker/ROI ownership and parked memory acknowledgements", () => {
    const { pool, workers } = setup();
    const lease = pool.acquireProtocol(source());
    const worker = lease.createWorker(),
      bitmap = image();
    lease.publish({
      bitmap,
      frame: windowAt(),
      density: 0.5,
      complete: true,
      backend: "avif-pyramid",
      sourceWidth: 1000,
      sourceHeight: 800,
      viewportPixels: 200000,
      sourceResidentBytes: 2048,
      workerCanvasBytes: 800000,
      displayCopyBytes: 800000,
      externalBytes: 0,
    });
    expect(pool.peek(source())?.bitmap).toBe(bitmap);
    lease.release();
    workers[0].reply({
      kind: "source-memory",
      imageId: source().id,
      sourceIdentity: source().url,
      sourceResidentBytes: 1024,
    });
    const restored = pool.acquireProtocol(source());
    expect(restored.worker).toBe(worker);
    expect(restored.retained).toMatchObject({
      bitmap,
      frame: windowAt(),
      backend: "avif-pyramid",
      sourceResidentBytes: 1024,
    });
    expect(workers).toHaveLength(1);
    expect(bitmap.close).not.toHaveBeenCalled();
    restored.release();
  });
  it("coalesces rapid viewport updates and closes obsolete replies", () => {
    const { pool, workers } = setup(),
      handle = pool.acquire(source());
    handle.setViewport(windowAt());
    handle.setViewport(windowAt(100));
    flush();
    expect(workers).toHaveLength(1);
    expect(workers[0].requests).toHaveLength(1);
    expect(workers[0].requests[0].window.source.x).toBe(100);
    const obsolete = image();
    workers[0].reply({
      bitmap: obsolete,
      generation: workers[0].requests[0].generation - 1,
    });
    expect(obsolete.close).toHaveBeenCalledOnce();
    const current = finish(workers[0]);
    handle.setViewport(windowAt(100));
    flush();
    expect(workers[0].requests).toHaveLength(1);
    expect(handle.snapshot().bitmap).toBe(current);
  });
  it("dispatches the latest wheel crop at the original frame deadline during continuous input", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(windowAt());
    for (const x of [10, 20, 30]) {
      vi.advanceTimersByTime(4);
      handle.setViewport(windowAt(x));
    }
    expect(workers).toHaveLength(0);
    vi.advanceTimersByTime(4);
    expect(workers[0].requests).toHaveLength(1);
    expect(workers[0].requests[0].window.source.x).toBe(30);
    expect(workers[0].requests[0]).toMatchObject({
      releaseCanvasAfterPublish: true,
    });
  });
  it("restores a parked display ROI immediately and cancels abandoned background work", () => {
    const { pool, workers } = setup(),
      first = pool.acquire(source());
    first.setViewport(windowAt());
    flush();
    const displayed = finish(workers[0]);
    first.release();
    expect(workers[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ cancel: true, park: true })
    );
    const stale = image();
    workers[0].reply({
      bitmap: stale,
      generation: workers[0].requests[0].generation,
    });
    expect(stale.close).toHaveBeenCalledOnce();
    const restored = pool.acquire(source());
    expect(restored.snapshot().bitmap).toBe(displayed);
    restored.setViewport(windowAt());
    flush();
    expect(workers).toHaveLength(1);
    expect(workers[0].requests).toHaveLength(2);
    expect(workers[0].requests[1]).toMatchObject({ reusePublished: true });
    expect(displayed.close).not.toHaveBeenCalled();
  });
  it("evicts the oldest parked image by count and closes its owned bitmap", () => {
    const { pool, workers } = setup({ maxImages: 2 });
    const first = pool.acquire(source("north"));
    first.setViewport(windowAt());
    flush();
    const old = finish(workers[0]);
    first.release();
    const second = pool.acquire(source("east"));
    second.setViewport(windowAt());
    flush();
    finish(workers[1]);
    second.release();
    const third = pool.acquire(source("south"));
    third.setViewport(windowAt());
    flush();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(old.close).toHaveBeenCalledOnce();
    expect(pool.metrics.images.map((entry) => entry.id)).toEqual([
      "east",
      "south",
    ]);
  });
  it("evicts a parked bitmap that exceeds the byte budget and accounts actual worker/source bytes", () => {
    const { pool, workers } = setup({ maxBytes: 1024 * 1024 });
    const handle = pool.acquire(source());
    handle.setViewport(windowAt());
    flush();
    const bitmap = finish(workers[0]);
    workers[0].reply({
      kind: "source-memory",
      imageId: "north",
      sourceIdentity: source().url,
      sourceResidentBytes: 1024,
      workerMemory: {
        compositionBytes: 800000,
        decodeCanvasBytes: 512,
        workingBytes: 128,
      },
    });
    expect(handle.snapshot().metrics).toMatchObject({
      viewportPixels: 200000,
      bitmapBytes: 800000,
      canvasBytes: 800000,
      workerBytes: 800640,
      sourceBytes: 1024,
      managedBytes: 2401664,
    });
    handle.release();
    expect(pool.metrics.images).toHaveLength(0);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it("keeps independent active viewports for two readers of the same source", () => {
    const { pool, workers } = setup();
    const first = pool.acquire(source()),
      second = pool.acquire(source());
    first.setViewport(windowAt());
    second.setViewport(windowAt(100));
    flush();
    expect(workers).toHaveLength(2);
    expect(workers[0].requests[0].window.source.x).toBe(0);
    expect(workers[1].requests[0].window.source.x).toBe(100);
    first.release();
    expect(workers[1].postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ park: true })
    );
  });
  it("accepts a lower-density zoom-out frame when it fills newly visible image area", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(windowAt());
    flush();
    const detail = finish(workers[0]);
    const expanded: NativePreviewWindow = {
      source: {
        x: 0 as DevicePixels,
        y: 0 as DevicePixels,
        width: 2000 as DevicePixels,
        height: 1600 as DevicePixels,
      },
      target: windowAt().target,
    };
    handle.setViewport(expanded);
    flush();
    const wholeImage = image();
    workers[0].reply({
      bitmap: wholeImage,
      crop: expanded.source,
      sampleDensity: 0.25,
      generation: workers[0].requests.at(-1)!.generation,
      complete: true,
    });
    expect(wholeImage.width).toBe(detail.width);
    expect(wholeImage.height).toBe(detail.height);
    expect(handle.snapshot()).toMatchObject({
      bitmap: wholeImage,
      frame: expanded,
      loading: false,
    });
    expect(wholeImage.close).not.toHaveBeenCalled();
    expect(detail.close).toHaveBeenCalledOnce();
  });
  it("keeps the sharp core until an expanded zoom-out frame reaches the requested density", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(windowAt());
    flush();
    const detail = finish(workers[0]);
    const expanded: NativePreviewWindow = {
      source: {
        x: 0 as DevicePixels,
        y: 0 as DevicePixels,
        width: 2000 as DevicePixels,
        height: 1600 as DevicePixels,
      },
      target: windowAt().target,
    };
    handle.setViewport(expanded);
    flush();
    const generation = workers[0].requests.at(-1)!.generation;
    const intermediate = {
      width: 250,
      height: 200,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    workers[0].reply({
      bitmap: intermediate,
      crop: expanded.source,
      sampleDensity: 0.125,
      generation,
      complete: false,
    });
    expect(handle.snapshot()).toMatchObject({
      bitmap: detail,
      frame: windowAt(),
      requested: expanded,
      loading: true,
    });
    expect(intermediate.close).toHaveBeenCalledOnce();
    expect(detail.close).not.toHaveBeenCalled();

    const ready = image();
    workers[0].reply({
      bitmap: ready,
      crop: expanded.source,
      sampleDensity: 0.25,
      generation,
      complete: true,
    });
    expect(handle.snapshot()).toMatchObject({
      bitmap: ready,
      frame: expanded,
      loading: false,
    });
    expect(ready.close).not.toHaveBeenCalled();
    expect(detail.close).toHaveBeenCalledOnce();
  });
  it("rejects a smaller blurry reply when the retained detail still covers the requested crop", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(windowAt());
    flush();
    const detail = finish(workers[0]);
    const blurry = {
      width: 250,
      height: 200,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    workers[0].reply({
      bitmap: blurry,
      crop: windowAt().source,
      sampleDensity: 0.25,
      generation: workers[0].requests.at(-1)!.generation,
      complete: true,
    });
    expect(handle.snapshot()).toMatchObject({
      bitmap: detail,
      frame: windowAt(),
      loading: false,
    });
    expect(blurry.close).toHaveBeenCalledOnce();
    expect(detail.close).not.toHaveBeenCalled();
  });
  it("publishes a prepared wider zoom-out crop immediately without another worker request", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(windowAt());
    flush();
    const detail = finish(workers[0]);
    const expanded: NativePreviewWindow = {
      source: {
        x: 0 as DevicePixels,
        y: 0 as DevicePixels,
        width: 2000 as DevicePixels,
        height: 1600 as DevicePixels,
      },
      target: windowAt().target,
    };
    const prepared = image();
    workers[0].reply({
      kind: "prepared-frame",
      bitmap: prepared,
      crop: expanded.source,
      sampleDensity: 0.25,
      sourceWidth: 500,
      sourceHeight: 400,
      sourceLevel: 2,
      sourceBackend: "avif-pyramid",
    });
    expect(handle.snapshot().prepared).toMatchObject({
      crop: expanded.source,
      density: 0.25,
    });
    handle.setViewport(expanded);
    expect(handle.snapshot()).toMatchObject({
      bitmap: prepared,
      frame: expanded,
      loading: false,
      input: { width: 500, height: 400, level: 2, backend: "avif-pyramid" },
    });
    expect(handle.snapshot().prepared).toBeUndefined();
    flush();
    expect(workers[0].requests).toHaveLength(1);
    expect(prepared.close).not.toHaveBeenCalled();
    expect(detail.close).toHaveBeenCalledOnce();
  });
  it("keeps the learned full-image quality floor during zoom-in without double-counting its first alias", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(wholeWindow());
    flush();
    const whole = image();
    workers[0].reply({
      bitmap: whole,
      generation: workers[0].requests.at(-1)!.generation,
      sampleDensity: 0.25,
      sourceWidth: 500,
      sourceHeight: 400,
      sourceLevel: 2,
      complete: true,
      workerMemory: { compositionBytes: 0, decodeCanvasBytes: 0, workingBytes: 0 },
    });
    expect(handle.snapshot().baseline).toMatchObject({
      bitmap: whole,
      frame: wholeWindow(),
      density: 0.25,
      input: { level: 2, width: 500, height: 400 },
    });
    expect(handle.snapshot().metrics).toMatchObject({
      bitmapBytes: 800000,
      baselineBytes: 0,
      canvasBytes: 1600000,
      managedBytes: 2400000,
    });
    handle.setViewport(windowAt());
    flush();
    const detail = image();
    workers[0].reply({
      bitmap: detail,
      generation: workers[0].requests.at(-1)!.generation,
      sampleDensity: 0.5,
      complete: true,
      workerMemory: { compositionBytes: 0, decodeCanvasBytes: 0, workingBytes: 0 },
    });
    expect(handle.snapshot().baseline?.bitmap).toBe(whole);
    expect(handle.snapshot().bitmap).toBe(detail);
    expect(whole.close).not.toHaveBeenCalled();
    expect(handle.snapshot().metrics).toMatchObject({
      baselineBytes: 800000,
      managedBytes: 3200000,
      budgetBytes: 3200000,
    });
    expect(workers[0].requests.at(-1)!.activeSourceByteLimit).toBe(0);
    expect(workers[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ budgetOnly: true, activeSourceByteLimit: 0 })
    );
    const overview = {
      width: 250, height: 200, close: vi.fn(),
    } as unknown as ImageBitmap;
    workers[0].reply({ kind: "full-image", bitmap: overview });
    expect(handle.snapshot().baseline?.bitmap).toBe(whole);
    expect(overview.close).toHaveBeenCalledOnce();
    expect(whole.close).not.toHaveBeenCalled();
    pool.dispose();
    expect(whole.close).toHaveBeenCalledOnce();
    expect(detail.close).toHaveBeenCalledOnce();
  });
  it("promotes sharper complete-image frames and closes replaced aliases exactly once", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    const initial: NativePreviewWindow = {
      ...wholeWindow(),
      target: { width: 250 as DevicePixels, height: 200 as DevicePixels },
    };
    handle.setViewport(initial);
    flush();
    const coarse = {
      width: 250, height: 200, close: vi.fn(),
    } as unknown as ImageBitmap;
    workers[0].reply({
      bitmap: coarse,
      generation: workers[0].requests.at(-1)!.generation,
      sampleDensity: 0.125,
      complete: true,
    });
    expect(handle.snapshot().baseline?.bitmap).toBe(coarse);
    handle.setViewport(wholeWindow());
    flush();
    const fine = image();
    workers[0].reply({
      bitmap: fine,
      generation: workers[0].requests.at(-1)!.generation,
      sampleDensity: 0.25,
      complete: true,
    });
    expect(handle.snapshot().baseline?.bitmap).toBe(fine);
    expect(coarse.close).toHaveBeenCalledOnce();
    pool.dispose();
    expect(fine.close).toHaveBeenCalledOnce();
  });
  it("restores a sufficiently sharp learned whole image synchronously without another decode", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(wholeWindow());
    flush();
    const whole = finish(workers[0]);
    handle.setViewport(windowAt());
    flush();
    const detail = finish(workers[0]);
    expect(handle.snapshot().baseline?.bitmap).toBe(whole);
    const requests = workers[0].requests.length;
    handle.setViewport(wholeWindow());
    expect(handle.snapshot()).toMatchObject({
      bitmap: whole,
      frame: wholeWindow(),
      loading: false,
    });
    expect(detail.close).toHaveBeenCalledOnce();
    expect(whole.close).not.toHaveBeenCalled();
    flush();
    expect(workers[0].requests).toHaveLength(requests);
    pool.dispose();
    expect(whole.close).toHaveBeenCalledOnce();
  });
  it("does not learn an undersampled progressive image as the physical-resolution floor", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(wholeWindow());
    flush();
    const coarse = {
      width: 250, height: 200, close: vi.fn(),
    } as unknown as ImageBitmap;
    workers[0].reply({
      bitmap: coarse,
      generation: workers[0].requests.at(-1)!.generation,
      sampleDensity: 0.125,
      complete: false,
    });
    expect(handle.snapshot().bitmap).toBe(coarse);
    expect(handle.snapshot().baseline).toBeUndefined();
    const fine = image();
    workers[0].reply({
      bitmap: fine,
      generation: workers[0].requests.at(-1)!.generation,
      sampleDensity: 0.25,
      complete: true,
    });
    expect(handle.snapshot().baseline?.bitmap).toBe(fine);
    expect(coarse.close).toHaveBeenCalledOnce();
  });
  it("protects overlapping sharp pixels even when a blurry expanded reply declares completion", () => {
    const { pool, workers } = setup();
    const handle = pool.acquire(source());
    handle.setViewport(windowAt());
    flush();
    const detail = finish(workers[0]);
    handle.setViewport(wholeWindow());
    flush();
    const blurry = {
      width: 250, height: 200, close: vi.fn(),
    } as unknown as ImageBitmap;
    workers[0].reply({
      bitmap: blurry,
      crop: wholeWindow().source,
      sampleDensity: 0.125,
      generation: workers[0].requests.at(-1)!.generation,
      complete: true,
    });
    expect(handle.snapshot().bitmap).toBe(detail);
    expect(blurry.close).toHaveBeenCalledOnce();
    expect(detail.close).not.toHaveBeenCalled();
  });
});
