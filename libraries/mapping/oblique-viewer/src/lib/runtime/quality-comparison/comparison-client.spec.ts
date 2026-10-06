// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createComparisonClient,
  type ComparisonReply,
} from "./comparison-client";
import type { ImageQualityVariant } from "../../core/utils/image-quality-comparison";
class Worker {
  static instance: Worker;
  onmessage: ((event: MessageEvent<ComparisonReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    Worker.instance = this;
  }
}
beforeEach(() => {
  vi.stubGlobal("Worker", Worker);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:entry"),
      revokeObjectURL: vi.fn(),
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("comparison worker generations", () => {
  it("discards obsolete bitmaps and only publishes the latest crop", () => {
    const received = vi.fn(),
      client = createComparisonClient(
        "https://images.test/comparison-worker.mjs",
        received
      );
    const candidate = {
      href: "https://images.test/image.avif",
      bytes: 5954,
    } as ImageQualityVariant;
    client.load(candidate, [0, 0, 512, 512]);
    client.load(candidate, [256, 0, 768, 512]);
    expect(Worker.instance.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ encodedBytes: 5954 })
    );
    const stale = { close: vi.fn() } as unknown as ImageBitmap;
    Worker.instance.onmessage!({
      data: { generation: 1, bitmap: stale },
    } as MessageEvent<ComparisonReply>);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(received).not.toHaveBeenCalled();
    Worker.instance.onmessage!({
      data: { generation: 2, requestedBytes: 4096 },
    } as MessageEvent<ComparisonReply>);
    expect(received).toHaveBeenCalledWith({
      generation: 2,
      requestedBytes: 4096,
    });
    client.dispose();
    expect(Worker.instance.terminate).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:entry");
  });
});

describe("offline RGB-error requests", () => {
  it("uses the reference PNG protocol and shared crop while suppressing stale AVIF replies", () => {
    const received = vi.fn();
    const client = createComparisonClient(
      "https://images.test/worker.mjs",
      received
    );
    const candidate = {
      href: "https://images.test/source.avif",
      bytes: 500,
      errorTiles: {
        baseUrl: "https://images.test/errors/",
        tileSize: 512,
        gain: 32,
      },
    } as ImageQualityVariant;
    const bounds = [256, 512, 768, 1024] as const;
    client.load(candidate, bounds);
    client.loadError(candidate, bounds);
    expect(Worker.instance.postMessage).toHaveBeenLastCalledWith({
      type: "reference",
      generation: 2,
      reference: candidate.errorTiles,
      bounds,
    });
    const old = { close: vi.fn() } as unknown as ImageBitmap;
    Worker.instance.onmessage!({
      data: { generation: 1, bitmap: old },
    } as MessageEvent<ComparisonReply>);
    expect(old.close).toHaveBeenCalledOnce();
    expect(received).not.toHaveBeenCalled();
    Worker.instance.onmessage!({
      data: { generation: 2, bounds, requestedBytes: 42 },
    } as MessageEvent<ComparisonReply>);
    expect(received).toHaveBeenCalledWith({
      generation: 2,
      bounds,
      requestedBytes: 42,
    });
    client.dispose();
  });
  it("rejects unavailable error maps before sending any worker request", () => {
    const client = createComparisonClient(
      "https://images.test/worker.mjs",
      vi.fn()
    );
    expect(() =>
      client.loadError(
        { href: "https://images.test/image.avif" } as ImageQualityVariant,
        [0, 0, 512, 512]
      )
    ).toThrow("Missing offline RGB-error tiles");
    expect(Worker.instance.postMessage).not.toHaveBeenCalled();
    client.dispose();
  });
});
