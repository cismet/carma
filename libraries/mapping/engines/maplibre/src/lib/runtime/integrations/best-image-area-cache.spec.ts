import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Box3, Matrix4, Vector3 } from "three";
import {
  createBestImageAreaCache,
  type BestImageAreaCache,
} from "./best-image-area-cache";
import {
  createAxisCellCache,
  type AxisCellCache,
} from "./shared-three-axis-cell-cache";
import {
  scoreAxisBoundarySite,
  type AxisBoundarySite,
} from "./shared-three-axis-boundaries";

const camera = (
  id: string,
  eye = new Vector3(0, 0, 1000),
  direction = new Vector3(0, 0, -1)
): AxisBoundarySite => ({
  id,
  eye,
  direction,
  // A real homogeneous sensor projector with positive camera depth; its depth
  // row is deliberately zero, as in the calibrated rank-three photo contract.
  sceneToImage: new Matrix4().set(
    1,
    0,
    -0.5,
    -eye.x + eye.z * 0.5,
    0,
    1,
    -0.5,
    -eye.y + eye.z * 0.5,
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
const clone = (site: AxisBoundarySite): AxisBoundarySite => ({
  id: site.id,
  eye: site.eye.clone(),
  direction: site.direction.clone(),
  sceneToImage: site.sceneToImage.clone(),
});
const fields: BestImageAreaCache[] = [],
  caches: AxisCellCache[] = [];
const setup = (
  sites: AxisBoundarySite[],
  options: Parameters<typeof createBestImageAreaCache>[0] = {}
) => {
  const field = createBestImageAreaCache(options);
  fields.push(field);
  field.updateSites(sites);
  return field;
};
const borrowed = () => {
  const cache = createAxisCellCache();
  caches.push(cache);
  return cache;
};
const brute = (sites: AxisBoundarySite[], point: Vector3, activeId?: string) =>
  sites
    .flatMap((site) => {
      const score = scoreAxisBoundarySite(site, point);
      return score === null ? [] : [{ id: site.id, score }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        ((a.id === activeId) !== (b.id === activeId)
          ? a.id === activeId
            ? -1
            : 1
          : a.id < b.id
          ? -1
          : a.id > b.id
          ? 1
          : 0)
    );

beforeEach(() => {
  vi.stubGlobal("Worker", undefined);
});
afterEach(() => {
  fields.splice(0).forEach((field) => field.dispose());
  caches.splice(0).forEach((cache) => cache.dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shared exact best-image area field", () => {
  it("finds a neighbour outside the old sensor without a distance or nearest-N gate", async () => {
    const field = setup([
      camera("old", new Vector3(0, 0, 100)),
      camera("next", new Vector3(200, 0, 100)),
    ]);
    expect((await field.resolve(new Vector3(0, 0, 0)))?.id).toBe("old");
    const next = await field.resolve(new Vector3(200, 0, 0), {
      activeId: "old",
    });
    expect(next?.id).toBe("next");
    expect(next?.score).toBe(1);
    expect(next?.imagePoint).toEqual({ x: 0.5, y: 0.5 });
    expect(await field.resolve(new Vector3(1000, 0, 0))).toBeNull();
  });

  it("matches canonical brute force throughout a boundary cell, including deterministic active ties", async () => {
    const sites = [camera("b", new Vector3(64, 0, 1000)), camera("a")];
    const field = setup(sites);
    const samples = [0, 16, 32, 48, 63].flatMap((x) =>
      [0, 10].flatMap((y) => [0, 40].map((z) => new Vector3(x, y, z)))
    );
    const results = await field.resolveSamples(samples);
    expect(results?.map((match) => match?.id)).toEqual(
      samples.map((point) => brute(sites, point)[0]?.id)
    );
    expect(results?.map((match) => match?.score)).toEqual(
      samples.map((point) => brute(sites, point)[0]?.score)
    );
    expect(field.readField().statistics.proofCells).toBe(0);
    expect(field.readField().statistics.boundaryCells).toBe(1);
    const point = new Vector3(32, 0, 0);
    expect((await field.resolve(point))?.id).toBe("a");
    expect((await field.resolve(point, { activeId: "b" }))?.id).toBe("b");
    expect(
      (await field.rank(point, { activeId: "b" }))?.map(({ id }) => id)
    ).toEqual(["b", "a"]);
  });

  it("certifies a whole cell and reuses its owner for different points without another worker query", async () => {
    const cache = borrowed(),
      query = vi.spyOn(cache, "queryBounds");
    const field = setup(
      [camera("a"), camera("b", undefined, new Vector3(0.8, 0, -0.6))],
      { cellCache: cache }
    );
    const first = await field.resolve(new Vector3(10, 10, 10));
    expect(first?.id).toBe("a");
    expect(field.readField().statistics.proofCells).toBe(1);
    expect((await field.resolve(new Vector3(63, 63, 63)))?.id).toBe("a");
    expect(query).toHaveBeenCalledTimes(1);
    expect(field.readField().statistics.proofHits).toBe(1);
    // The result still carries the actual point's score and UV, not a cell-centre approximation.
    expect((await field.resolve(new Vector3(63, 63, 63)))?.score).not.toBe(
      first?.score
    );
  });

  it("keeps proofs and exact results separate for eligibility sets sharing one admission table", async () => {
    const cache = borrowed();
    const field = setup(
      [camera("a"), camera("b", undefined, new Vector3(0.8, 0, -0.6))],
      { cellCache: cache }
    );
    const point = new Vector3(10, 10, 10);
    expect((await field.resolve(point))?.id).toBe("a");
    const before = field.readField();
    const onlyB = new Set(["b"]);
    expect((await field.resolve(point, { eligibleIds: onlyB }))?.id).toBe("b");
    expect(
      (await field.resolve(new Vector3(11, 11, 11), { eligibleIds: onlyB }))?.id
    ).toBe("b");
    expect((await field.resolve(point))?.id).toBe("a");
    expect(await field.resolve(point, { eligibleIds: new Set() })).toBeNull();
    expect(
      (await field.rank(point, { eligibleIds: onlyB }))?.map(({ id }) => id)
    ).toEqual(["b"]);
    expect(
      (
        await field.resolveSamples([point, new Vector3(1, 1, 1)], {
          eligibleIds: onlyB,
        })
      )?.map((match) => match?.id)
    ).toEqual(["b", "b"]);
    expect(field.readField().geometryRevision).toBe(before.geometryRevision);
    expect(field.readField().axisRevision).toBe(before.axisRevision);
    expect((await field.query(null))?.sites.map(({ id }) => id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("canonicalizes set ordering while active ties remain per query and cannot select an excluded source", async () => {
    const cache = borrowed(),
      query = vi.spyOn(cache, "queryBounds");
    const field = setup([camera("a"), camera("b")], { cellCache: cache });
    const point = new Vector3();
    expect(
      (
        await field.resolve(point, {
          eligibleIds: new Set(["a", "b"]),
          activeId: "b",
        })
      )?.id
    ).toBe("b");
    const count = query.mock.calls.length;
    expect(
      (
        await field.resolve(point, {
          eligibleIds: new Set(["b", "a"]),
          activeId: "b",
        })
      )?.id
    ).toBe("b");
    expect(query).toHaveBeenCalledTimes(count);
    expect(
      (
        await field.resolve(point, {
          eligibleIds: new Set(["a", "b"]),
          activeId: "a",
        })
      )?.id
    ).toBe("a");
    expect(
      (
        await field.resolve(point, {
          eligibleIds: new Set(["a"]),
          activeId: "b",
        })
      )?.id
    ).toBe("a");
  });

  it("does not certify partial sensor coverage or camera-plane discontinuities", async () => {
    const field = setup([camera("a", new Vector3(0, 0, 100))]);
    expect((await field.resolve(new Vector3(10, 10, 0)))?.id).toBe("a");
    expect(field.readField().statistics.proofCells).toBe(0);
    expect(await field.resolve(new Vector3(63, 63, 63))).toBeNull();
    expect(await field.resolve(new Vector3(0, 0, 100))).toBeNull();
    expect(await field.resolve(new Vector3(0, 0, 101))).toBeNull();
  });

  it("invalidates angular proofs on pitch changes while retaining the existing admission cells and BVH generation", async () => {
    const cache = borrowed();
    const sites = [
      camera("a"),
      camera("b", undefined, new Vector3(0.8, 0, -0.6)),
    ];
    const field = setup(sites, { cellCache: cache });
    const point = new Vector3(10, 10, 10);
    expect((await field.resolve(point))?.id).toBe("a");
    const before = field.readField();
    const admissionBefore = await field.query(
      new Box3(point.clone(), point.clone())
    );
    field.updateSites([
      camera("a", undefined, new Vector3(0.8, 0, -0.6)),
      camera("b"),
    ]);
    expect(field.readField().geometryRevision).toBe(before.geometryRevision);
    expect(field.readField().axisRevision).toBe(before.axisRevision + 1);
    expect(field.readField().statistics.proofCells).toBe(0);
    expect((await field.resolve(point))?.id).toBe("b");
    const admissionAfter = await field.query(
      new Box3(point.clone(), point.clone())
    );
    expect(admissionAfter?.metrics.generation).toBe(
      admissionBefore?.metrics.generation
    );
    expect(admissionAfter?.metrics.cacheHits).toBe(1);
    expect(admissionAfter?.metrics.cacheMisses).toBe(0);
  });

  it("clears both field caches when source geometry or the eligible source set changes", async () => {
    const field = setup([camera("a")]);
    await field.resolve(new Vector3(10, 10, 10));
    const first = field.readField();
    field.updateSites([camera("a", new Vector3(200, 0, 100))]);
    expect(field.readField().geometryRevision).toBe(first.geometryRevision + 1);
    expect(field.readField().statistics.cachedCells).toBe(0);
    expect(field.readField().statistics.pointResults).toBe(0);
    expect(await field.resolve(new Vector3(0, 0, 0))).toBeNull();
    expect((await field.resolve(new Vector3(200, 0, 0)))?.id).toBe("a");
    field.updateSites([]);
    expect(await field.resolve(new Vector3(200, 0, 0))).toBeNull();
  });

  it("keeps a fixed metric snapshot independent of caller scene rebases and input mutation", async () => {
    const sites = [
      camera("a"),
      camera("b", undefined, new Vector3(0.8, 0, -0.6)),
    ];
    const field = setup(sites),
      before = field.readField();
    expect(field.updateSites(sites.map(clone).reverse())).toBe(false);
    expect(field.readField().geometryRevision).toBe(before.geometryRevision);
    expect(field.readField().axisRevision).toBe(before.axisRevision);
    sites[0].eye.set(10000, 10000, 0);
    sites[0].direction.set(1, 0, 0);
    sites[0].sceneToImage.makeTranslation(1000, 0, 0);
    expect((await field.resolve(new Vector3(10, 10, 10)))?.id).toBe("a");
    expect(field.readField().sites[0].eye.z).toBe(1000);
  });

  it("batches all sample admissions in one query and retains invalid sample slots", async () => {
    const cache = borrowed(),
      query = vi.spyOn(cache, "queryBounds");
    const field = setup([camera("a")], { cellCache: cache });
    const points = Array.from(
      { length: 63 },
      (_, i) => new Vector3(i * 2, i, 0)
    );
    points.push(new Vector3(NaN, 0, 0));
    const results = await field.resolveSamples(points);
    expect(results).toHaveLength(64);
    expect(results?.slice(0, 63).every((match) => match?.id === "a")).toBe(
      true
    );
    expect(results?.[63]).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(field.readField().cellCache).toBe(cache);
  });

  it("bounds ownership and exact-point caches without limiting eligible winners", async () => {
    const field = setup([camera("a", new Vector3(0, 0, 10000))], {
      maxProofCells: 1,
      maxPointResults: 1,
    });
    for (const x of [1, 65, 129])
      expect((await field.resolve(new Vector3(x, 1, 1)))?.id).toBe("a");
    expect(field.readField().statistics.cachedCells).toBe(1);
    expect(field.readField().statistics.pointResults).toBe(1);
    expect((await field.resolve(new Vector3(1, 1, 1)))?.id).toBe("a");
  });

  it("retains exact results when admission budgets force conservative fallback", async () => {
    const cache = createAxisCellCache({ maxCells: 0, maxIndexBytes: 0 });
    caches.push(cache);
    const sites = [camera("a"), camera("b", new Vector3(64, 0, 1000))];
    const field = setup(sites, { cellCache: cache });
    for (const point of [new Vector3(1, 0, 0), new Vector3(60, 0, 0)])
      expect((await field.resolve(point))?.id).toBe(brute(sites, point)[0]?.id);
    expect((await field.query(null))?.metrics.fallback).toBe(true);
  });

  it("falls back to the existing cooperative runtime when Worker construction fails", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("worker unavailable");
        }
      }
    );
    const field = setup([camera("a")]);
    expect((await field.resolve(new Vector3(0, 0, 0)))?.id).toBe("a");
  });

  it("does not start an aborted query or leak a stale angular generation", async () => {
    const cache = borrowed(),
      query = vi.spyOn(cache, "queryBounds");
    const field = setup([camera("a")], { cellCache: cache });
    const abort = new AbortController();
    abort.abort();
    expect(
      await field.resolve(new Vector3(), { signal: abort.signal })
    ).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
    const pending = field.resolve(new Vector3());
    field.updateSites([camera("a", undefined, new Vector3(0.8, 0, -0.6))]);
    expect(await pending).toBeUndefined();
    expect((await field.resolve(new Vector3()))?.score).toBeCloseTo(0.6);
  });

  it("aborts a pending batch on caller cancellation and preserves borrowed cache ownership", async () => {
    const cache = borrowed(),
      dispose = vi.spyOn(cache, "dispose");
    const field = setup([camera("a")], { cellCache: cache });
    const abort = new AbortController();
    const pending = field.resolveSamples(
      [new Vector3(), new Vector3(1, 1, 1)],
      { signal: abort.signal }
    );
    abort.abort();
    expect(await pending).toBeUndefined();
    field.dispose();
    expect(dispose).not.toHaveBeenCalled();
    expect(await field.resolve(new Vector3())).toBeUndefined();
    expect((await cache.queryBounds(null))?.sites[0].id).toBe("a");
  });

  it("rejects invalid inputs without an approximate replacement and refuses ambiguous IDs", async () => {
    const field = setup([
      camera("bad", undefined, new Vector3()),
      camera("good"),
    ]);
    expect(field.readField().sites.map(({ id }) => id)).toEqual(["good"]);
    expect(await field.resolve(new Vector3(Infinity, 0, 0))).toBeNull();
    expect(await field.rank(new Vector3(NaN, 0, 0))).toEqual([]);
    expect(() =>
      field.updateSites([camera("duplicate"), camera("duplicate")])
    ).toThrow("unique stable IDs");
    expect(field.readField().sites[0].id).toBe("good");
  });
});
