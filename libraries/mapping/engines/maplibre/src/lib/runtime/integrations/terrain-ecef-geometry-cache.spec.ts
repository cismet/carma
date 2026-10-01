import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerrainTile } from "../../core/raster-dem-tile";
import { createTerrainEcefGeometryCache } from "./terrain-ecef-geometry-cache";
import type { TerrainEcefCacheRequest } from "./terrain-ecef-geometry-cache.worker";

vi.mock("@carma-commons/utils", () => ({
  resolveDerivedCacheAssetEpoch: ({
    production,
    assetUrl,
  }: {
    production: boolean;
    assetUrl: string;
  }) => (production && assetUrl.includes("/assets/") ? assetUrl : null),
}));

const geometry = () => {
  const result = new BufferGeometry();
  result.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3)
  );
  result.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3)
  );
  result.setIndex(new BufferAttribute(new Uint16Array([0, 2, 1]), 1));
  result.boundingBox = new Box3(new Vector3(), new Vector3(1, 0, 1));
  result.boundingSphere = new Sphere(new Vector3(0.5, 0, 0.5), 1);
  return result;
};
const tile = {
  id: { level: 3, x: 4, y: 3 },
  bounds: { west: 0, east: 1, south: 0, north: 1 },
  u: new Float32Array([0, 1, 0]),
  v: new Float32Array([0, 0, 1]),
  heightMeters: new Float32Array([0, 0, 0]),
} as TerrainTile;
const options = {
  sourceUrl: "https://terrain.test/{z}/{x}/{y}.png",
  producerAssetUrl: "https://app.test/assets/runtime-abcdef12.js",
  conversionMode: "ecef-ellipsoid",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("optional upload-ready ECEF cache", () => {
  it("separates source revisions and only protects the explicitly confirmed baseline", async () => {
    vi.stubEnv("PROD", true);
    const requests: TerrainEcefCacheRequest[] = [];
    class Worker {
      onmessage?: (event: { data: { id: number; value: unknown } }) => void;
      postMessage(request: TerrainEcefCacheRequest) {
        requests.push(request);
        queueMicrotask(() =>
          this.onmessage?.({ data: { id: request.id, value: true } })
        );
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", Worker);
    const first = createTerrainEcefGeometryCache([0, 0], {
      ...options,
      sourceRevision: "first",
      minimumSourceLevel: 3,
    });
    const next = createTerrainEcefGeometryCache([0, 0], {
      ...options,
      sourceRevision: "next",
      minimumSourceLevel: 3,
    });
    await first.offer(geometry(), geometry(), tile, 10);
    await next.offer(geometry(), geometry(), tile, 10);
    expect(requests[0].input.tree.identity).not.toBe(
      requests[1].input.tree.identity
    );
    expect(requests[0].input.tree.parent).toBeNull();
    expect(requests[0].input.tree.protected).toBeUndefined();
    expect(await first.protectBaseline([tile.id])).toBe(true);
    expect(requests[2].protectedNodes).toEqual(["3/4/3"]);
    expect(requests[2].input.arrays).toEqual([]);
    await first.markUsed([tile.id]);
    expect(requests[3].usedNodes).toEqual(["3/4/3"]);
    expect(requests[3].protectedNodes).toBeUndefined();
    first.close();
    next.close();
  });
  it("skips development cache work without constructing a worker", async () => {
    vi.stubEnv("PROD", false);
    const worker = vi.fn();
    vi.stubGlobal("Worker", worker);
    const cache = createTerrainEcefGeometryCache([0, 0], options);
    expect(await cache.restore(geometry(), tile)).toBeNull();
    expect(await cache.offer(geometry(), geometry(), tile, 10)).toBe(false);
    expect(worker).not.toHaveBeenCalled();
    cache.close();
  });

  it("closes incompatible owned work without adopting a late restore", async () => {
    vi.stubEnv("PROD", true);
    let request: TerrainEcefCacheRequest | undefined;
    let reply:
      | ((event: { data: { id: number; value: unknown } }) => void)
      | undefined;
    const terminate = vi.fn();
    class Worker {
      onmessage?: (event: { data: { id: number; value: unknown } }) => void;
      postMessage(value: TerrainEcefCacheRequest) {
        request = value;
        reply = this.onmessage;
      }
      terminate = terminate;
    }
    vi.stubGlobal("Worker", Worker);
    const cache = createTerrainEcefGeometryCache([0, 0], options);
    const native = geometry();
    const restore = cache.restore(native, tile);
    cache.close();
    reply?.({
      data: {
        id: request!.id,
        value: {
          positions: new Float32Array(9),
          normals: new Float32Array(9),
          indices: new Uint16Array([0, 2, 1]),
          bounds: [0, 0, 0, 1, 0, 1],
          sphere: [0, 0, 0, 1],
        },
      },
    });
    expect(await restore).toBeNull();
    expect(terminate).toHaveBeenCalledOnce();
    expect(await cache.restore(native, tile)).toBeNull();
    expect(native.getAttribute("position").array.byteLength).toBe(36);
    native.dispose();
  });

  it("round-trips owned typed buffers without detaching displayed geometry", async () => {
    vi.stubEnv("PROD", true);
    let record: TerrainEcefCacheRequest["record"];
    class Worker {
      onmessage?: (event: { data: { id: number; value: unknown } }) => void;
      postMessage(request: TerrainEcefCacheRequest) {
        if (request.record) record = structuredClone(request.record);
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              id: request.id,
              value: request.record ? true : structuredClone(record),
            },
          })
        );
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", Worker);
    const cache = createTerrainEcefGeometryCache([0, 0], options);
    const native = geometry(),
      derived = geometry();
    derived.getAttribute("position").setY(0, 2);
    derived.computeBoundingBox();
    derived.computeBoundingSphere();
    expect(await cache.offer(native, derived, tile, 10)).toBe(true);
    const restored = await cache.restore(native, tile);
    expect(restored?.getAttribute("position").getY(0)).toBe(2);
    expect(restored?.index?.array).toBeInstanceOf(Uint16Array);
    expect(restored?.boundingBox).toEqual(derived.boundingBox);
    expect(derived.getAttribute("position").array.byteLength).toBe(36);
    expect(restored?.getAttribute("position").array).not.toBe(
      derived.getAttribute("position").array
    );
    cache.close();
  });

  it("rejects a late restore after native seam attributes were replaced", async () => {
    vi.stubEnv("PROD", true);
    const native = geometry();
    class Worker {
      onmessage?: (event: { data: { id: number; value: unknown } }) => void;
      postMessage(request: TerrainEcefCacheRequest) {
        native.setAttribute(
          "position",
          native.getAttribute("position").clone()
        );
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              id: request.id,
              value: {
                positions: new Float32Array(9),
                normals: new Float32Array(9),
                indices: new Uint16Array([0, 2, 1]),
                bounds: [0, 0, 0, 1, 0, 1],
                sphere: [0, 0, 0, 1],
              },
            },
          })
        );
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", Worker);
    const cache = createTerrainEcefGeometryCache([0, 0], options);
    expect(await cache.restore(native, tile)).toBeNull();
    cache.close();
  });
});
