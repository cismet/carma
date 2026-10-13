import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFrameImageBitmap } from "./create-frame-image-bitmap";

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  fail() {
    this.onerror?.({
      error: new Error("worker unavailable"),
      message: "worker unavailable",
    } as ErrorEvent);
  }
}

const workers: FakeWorker[] = [];
const makeFrame = () => {
  const clone = { close: vi.fn() } as unknown as VideoFrame;
  const frame = {
    clone: vi.fn(() => clone),
    close: vi.fn(),
  } as unknown as VideoFrame;
  return { frame, clone };
};
const makeBitmap = () => ({ close: vi.fn() } as unknown as ImageBitmap);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {});
  vi.stubGlobal(
    "Worker",
    class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    }
  );
  vi.stubGlobal("createImageBitmap", vi.fn());
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  workers.splice(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createFrameImageBitmap", () => {
  it("converts a transferable clone in a shared worker and leaves the caller frame open", async () => {
    const { frame, clone } = makeFrame();
    const bitmap = makeBitmap();
    const options = { imageOrientation: "flipY" } as ImageBitmapOptions;
    const result = createFrameImageBitmap(frame, options);
    const worker = workers[0];
    const [request, transfer] = worker.postMessage.mock.calls[0];
    expect(request).toMatchObject({ frame: clone, options });
    expect(request.id).toEqual(expect.any(Number));
    expect(transfer).toEqual([clone]);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
    worker.reply({ id: request.id, bitmap });
    await expect(result).resolves.toBe(bitmap);
    expect(frame.close).not.toHaveBeenCalled();
    expect(clone.close).not.toHaveBeenCalled();
    expect(workers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects an aborted request and closes a bitmap that arrives late", async () => {
    const { frame } = makeFrame();
    const abort = new AbortController();
    const result = createFrameImageBitmap(frame, undefined, abort.signal);
    const worker = workers[0];
    const [{ id }] = worker.postMessage.mock.calls[0];
    abort.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.postMessage).toHaveBeenLastCalledWith({ id, cancel: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(worker.terminate).not.toHaveBeenCalled();
    const bitmap = makeBitmap();
    worker.reply({ id, bitmap });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(frame.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("keeps an aborted conversion alive until its cancellation acknowledgement", async () => {
    const { frame } = makeFrame();
    const abort = new AbortController();
    const result = createFrameImageBitmap(frame, undefined, abort.signal);
    const worker = workers[0];
    const [{ id }] = worker.postMessage.mock.calls[0];
    abort.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });

    await vi.advanceTimersByTimeAsync(5000);
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.reply({ id, cancelled: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("falls back to the original frame on worker failure", async () => {
    const { frame } = makeFrame();
    const bitmap = makeBitmap();
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(bitmap);
    const result = createFrameImageBitmap(frame);
    workers[0].fail();
    await expect(result).resolves.toBe(bitmap);
    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(frame, undefined);
    expect(frame.close).not.toHaveBeenCalled();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it("uses direct conversion in a worker realm", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    const { frame } = makeFrame();
    const bitmap = makeBitmap();
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(bitmap);
    await expect(createFrameImageBitmap(frame)).resolves.toBe(bitmap);
    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(frame, undefined);
    expect(workers).toHaveLength(0);
  });

  it("closes a late direct-conversion bitmap after abort", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    let finish!: (bitmap: ImageBitmap) => void;
    vi.mocked(globalThis.createImageBitmap).mockReturnValue(
      new Promise<ImageBitmap>((resolve) => (finish = resolve))
    );
    const abort = new AbortController();
    const result = createFrameImageBitmap(
      makeFrame().frame,
      undefined,
      abort.signal
    );
    await Promise.resolve();
    abort.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    const bitmap = makeBitmap();
    finish(bitmap);
    await vi.advanceTimersByTimeAsync(0);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("uses direct conversion when the frame cannot be cloned", async () => {
    const frame = { close: vi.fn() } as unknown as VideoFrame;
    const bitmap = makeBitmap();
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(bitmap);
    await expect(createFrameImageBitmap(frame)).resolves.toBe(bitmap);
    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(frame, undefined);
    expect(workers).toHaveLength(0);
  });
});
