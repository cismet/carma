import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadTiffJpeg } from "./tiff-download";
import type {
  TiffDownloadRequest,
  TiffDownloadResponse,
} from "./tiff-download-types";

class DownloadWorker {
  static instances: DownloadWorker[] = [];
  onmessage: ((event: MessageEvent<TiffDownloadResponse>) => void) | null =
    null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    DownloadWorker.instances.push(this);
  }
  reply(value: TiffDownloadResponse) {
    this.onmessage?.({ data: value } as MessageEvent<TiffDownloadResponse>);
  }
}

const request: TiffDownloadRequest = {
  url: "https://images.example/photo.tif",
  nativeSize: { width: 1000, height: 800 },
  watermark: {
    imageUrl: "https://images.example/watermark.png",
    position: "center",
    opacity: 1,
  },
};
const jpeg = () => new Blob(["jpeg"], { type: "image/jpeg" });

describe("native TIFF export worker ownership", () => {
  beforeEach(() => {
    DownloadWorker.instances = [];
    vi.stubGlobal("Worker", DownloadWorker);
    vi.stubGlobal("OffscreenCanvas", class {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("terminates the worker after receiving the completed JPG", async () => {
    const pending = downloadTiffJpeg(request);
    const worker = DownloadWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith(request);
    const blob = jpeg();
    worker.reply({ blob });
    await expect(pending).resolves.toBe(blob);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
  });

  it("limits exports to one native-sized canvas at a time", async () => {
    const pending = downloadTiffJpeg(request);
    await expect(downloadTiffJpeg(request)).rejects.toThrow("bereits");
    expect(DownloadWorker.instances).toHaveLength(1);
    DownloadWorker.instances[0].reply({ blob: jpeg() });
    await pending;
  });

  it("aborts the worker and releases its allocations when its owner cancels", async () => {
    const controller = new AbortController();
    const pending = downloadTiffJpeg(request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(DownloadWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const retry = downloadTiffJpeg(request);
    DownloadWorker.instances[1].reply({ blob: jpeg() });
    await retry;
  });

  it("propagates decoder errors instead of returning the original TIFF", async () => {
    const pending = downloadTiffJpeg(request);
    DownloadWorker.instances[0].reply({
      error: "TIFF dimensions do not match the camera calibration",
    });
    await expect(pending).rejects.toThrow("dimensions");
    expect(DownloadWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("rejects non-JPEG results", async () => {
    const pending = downloadTiffJpeg(request);
    DownloadWorker.instances[0].reply({
      blob: new Blob(["TIFF"], { type: "image/tiff" }),
    });
    await expect(pending).rejects.toThrow("gültiges Bild");
    expect(DownloadWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("terminates exports that exceed their deadline", async () => {
    vi.useFakeTimers();
    const pending = downloadTiffJpeg(request);
    const rejected = expect(pending).rejects.toThrow("rechtzeitig");
    vi.advanceTimersByTime(5 * 60 * 1000);
    await rejected;
    expect(DownloadWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("does not start work for an already aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      downloadTiffJpeg(request, controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(DownloadWorker.instances).toHaveLength(0);
  });
});
