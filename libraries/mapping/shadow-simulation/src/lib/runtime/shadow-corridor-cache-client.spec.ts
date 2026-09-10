import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@carma-commons/utils", () => ({
  resolveDerivedCacheAssetEpoch: ({
    production,
    assetUrl,
  }: {
    production: boolean;
    assetUrl: string;
  }) =>
    production && assetUrl === "https://example.test/producer-12345678.js"
      ? assetUrl
      : null,
}));

import {
  createShadowCorridorCache,
  type ShadowCorridorCache,
} from "./shadow-corridor-cache-client";
import type { ShadowCorridorCacheRequest } from "./shadow-corridor-cache.worker";
import { SHADOW_CORRIDOR_CACHE } from "../core/shadow-corridor-cache-record";

const identity = {
  source: "terrain:1",
  dateTime: "2026-09-08T12:00:00Z",
  corridor: "1:2",
  resolution: "5",
  geometryFingerprint: "tiles:123",
  samples: 1,
};
const capture = () => ({
  width: 1,
  height: 1,
  visibility: new Float32Array([0.5]),
  depth: new Float32Array([0.3]),
  captureMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  crop: [0, 0, 1, 1],
  worldBasis: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 400, 500, 600, 1],
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  sent: { request: ShadowCorridorCacheRequest; transfer: ArrayBuffer[] }[] = [];
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(request: ShadowCorridorCacheRequest, transfer: ArrayBuffer[]) {
    this.sent.push({
      request: structuredClone(request, { transfer }),
      transfer,
    });
  }
  reply(value: unknown) {
    this.onmessage?.({ data: value } as MessageEvent);
  }
}
let client: ShadowCorridorCache;
beforeEach(() => {
  vi.stubEnv("PROD", true);
  vi.stubGlobal("Worker", FakeWorker);
  FakeWorker.instances = [];
  client = createShadowCorridorCache(
    "https://example.test/producer-12345678.js"
  );
});
afterEach(() => {
  client.dispose();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("optional corridor persistence worker", () => {
  it("cancels obsolete work without disabling the cache or accepting late replies", async () => {
    const reading = client.read(identity);
    const oldWorker = FakeWorker.instances[0];
    const lateReply = oldWorker.onmessage;
    const oldId = oldWorker.sent[0].request.id;
    client.cancelPending();
    expect(await reading).toBeNull();
    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(client.enabled).toBe(true);
    const next = client.read({ ...identity, dateTime: "2026-09-08T13:00:00Z" });
    lateReply?.({ data: { id: oldId, record: capture() } } as MessageEvent);
    expect(client.busy).toBe(true);
    const worker = FakeWorker.instances[1];
    worker.reply({ id: worker.sent[0].request.id, record: null });
    expect(await next).toBeNull();
    expect(client.busy).toBe(false);
  });

  it("transfers a packed GPU readback without allocating split arrays on the caller", async () => {
    const {
      visibility: _visibility,
      depth: _depth,
      ...coordinates
    } = capture();
    const rgba = new Float32Array([0.75, 0.5, 0, 1]);
    const writing = client.writePacked(identity, { ...coordinates, rgba });
    expect(rgba.byteLength).toBe(0);
    const worker = FakeWorker.instances[0];
    const request = worker.sent[0].request;
    expect(request.operation).toBe("write-packed");
    if (request.operation === "write-packed")
      expect(Array.from(request.capture.rgba)).toEqual([0.75, 0.5, 0, 1]);
    worker.reply({ id: request.id, written: true, record: null });
    expect(await writing).toBe(true);
  });
  it("transfers dedicated inputs and refuses a second operation without cloning it", async () => {
    const input = capture();
    const writing = client.write(identity, input);
    expect(client.busy).toBe(true);
    expect(input.visibility.byteLength).toBe(0);
    const second = capture();
    expect(await client.write(identity, second)).toBe(false);
    expect(second.visibility.byteLength).toBe(4);
    const worker = FakeWorker.instances[0];
    expect(worker.sent).toHaveLength(1);
    worker.reply({
      id: worker.sent[0].request.id,
      written: true,
      record: null,
    });
    expect(await writing).toBe(true);
    expect(client.busy).toBe(false);
  });

  it("rejects a subview into live buffers before transfer", async () => {
    const bytes = new Float32Array([0.2, 0.4]);
    expect(
      await client.write(identity, {
        ...capture(),
        visibility: bytes.subarray(0, 1),
      })
    ).toBe(false);
    expect(bytes.byteLength).toBe(8);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("ignores stale responses and returns a matching record without declaring coverage", async () => {
    const reading = client.read(identity);
    const worker = FakeWorker.instances[0];
    const id = worker.sent[0].request.id;
    worker.reply({ id: id + 1, written: false, record: null });
    expect(client.busy).toBe(true);
    const record = {
      ...capture(),
      identity,
      schema: SHADOW_CORRIDOR_CACHE.schema,
    };
    worker.reply({ id, written: false, record });
    expect(await reading).toEqual(record);
  });

  it("settles disposal immediately and prevents late result publication", async () => {
    const reading = client.read(identity);
    const worker = FakeWorker.instances[0];
    const staleCallback = worker.onmessage;
    client.dispose();
    expect(await reading).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
    staleCallback?.({
      data: { id: worker.sent[0].request.id, record: capture() },
    } as MessageEvent);
    expect(await client.read(identity)).toBeNull();
    expect(client.enabled).toBe(false);
  });

  it("terminates stuck optional storage once and fails closed for the session", async () => {
    vi.useFakeTimers();
    const reading = client.read(identity);
    await vi.advanceTimersByTimeAsync(751);
    expect(await reading).toBeNull();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(client.enabled).toBe(false);
    expect(await client.read(identity)).toBeNull();
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("does no worker work under development/HMR asset identity", async () => {
    client.dispose();
    vi.stubEnv("PROD", false);
    client = createShadowCorridorCache(
      "https://example.test/producer-12345678.js"
    );
    expect(client.enabled).toBe(false);
    expect(await client.write(identity, capture())).toBe(false);
    expect(await client.read(identity)).toBeNull();
    expect(FakeWorker.instances).toHaveLength(0);
  });
});
