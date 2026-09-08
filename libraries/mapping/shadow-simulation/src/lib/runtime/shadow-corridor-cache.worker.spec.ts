import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  updateCosts: vi.fn(),
  register: vi.fn(),
  manager: vi.fn(),
  encode: vi.fn(),
  decode: vi.fn(),
}));
vi.mock("@carma-commons/utils", () => ({
  createDerivedBufferCache: mocks.manager,
  encodeTypedBinaryRecord: mocks.encode,
  decodeTypedBinaryRecord: mocks.decode,
  resolveDerivedCacheAssetEpoch: ({
    production,
    assetUrl,
  }: {
    production: boolean;
    assetUrl: string;
  }) =>
    production && /^https:\/\/example.test\/.+-12345678\.js$/.test(assetUrl)
      ? assetUrl
      : null,
}));

import {
  SHADOW_CORRIDOR_CACHE,
  SHADOW_CORRIDOR_CACHE_OPERATION,
} from "../core/shadow-corridor-cache-record";
import type { ShadowCorridorCacheRequest } from "./shadow-corridor-cache.worker";

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
const producerAssetUrl = "https://example.test/producer-12345678.js";
let scope: {
  location: { href: string };
  postMessage: ReturnType<typeof vi.fn>;
  onmessage:
    | ((event: { data: ShadowCorridorCacheRequest }) => Promise<void>)
    | null;
};

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("PROD", true);
  mocks.get.mockResolvedValue(null);
  mocks.put.mockResolvedValue(true);
  mocks.remove.mockResolvedValue(true);
  mocks.updateCosts.mockResolvedValue(true);
  mocks.register.mockReturnValue({
    get: mocks.get,
    put: mocks.put,
    remove: mocks.remove,
    updateCosts: mocks.updateCosts,
  });
  mocks.manager.mockReturnValue({ register: mocks.register });
  mocks.encode.mockReturnValue(new Blob([new Uint8Array([1, 2, 3])]));
  scope = {
    location: { href: "https://example.test/worker-12345678.js" },
    postMessage: vi.fn(),
    onmessage: null,
  };
  vi.stubGlobal("self", scope);
  await import("./shadow-corridor-cache.worker");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("corridor binary storage boundary", () => {
  it("deinterleaves the GPU RG channels inside the worker before binary encoding", async () => {
    const {
      visibility: _visibility,
      depth: _depth,
      ...coordinates
    } = capture();
    await scope.onmessage!({
      data: {
        id: 1,
        producerAssetUrl,
        identity,
        operation: SHADOW_CORRIDOR_CACHE_OPERATION.writePacked,
        capture: {
          ...coordinates,
          rgba: new Float32Array([0.75, 0.5, NaN, Infinity]),
        },
      },
    });
    expect(mocks.encode.mock.calls[0][0].visibility).toEqual(
      new Float32Array([0.75])
    );
    expect(mocks.encode.mock.calls[0][0].depth).toEqual(
      new Float32Array([0.5])
    );
    expect(mocks.encode.mock.calls[0][0]).not.toHaveProperty("rgba");
  });
  it("registers a distinct namespace within the shared budget and both producer epochs", async () => {
    const input = capture();
    await scope.onmessage!({
      data: {
        id: 1,
        producerAssetUrl,
        identity,
        operation: SHADOW_CORRIDOR_CACHE_OPERATION.write,
        capture: input,
      },
    });
    expect(mocks.manager).toHaveBeenCalledWith({
      capacityBytes: 256 * 1024 ** 2,
      producerEpoch: JSON.stringify([producerAssetUrl, scope.location.href]),
    });
    expect(mocks.register).toHaveBeenCalledWith(
      SHADOW_CORRIDOR_CACHE.namespace,
      SHADOW_CORRIDOR_CACHE.schema
    );
    expect(mocks.encode).toHaveBeenCalledWith(
      { ...input, identity, schema: SHADOW_CORRIDOR_CACHE.schema },
      { maxBytes: SHADOW_CORRIDOR_CACHE.maximumRecordBytes }
    );
    expect(mocks.put.mock.calls[0][1]).toBeInstanceOf(Blob);
    expect(scope.postMessage.mock.calls[0][0].written).toBe(true);
  });

  it("validates stored pixels and identity before transferring restored data", async () => {
    const record = {
      ...capture(),
      identity,
      schema: SHADOW_CORRIDOR_CACHE.schema,
    };
    mocks.get.mockResolvedValue({ value: new Blob([new Uint8Array([1])]) });
    mocks.decode.mockResolvedValue(record);
    await scope.onmessage!({
      data: {
        id: 1,
        producerAssetUrl,
        identity,
        operation: SHADOW_CORRIDOR_CACHE_OPERATION.read,
      },
    });
    expect(scope.postMessage.mock.calls[0][0].record).toEqual(record);
    expect(scope.postMessage.mock.calls[0][1].transfer).toEqual([
      record.visibility.buffer,
      record.depth.buffer,
    ]);
    record.depth[0] = NaN;
    await scope.onmessage!({
      data: {
        id: 2,
        producerAssetUrl,
        identity,
        operation: SHADOW_CORRIDOR_CACHE_OPERATION.read,
      },
    });
    expect(scope.postMessage.mock.calls[1][0].record).toBeNull();
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("does not encode malformed write pixels", async () => {
    const input = capture();
    input.visibility[0] = Infinity;
    await scope.onmessage!({
      data: {
        id: 1,
        producerAssetUrl,
        identity,
        operation: SHADOW_CORRIDOR_CACHE_OPERATION.write,
        capture: input,
      },
    });
    expect(mocks.encode).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(scope.postMessage.mock.calls[0][0].written).toBe(false);
  });

  it("never opens persistence when either production graph lacks a stable identity", async () => {
    scope.location.href = "https://example.test/worker.ts?t=123";
    await scope.onmessage!({
      data: {
        id: 1,
        producerAssetUrl,
        identity,
        operation: SHADOW_CORRIDOR_CACHE_OPERATION.read,
      },
    });
    expect(mocks.manager).not.toHaveBeenCalled();
    expect(scope.postMessage.mock.calls[0][0].record).toBeNull();
  });
});
