import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Meters } from "@carma-units";
import type { AxisBoundarySite } from "./shared-three-axis-boundaries";
import {
  createAxisCellCache,
  type AxisCellCacheOptions,
  type AxisCellQueryResult,
} from "./shared-three-axis-cell-cache";

type CameraFixture = Readonly<{
  eye?: THREE.Vector3;
  reportedEye?: THREE.Vector3;
  direction?: THREE.Vector3;
  focalX?: number;
  focalY?: number;
  offsetX?: number;
  offsetY?: number;
  shearX?: number;
  shearY?: number;
}>;

const cameraSite = (
  id: string,
  {
    eye = new THREE.Vector3(0, 0, 10),
    reportedEye = eye,
    direction = new THREE.Vector3(0, 0, 1),
    focalX = 1,
    focalY = 1,
    offsetX = 0.5,
    offsetY = 0.5,
    shearX = 0,
    shearY = 0,
  }: CameraFixture = {}
): AxisBoundarySite => ({
  id,
  eye: reportedEye.clone(),
  direction: direction.clone(),
  // The zero depth row deliberately gives a rank-three fullsensor projector.
  sceneToImage: new THREE.Matrix4().set(
    focalX,
    shearX,
    -offsetX,
    -focalX * eye.x - shearX * eye.y + offsetX * eye.z,
    shearY,
    focalY,
    -offsetY,
    -shearY * eye.x - focalY * eye.y + offsetY * eye.z,
    0,
    0,
    0,
    0,
    0,
    0,
    -1,
    eye.z
  ),
});

const pointBounds = (point: THREE.Vector3, halfSize = 0.01 as Meters) =>
  new THREE.Box3(
    point.clone().addScalar(-halfSize),
    point.clone().addScalar(halfSize)
  );

const insideSensor = (site: AxisBoundarySite, point: THREE.Vector3) => {
  const clip = new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(
    site.sceneToImage
  );
  return (
    clip.w > 0 &&
    clip.x >= 0 &&
    clip.x <= clip.w &&
    clip.y >= 0 &&
    clip.y <= clip.w
  );
};

const ids = (result: AxisCellQueryResult) =>
  result.sites.map((site) => site.id);
const cloneSite = (site: AxisBoundarySite): AxisBoundarySite => ({
  ...site,
  eye: site.eye.clone(),
  direction: site.direction.clone(),
  sceneToImage: site.sceneToImage.clone(),
});
const caches: ReturnType<typeof createAxisCellCache>[] = [];
const cacheFor = (
  sites: readonly AxisBoundarySite[] = [],
  options: AxisCellCacheOptions = {}
) => {
  const cache = createAxisCellCache({
    cellSizeMeters: 64 as Meters,
    maxCells: 2048,
    maxIndexBytes: 8 * 1024 * 1024,
    ...options,
  });
  caches.push(cache);
  cache.setSites(sites);
  return cache;
};
const query = async (
  cache: ReturnType<typeof createAxisCellCache>,
  bounds: THREE.Box3 | null
) => {
  const result = await cache.queryBounds(bounds);
  expect(result).not.toBeNull();
  if (!result) throw new Error("Expected a current axis-cell result");
  return result;
};

beforeEach(() => {
  vi.stubGlobal("Worker", undefined);
});
afterEach(() => {
  caches.splice(0).forEach((cache) => cache.dispose());
  vi.unstubAllGlobals();
});

describe("axis-cell source admission", () => {
  it("starts a Worker lazily and posts init before source geometry", () => {
    const workers: { requests: string[] }[] = [];
    class QuietWorker {
      requests: string[] = [];
      constructor() {
        workers.push(this);
      }
      postMessage(request: { type: string }) {
        this.requests.push(request.type);
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", QuietWorker);
    const cache = cacheFor();
    expect(workers).toHaveLength(0);
    expect(cache.setSites([cameraSite("source")])).toBe(true);
    void cache.queryBounds(pointBounds(new THREE.Vector3(1, 1, 1)));
    expect(workers).toHaveLength(1);
    expect(workers[0].requests.slice(0, 2)).toEqual(["init", "sites"]);
    expect(workers[0].requests.indexOf("query")).toBeGreaterThan(1);
    // Dispose resolves the intentionally unresponded fake-Worker query.
    cache.dispose();
  });

  it("does not create a backend for null or empty queries with no source sites", async () => {
    const constructed = vi.fn();
    class QuietWorker {
      constructor() {
        constructed();
      }
      postMessage() {}
      terminate() {}
    }
    vi.stubGlobal("Worker", QuietWorker);
    const cache = cacheFor();
    expect(ids(await query(cache, null))).toEqual([]);
    expect(ids(await query(cache, new THREE.Box3()))).toEqual([]);
    expect(
      ids(await query(cache, pointBounds(new THREE.Vector3(1, 1, 1))))
    ).toEqual([]);
    expect(constructed).not.toHaveBeenCalled();
  });

  it("uses the cooperative runtime when Worker is unavailable and sorts indices by ID", async () => {
    const sites = [cameraSite("z"), cameraSite("a")];
    const result = await query(
      cacheFor(sites),
      pointBounds(new THREE.Vector3(1, 1, 0))
    );
    expect(ids(result)).toEqual(["a", "z"]);
    expect(Array.from(result.indices)).toEqual([0, 1]);
    expect(result.metrics.sourceCount).toBe(2);
    expect(result.metrics.candidateCount).toBe(2);
    expect(result.metrics.fallback).toBe(false);
    expect(result.metrics.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("retains every forward UV oracle hit across asymmetric and off-axis cameras", async () => {
    let state = 0x12345678;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const fixtures = Array.from({ length: 48 }, (_, index) => ({
      id: `camera-${index.toString().padStart(3, "0")}`,
      eye: new THREE.Vector3(random() * 1024 - 512, random() * 1024 - 512, 10),
      focalX: 0.3 + random() * 2,
      focalY: 0.3 + random() * 2,
      offsetX: 0.05 + random() * 0.9,
      offsetY: 0.05 + random() * 0.9,
      shearX: (random() - 0.5) * 0.2,
      shearY: (random() - 0.5) * 0.2,
    }));
    const sites = fixtures.map(({ id, ...fixture }) => cameraSite(id, fixture));
    const cache = cacheFor(sites);
    let oracleHits = 0;
    for (const fixture of fixtures) {
      for (const [u, v] of [
        [1e-8, 1 - 1e-8],
        [1 - 1e-8, 1e-8],
        [random(), random()],
      ]) {
        const depth = 5 + random() * 15;
        const rhsX = (u - fixture.offsetX) * depth;
        const rhsY = (v - fixture.offsetY) * depth;
        const det =
          fixture.focalX * fixture.focalY - fixture.shearX * fixture.shearY;
        const point = fixture.eye
          .clone()
          .add(
            new THREE.Vector3(
              (rhsX * fixture.focalY - rhsY * fixture.shearX) / det,
              (rhsY * fixture.focalX - rhsX * fixture.shearY) / det,
              -depth
            )
          );
        const expected = sites.filter((site) => insideSensor(site, point));
        oracleHits += expected.length;
        const result = await query(cache, pointBounds(point));
        const admitted = new Set(ids(result));
        expected.forEach((site) => expect(admitted.has(site.id)).toBe(true));
        result.sites.forEach((site, index) => {
          expect(sites[result.indices[index]].id).toBe(site.id);
        });
      }
    }
    // These samples are regression evidence; the conservative cap proof is separate.
    expect(oracleHits).toBeGreaterThanOrEqual(fixtures.length * 3);
  });

  it("uses the projector apex when the supplied eye disagrees with calibration", async () => {
    const source = cameraSite("calibrated", {
      eye: new THREE.Vector3(100000, -200000, 10),
      reportedEye: new THREE.Vector3(-1000000, 3000000, -500),
      offsetX: 0.1,
      offsetY: 0.9,
      shearX: 0.15,
    });
    const point = new THREE.Vector3(100001, -200001, 0);
    expect(insideSensor(source, point)).toBe(true);
    expect(ids(await query(cacheFor([source]), pointBounds(point)))).toEqual([
      source.id,
    ]);
  });

  it("preserves a forward UV hit in a displaced metric frame near 1e12", async () => {
    const source = cameraSite("displaced", {
      eye: new THREE.Vector3(1e12, -1e12, 10),
    });
    const point = new THREE.Vector3(1e12 + 1, -1e12 - 1, 0);
    expect(insideSensor(source, point)).toBe(true);
    const result = await query(cacheFor([source]), pointBounds(point));
    expect(result.metrics.fallback).toBe(false);
    expect(ids(result)).toEqual([source.id]);
  });

  it("keeps accepted sources with singular or numerically uncertain ray-cone calibration", async () => {
    const singular = cameraSite("singular", { focalX: 0, focalY: 0 });
    const uncertain = cameraSite("uncertain", { focalX: 1e-12, focalY: 1e-12 });
    const point = new THREE.Vector3(1e8, -1e8, 0);
    expect(insideSensor(singular, point)).toBe(true);
    expect(insideSensor(uncertain, point)).toBe(true);
    const result = await query(
      cacheFor([singular, uncertain]),
      pointBounds(point)
    );
    expect(ids(result)).toEqual(["singular", "uncertain"]);
    expect(result.metrics.leafSitesTested).toBeGreaterThan(0);
  });

  it("rejects distant BVH branches while retaining the local fullsensor hit", async () => {
    const sites = Array.from({ length: 256 }, (_, index) =>
      cameraSite(`camera-${index.toString().padStart(3, "0")}`, {
        eye: new THREE.Vector3(index * 256, 0, 10),
      })
    );
    const point = new THREE.Vector3(1, 1, 0);
    const result = await query(cacheFor(sites), pointBounds(point));
    expect(ids(result)).toContain("camera-000");
    expect(result.metrics.bvhNodesVisited).toBeGreaterThan(0);
    expect(result.metrics.leafSitesTested).toBeLessThan(sites.length);
    expect(result.metrics.candidateCount).toBeLessThan(sites.length);
  });

  it("retains a sensor crossing the box interior and rejects wholly backward bounds", async () => {
    const source = cameraSite("interior");
    const crossing = new THREE.Box3(
      new THREE.Vector3(-10, -10, -1),
      new THREE.Vector3(10, 10, 1)
    );
    const cornerCoordinates = [-10, 10];
    for (const x of cornerCoordinates)
      for (const y of cornerCoordinates)
        for (const z of [-1, 1]) {
          expect(insideSensor(source, new THREE.Vector3(x, y, z))).toBe(false);
        }
    const cache = cacheFor([source]);
    expect(ids(await query(cache, crossing))).toEqual(["interior"]);
    const backward = new THREE.Box3(
      new THREE.Vector3(1, 1, 128),
      new THREE.Vector3(2, 2, 129)
    );
    expect(ids(await query(cache, backward))).toEqual([]);
  });

  it("preserves all eligible sources without top-K, preferred-axis, depth or distance caps", async () => {
    const sites = Array.from({ length: 257 }, (_, index) =>
      cameraSite(`camera-${index.toString().padStart(3, "0")}`, {
        eye: new THREE.Vector3(0, 0, index === 256 ? 1e9 : 10),
        direction:
          index % 2 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
      })
    );
    const point = new THREE.Vector3(1, 1, 0);
    expect(sites.every((site) => insideSensor(site, point))).toBe(true);
    const result = await query(cacheFor(sites), pointBounds(point));
    expect(result.metrics.fallback).toBe(false);
    expect(ids(result)).toEqual(sites.map((site) => site.id));
    expect(result.indices.length).toBe(sites.length);
  });
});

describe("axis-cell cache lifecycle and budgets", () => {
  it("reuses fixed-cell admission after pitch-sized bounds movement and preferred-direction changes", async () => {
    const source = cameraSite("source");
    const cache = cacheFor([source]);
    const first = await query(cache, pointBounds(new THREE.Vector3(1, 1, 1)));
    expect(first.metrics.cacheMisses).toBeGreaterThan(0);
    const moved = await query(cache, pointBounds(new THREE.Vector3(2, 2, 2)));
    expect(moved.metrics.cacheHits).toBeGreaterThan(0);
    expect(moved.metrics.cacheMisses).toBe(0);
    expect(moved.metrics.leafSitesTested).toBe(0);
    expect(moved.metrics.bvhNodesVisited).toBe(0);
    const redirected = {
      ...cloneSite(source),
      direction: new THREE.Vector3(0, 1, 0),
    };
    expect(cache.setSites([redirected])).toBe(true);
    const afterDirection = await query(
      cache,
      pointBounds(new THREE.Vector3(2, 2, 2))
    );
    expect(afterDirection.metrics.generation).toBe(first.metrics.generation);
    expect(afterDirection.metrics.cacheHits).toBeGreaterThan(0);
    expect(afterDirection.metrics.leafSitesTested).toBe(0);
    expect(afterDirection.sites[0].direction).toEqual(redirected.direction);
    expect(cache.setSites([cloneSite(redirected)])).toBe(false);
  });

  it.each(["id", "eye", "projector"] as const)(
    "invalidates cached admission on %s changes",
    async (change) => {
      const source = cameraSite("source");
      const cache = cacheFor([source]);
      const bounds = pointBounds(new THREE.Vector3(1, 1, 1));
      const first = await query(cache, bounds);
      const changed = cloneSite(source);
      const replacement =
        change === "id" ? { ...changed, id: "replacement" } : changed;
      if (change === "eye") replacement.eye.x += 10;
      if (change === "projector") replacement.sceneToImage.elements[12] += 0.25;
      expect(cache.setSites([replacement])).toBe(true);
      const second = await query(cache, bounds);
      expect(second.metrics.generation).toBeGreaterThan(
        first.metrics.generation
      );
      expect(second.metrics.cacheMisses).toBeGreaterThan(0);
      expect(second.metrics.cacheHits).toBe(0);
      expect(ids(second)).toEqual([replacement.id]);
    }
  );

  it("treats reordered equal sites as unchanged and invalidates a filtered ID pool", async () => {
    const a = cameraSite("a");
    const b = cameraSite("b");
    const cache = cacheFor([b, a]);
    const bounds = pointBounds(new THREE.Vector3(1, 1, 1));
    const first = await query(cache, bounds);
    expect(cache.setSites([cloneSite(a), cloneSite(b)])).toBe(false);
    expect(cache.setSites([b])).toBe(true);
    const filtered = await query(cache, bounds);
    expect(ids(filtered)).toEqual(["b"]);
    expect(Array.from(filtered.indices)).toEqual([0]);
    expect(filtered.metrics.generation).toBeGreaterThan(
      first.metrics.generation
    );
    expect(filtered.metrics.cacheMisses).toBeGreaterThan(0);
  });

  it("aborts one query without cancelling an independent query", async () => {
    const cache = cacheFor([cameraSite("source")]);
    const controller = new AbortController();
    const aborted = cache.queryBounds(
      pointBounds(new THREE.Vector3(1, 1, 1)),
      controller.signal
    );
    const independent = cache.queryBounds(
      pointBounds(new THREE.Vector3(2, 2, 2))
    );
    controller.abort();
    expect(await aborted).toBeNull();
    const result = await independent;
    expect(result).not.toBeNull();
    expect(result && ids(result)).toEqual(["source"]);
    expect(await cache.queryBounds(null, controller.signal)).toBeNull();
  });

  it("drops pending old-generation results and publishes the latest source geometry", async () => {
    const cache = cacheFor([cameraSite("old")]);
    const pending = cache.queryBounds(pointBounds(new THREE.Vector3(1, 1, 1)));
    expect(cache.setSites([cameraSite("new")])).toBe(true);
    expect(await pending).toBeNull();
    expect(
      ids(await query(cache, pointBounds(new THREE.Vector3(1, 1, 1))))
    ).toEqual(["new"]);
  });

  it("keeps pending admission current when only the preferred direction changes", async () => {
    const source = cameraSite("source");
    const cache = cacheFor([source]);
    const pending = cache.queryBounds(pointBounds(new THREE.Vector3(1, 1, 1)));
    const redirected = {
      ...cloneSite(source),
      direction: new THREE.Vector3(0, 1, 0),
    };
    expect(cache.setSites([redirected])).toBe(true);
    const result = await pending;
    expect(result).not.toBeNull();
    expect(result?.sites[0].direction).toEqual(redirected.direction);
  });

  it("falls back to the full source pool for enormous bounds exceeding the cell budget", async () => {
    const sites = Array.from({ length: 513 }, (_, index) =>
      cameraSite(`camera-${index}`, {
        eye: new THREE.Vector3(index * 100000, 0, 10),
      })
    );
    const cache = cacheFor(sites, { maxCells: 4 });
    const bounds = new THREE.Box3(
      new THREE.Vector3(-1e9, -1e9, -1e9),
      new THREE.Vector3(1e9, 1e9, 1e9)
    );
    const result = await query(cache, bounds);
    expect(result.metrics.fallback).toBe(true);
    expect(result.metrics.fallbackReason).toBe("cell-budget");
    expect(result.indices.length).toBe(sites.length);
    expect(new Set(ids(result))).toEqual(new Set(sites.map((site) => site.id)));
    expect(result.metrics.indexBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it("finishes with a cell-budget fallback for finite but unsafe world-cell indices", async () => {
    const source = cameraSite("source", {
      eye: new THREE.Vector3(1e20, -1e20, 10),
    });
    const cache = cacheFor([source]);
    const point = new THREE.Vector3(1e20, -1e20, 0);
    expect(insideSensor(source, point)).toBe(true);
    const result = await query(
      cache,
      new THREE.Box3(point.clone(), point.clone())
    );
    expect(result.metrics.fallback).toBe(true);
    expect(result.metrics.fallbackReason).toBe("cell-budget");
    expect(ids(result)).toEqual(["source"]);
  }, 1000);

  it("bounds index memory and evicts the least recently used cell", async () => {
    const sites = Array.from({ length: 96 }, (_, index) =>
      cameraSite(`camera-${index}`, { focalX: 0.01, focalY: 0.01 })
    );
    const cache = cacheFor(sites, { maxCells: 2, maxIndexBytes: 96 * 4 * 2 });
    const bounds = (x: number) => pointBounds(new THREE.Vector3(x, 1, 1));
    const a = await query(cache, bounds(1));
    const b = await query(cache, bounds(65));
    const aAgain = await query(cache, bounds(1));
    expect(aAgain.metrics.cacheHits).toBeGreaterThan(0);
    const c = await query(cache, bounds(129));
    const aStillCached = await query(cache, bounds(1));
    expect(aStillCached.metrics.cacheHits).toBeGreaterThan(0);
    const bEvicted = await query(cache, bounds(65));
    expect(bEvicted.metrics.cacheMisses).toBeGreaterThan(0);
    [a, b, aAgain, c, aStillCached, bEvicted].forEach((result) => {
      expect(result.metrics.fallback).toBe(false);
      expect(result.indices.length).toBe(sites.length);
      expect(result.metrics.indexBytes).toBeLessThanOrEqual(96 * 4 * 2);
    });
  });

  it("preserves all sources on an index-budget fallback", async () => {
    const sites = Array.from({ length: 129 }, (_, index) =>
      cameraSite(`camera-${index}`)
    );
    const result = await query(
      cacheFor(sites, { maxIndexBytes: 4 }),
      pointBounds(new THREE.Vector3(1, 1, 1))
    );
    expect(result.metrics.fallback).toBe(true);
    expect(result.metrics.fallbackReason).toBe("index-budget");
    expect(result.indices.length).toBe(sites.length);
    expect(result.metrics.indexBytes).toBeLessThanOrEqual(4);
  });

  it("distinguishes unknown bounds, empty bounds and an empty source pool", async () => {
    const cache = cacheFor([cameraSite("source")]);
    const unknown = await query(cache, null);
    expect(ids(unknown)).toEqual(["source"]);
    expect(unknown.metrics.fallbackReason).toBe("null-bounds");
    const empty = await query(cache, new THREE.Box3());
    expect(ids(empty)).toEqual([]);
    expect(empty.metrics.cellCount).toBe(0);
    expect(ids(await query(cacheFor(), null))).toEqual([]);
  });

  it("resolves disposed pending and future queries to null", async () => {
    const cache = cacheFor([cameraSite("source")]);
    const pending = cache.queryBounds(pointBounds(new THREE.Vector3(1, 1, 1)));
    cache.dispose();
    expect(await pending).toBeNull();
    expect(await cache.queryBounds(null)).toBeNull();
  });
});
