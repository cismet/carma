import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix4, Ray, Vector3 } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { ObliqueImageRecord } from "../../core/types";
import type { ScenePreviewPhoto } from "../hooks/useScenePreviewImage";
import {
  createPhotoReferencePoints,
  photoReferenceDistanceMeters,
} from "./photo-reference-points";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  rays: vi.fn(),
  referenceRays: vi.fn(),
  uv: vi.fn(),
  ground: vi.fn(),
  physical: vi.fn(),
  sceneToPhoto: vi.fn(),
  projection: vi.fn(),
  pixelRay: vi.fn(),
  presentation: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: mocks.acquire,
}));
vi.mock("../../core/utils/image-projection", () => ({
  sceneToPhotoEnu: mocks.sceneToPhoto,
  imageProjectionMatrix: mocks.projection,
}));
vi.mock("../../core/utils/photo-center-rays", () => ({
  photoCenterRays: mocks.rays,
  photoReferenceRays: mocks.referenceRays,
  photoCenterRayUv: mocks.uv,
  sceneToPresentationPoint: mocks.ground,
  presentationPointToScene: mocks.presentation,
}));
vi.mock("../../core/utils/object-coverage", () => ({
  objectCoveragePixelRay: mocks.pixelRay,
}));
vi.mock("./image-selection-ecef", () => ({
  physicalImageQueryTarget: mocks.physical,
}));

const record = (id = "photo") => ({ id } as ObliqueImageRecord);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let idle: Map<number, () => void>;
let release: ReturnType<typeof vi.fn>;
let frame: { sceneFromLocal: Matrix4 } | undefined;
let revision: string;
let busy: boolean;
let intersect: ReturnType<typeof vi.fn>;
let resolvePhoto: ReturnType<typeof vi.fn>;
let resolvers: ReturnType<typeof createPhotoReferencePoints>[];
const create = (
  readPreference?: Parameters<
    typeof createPhotoReferencePoints
  >[0]["readPreference"]
) => {
  const resolver = createPhotoReferencePoints({
    map: {} as MaplibreMap,
    resolvePhoto,
    intersectSurface: intersect,
    readSurfaceRevision: () => revision,
    isBusy: () => busy,
    readPreference,
  });
  resolvers.push(resolver);
  return resolver;
};
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
const task = async () => {
  const next = idle.entries().next().value;
  expect(next, "a cooperative task should be queued").toBeDefined();
  idle.delete(next![0]);
  next![1]();
  await flush();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  idle = new Map();
  let next = 0;
  vi.stubGlobal(
    "requestIdleCallback",
    vi.fn((callback: () => void) => {
      const id = ++next;
      idle.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal("cancelIdleCallback", (id: number) => idle.delete(id));
  release = vi.fn();
  frame = { sceneFromLocal: new Matrix4() };
  revision = "surface-1";
  busy = false;
  resolvers = [];
  mocks.acquire.mockReturnValue({
    layer: {
      getLocalFrame: () => frame,
      projectSceneToLngLat: () => [7, 51, 100],
    },
    release,
  });
  mocks.sceneToPhoto.mockReturnValue(new Matrix4());
  mocks.projection.mockReturnValue(new Matrix4());
  mocks.rays.mockImplementation(() => ({
    eye: new Vector3(0, 10, 0),
    preferred: new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)),
    axis: new Ray(new Vector3(0, 10, 0), new Vector3(0.1, -1, 0.2).normalize()),
    sensor: new Ray(
      new Vector3(0, 10, 0),
      new Vector3(-0.1, -1, 0.3).normalize()
    ),
  }));
  mocks.referenceRays.mockImplementation((...args) => mocks.rays(...args));
  mocks.uv.mockReturnValue({ x: 0.47, y: 0.63 });
  mocks.pixelRay.mockImplementation(
    () =>
      new Ray(new Vector3(0, 10, 0), new Vector3(-0.1, -1, 0.31).normalize())
  );
  mocks.presentation.mockImplementation(() => new Vector3(5, -10, 3));
  mocks.ground.mockReturnValue({
    longitude: 7.1,
    latitude: 51.2,
    heightMeters: 125,
  });
  mocks.physical.mockImplementation(async (target) => ({
    ...target,
    ecefMeters: [100, 200, 300],
  }));
  intersect = vi.fn(() => ({ point: new Vector3(0, 0, 0), surface: "mesh" }));
  resolvePhoto = vi.fn(
    async (item) =>
      ({
        record: item,
        pose: { longitude: 7, latitude: 51 },
        calibration: { widthPx: 1000, heightPx: 800 },
        altitude: 500,
      } as ScenePreviewPhoto)
  );
});
afterEach(() => {
  for (const resolver of resolvers) resolver.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("photo reference points", () => {
  it("snapshots preferred heading and pitch, reuses equivalent UV requests and invalidates when either changes", async () => {
    let preference:
      | { pitchDeg: number; headingDeg: number }
      | null
      | undefined = { pitchDeg: 45, headingDeg: 324 };
    const resolver = create(() => preference as never);
    const item = record();
    const a = resolver.resolve(item, 0.6, "auto");
    await task();
    const first = await a;
    expect(mocks.referenceRays).toHaveBeenLastCalledWith(expect.anything(), {
      pitchDeg: 45,
      headingDeg: 324,
    });
    expect(await resolver.resolve(item, 0.8, "auto")).toBe(first);
    expect(intersect).toHaveBeenCalledTimes(1);
    preference = { pitchDeg: 50, headingDeg: 326 };
    expect(resolver.peek(item, 0.6, "auto")).toBeUndefined();
    const b = resolver.resolve(item, 0.6, "auto");
    preference = { pitchDeg: 55, headingDeg: 328 };
    await task();
    await b;
    expect(mocks.referenceRays).toHaveBeenLastCalledWith(expect.anything(), {
      pitchDeg: 50,
      headingDeg: 326,
    });
    const c = resolver.resolve(item, 0.6, "auto");
    await task();
    await c;
    expect(mocks.referenceRays).toHaveBeenLastCalledWith(expect.anything(), {
      pitchDeg: 55,
      headingDeg: 328,
    });
    preference = null;
    const missingMean = resolver.resolve(item, 0.8, "auto");
    await task();
    await missingMean;
    expect(mocks.rays).toHaveBeenLastCalledWith(
      expect.objectContaining({ centerY: 0.5 })
    );
    preference = undefined;
    const original = resolver.resolve(item, 0.8, "auto");
    await task();
    await original;
    expect(mocks.rays).toHaveBeenLastCalledWith(
      expect.objectContaining({ centerY: 0.8 })
    );
    expect(intersect).toHaveBeenCalledTimes(5);
  });

  it("uses the preferred calibrated ray, actual UV and explicit DHHN to physical ECEF boundary without mutating records", async () => {
    const resolver = create();
    const item = Object.freeze(record());
    const pending = resolver.resolve(item, 0.6, "auto");
    expect(intersect).not.toHaveBeenCalled();
    await task();
    const point = await pending;
    expect(point).toEqual({
      target: {
        longitude: 7.1,
        latitude: 51.2,
        heightMeters: 125,
        heightDatum: "dhhn2016",
        ecefMeters: [100, 200, 300],
      },
      surface: "mesh",
      imagePoint: { x: 0.47, y: 0.63 },
    });
    expect(intersect.mock.calls[0][0].firstHitOnly).toBe(true);
    expect(intersect.mock.calls[0][0].ray.direction.toArray()).toEqual([
      0, -1, 0,
    ]);
    expect(intersect.mock.calls[0].slice(1)).toEqual([[7, 51], "auto"]);
    expect(mocks.physical).toHaveBeenCalledWith({
      longitude: 7.1,
      latitude: 51.2,
      heightMeters: 125,
      heightDatum: "dhhn2016",
    });
    expect(item).toEqual({ id: "photo" });
    expect(
      photoReferenceDistanceMeters(point, {
        longitude: 0,
        latitude: 0,
        ecefMeters: [103, 204, 300],
      })
    ).toBe(5);
    expect(
      photoReferenceDistanceMeters(point, { longitude: 0, latitude: 0 })
    ).toBeNull();
    expect(
      photoReferenceDistanceMeters(point, {
        longitude: 0,
        latitude: 0,
        ecefMeters: [NaN, 0, 0],
      })
    ).toBeNull();
  });
  it("deduplicates requests after slider clamping, but separates mode and record identity", async () => {
    const resolver = create();
    const item = record();
    const a = resolver.resolve(item, -1, "auto");
    const b = resolver.resolve(item, 0.1, "auto");
    await task();
    expect(await a).toBe(await b);
    expect(mocks.rays.mock.calls[0][0].centerY).toBe(0.1);
    await resolver.resolve(item, 0.1, "auto");
    expect(intersect).toHaveBeenCalledTimes(1);
    const c = resolver.resolve(item, 0.1, "terrain");
    await task();
    await c;
    const d = resolver.resolve(record(), 0.1, "auto");
    await task();
    await d;
    expect(intersect).toHaveBeenCalledTimes(3);
  });
  it("processes at most one photo per cooperative task and pauses busy work", async () => {
    const resolver = create();
    busy = true;
    const a = resolver.resolve(record("a"), 0.5, "auto");
    const b = resolver.resolve(record("b"), 0.5, "auto");
    await task();
    expect(resolvePhoto).not.toHaveBeenCalled();
    busy = false;
    await vi.advanceTimersByTimeAsync(50);
    await task();
    expect(intersect).toHaveBeenCalledTimes(1);
    await a;
    await task();
    await b;
    expect(intersect).toHaveBeenCalledTimes(2);
  });
  it("retains geographic hits across rebases and while a changed surface is refreshed", async () => {
    const resolver = create();
    const item = record();
    const first = resolver.resolve(item, 0.5, "auto");
    await task();
    const old = await first;
    frame!.sceneFromLocal.makeTranslation(100, 200, 300);
    expect(await resolver.resolve(item, 0.5, "auto")).toBe(old);
    expect(intersect).toHaveBeenCalledTimes(1);
    revision = "surface-2";
    const refresh = resolver.resolve(item, 0.5, "auto");
    expect(resolver.peek(item, 0.5, "auto")).toBe(old);
    await task();
    await refresh;
    expect(intersect).toHaveBeenCalledTimes(2);
    expect(mocks.ground.mock.calls[1][2].elements).toEqual(
      frame!.sceneFromLocal.elements
    );
  });
  it("does not starve queued or intersected jobs when unrelated LOD revisions change", async () => {
    const resolver = create();
    const conversion = deferred<any>();
    mocks.physical.mockReturnValueOnce(conversion.promise);
    const item = record("a");
    const a = resolver.resolve(item, 0.5, "auto");
    const b = resolver.resolve(record("b"), 0.5, "auto");
    revision = "surface-2";
    await task();
    revision = "surface-3";
    conversion.resolve({
      longitude: 7.1,
      latitude: 51.2,
      heightMeters: 125,
      ecefMeters: [100, 200, 300],
    });
    await flush();
    expect(await a).not.toBeNull();
    expect(resolver.peek(item, 0.5, "auto")).not.toBeNull();
    await task();
    expect(await b).not.toBeNull();
    expect(intersect).toHaveBeenCalledTimes(2);
  });
  it("caches missing hits only for the current surface revision and never fabricates a plane", async () => {
    const resolver = create();
    const item = record();
    intersect.mockReturnValueOnce(null);
    const a = resolver.resolve(item, 0.5, "terrain");
    await task();
    expect(await a).toBeNull();
    expect(await resolver.resolve(item, 0.5, "terrain")).toBeNull();
    expect(intersect).toHaveBeenCalledTimes(1);
    expect(mocks.physical).not.toHaveBeenCalled();
    revision = "surface-2";
    expect(resolver.peek(item, 0.5, "terrain")).toBeUndefined();
    const b = resolver.resolve(item, 0.5, "terrain");
    await task();
    expect(await b).not.toBeNull();
  });
  it("allows scene initialization and transient datum failures to retry", async () => {
    const resolver = create();
    const item = record();
    frame = undefined;
    const a = resolver.resolve(item, 0.5, "auto");
    await task();
    expect(await a).toBeNull();
    expect(resolver.peek(item, 0.5, "auto")).toBeUndefined();
    frame = { sceneFromLocal: new Matrix4() };
    mocks.physical.mockRejectedValueOnce(new Error("geoid unavailable"));
    const b = resolver.resolve(item, 0.5, "auto");
    await task();
    expect(await b).toBeNull();
    const c = resolver.resolve(item, 0.5, "auto");
    await task();
    expect(await c).not.toBeNull();
  });
  it("independently aborts subscribers; last abort suppresses late async results", async () => {
    const resolver = create();
    const item = record();
    const first = new AbortController();
    const a = resolver.resolve(item, 0.5, "auto", first.signal);
    const b = resolver.resolve(item, 0.5, "auto");
    first.abort();
    expect(await a).toBeNull();
    await task();
    expect(await b).not.toBeNull();
    const waiting = deferred<ScenePreviewPhoto>();
    resolvePhoto.mockReturnValueOnce(waiting.promise);
    const other = record("other");
    const abort = new AbortController();
    const c = resolver.resolve(other, 0.5, "auto", abort.signal);
    await task();
    abort.abort();
    expect(await c).toBeNull();
    waiting.resolve({ record: other } as ScenePreviewPhoto);
    await flush();
    expect(intersect).toHaveBeenCalledTimes(1);
    expect(resolver.peek(other, 0.5, "auto")).toBeUndefined();
  });
  it("disposes scheduled and pending jobs once, ignoring stale callbacks", async () => {
    const resolver = create();
    const item = record();
    const a = resolver.resolve(item, 0.5, "auto");
    const stale = [...idle.values()][0];
    resolver.dispose();
    resolver.dispose();
    stale();
    await flush();
    expect(await a).toBeNull();
    expect(idle.size).toBe(0);
    expect(resolvePhoto).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(await resolver.resolve(item, 0.5, "auto")).toBeNull();
  });
  it("bounds cached geographic results to 1024 entries", async () => {
    const resolver = create();
    const items = Array.from({ length: 1025 }, (_, i) => record(String(i)));
    for (const item of items) {
      const result = resolver.resolve(item, 0.5, "auto");
      await task();
      await result;
    }
    expect(resolver.peek(items[0], 0.5, "auto")).toBeUndefined();
    expect(resolver.peek(items[1024], 0.5, "auto")).not.toBeNull();
  });
});

describe("distinct resident-surface debug reference rays", () => {
  it.each(["optical", "sensor"] as const)(
    "uses the %s ray and its actual UV rather than a static sensor coordinate",
    async (kind) => {
      const resolver = create();
      mocks.uv.mockImplementation((_projection, ray) =>
        ray ? { x: 0.5 + ray.direction.x, y: 0.5 + ray.direction.z } : null
      );
      const pending = resolver.resolve(record(), 0.8, "auto", undefined, kind);
      await task();
      const result = await pending;
      const selected = mocks.rays.mock.results[0].value[
        kind === "optical" ? "axis" : "sensor"
      ] as Ray;
      expect(
        intersect.mock.calls[0][0].ray.direction.equals(selected.direction)
      ).toBe(true);
      expect(mocks.uv.mock.calls[0][1]).toBe(selected);
      expect(result?.imagePoint).toEqual({
        x: 0.5 + selected.direction.x,
        y: 0.5 + selected.direction.z,
      });
      expect(result?.imagePoint).not.toEqual({ x: 0.5, y: 0.5 });
      expect(mocks.rays.mock.calls[0][0].centerY).toBe(0.5);
    }
  );

  it("constructs sensor-up one source pixel above the sensor centre and casts once", async () => {
    const resolver = create();
    const pending = resolver.resolve(
      record(),
      0.9,
      "terrain",
      undefined,
      "sensor-up"
    );
    await task();
    expect(await pending).not.toBeNull();
    expect(mocks.pixelRay).toHaveBeenCalledWith(
      mocks.projection.mock.results[0].value,
      new Vector3(0, 10, 0),
      { x: 500, y: 399 },
      { widthPx: 1000, heightPx: 800 }
    );
    expect(mocks.uv.mock.calls[0][1]).toBe(
      mocks.pixelRay.mock.results[0].value
    );
    expect(intersect).toHaveBeenCalledTimes(1);
    expect(intersect.mock.calls[0][2]).toBe("terrain");
  });

  it("casts toward the delivered catalogue point but returns the actual nonplanar surface height", async () => {
    const resolver = create();
    const item = {
      ...record(),
      catalogCenter: {
        longitude: 7.2,
        latitude: 51.3,
        heightMeters: 99,
        ecefMeters: [1, 2, 3],
      },
    } as ObliqueImageRecord;
    intersect.mockImplementation((caster) => ({
      point: caster.ray.at(5, new Vector3()),
      surface: "mesh",
    }));
    mocks.ground.mockImplementation((point) => ({
      longitude: 7 + point.x / 1000,
      latitude: 51 + point.z / 1000,
      heightMeters: 100 + point.y,
    }));
    mocks.uv.mockImplementation((_projection, ray) =>
      ray ? { x: 0.5 + ray.direction.x, y: 0.5 + ray.direction.z } : null
    );
    const pending = resolver.resolve(item, 0.7, "auto", undefined, "catalog");
    await task();
    const result = await pending;
    const direction = new Vector3(5, -20, 3).normalize();
    const hit = new Ray(new Vector3(0, 10, 0), direction).at(5, new Vector3());
    expect(intersect.mock.calls[0][0].ray.direction.equals(direction)).toBe(
      true
    );
    expect(mocks.presentation).toHaveBeenCalledWith(
      item.catalogCenter,
      [7, 51, 100],
      frame!.sceneFromLocal
    );
    expect(result?.target.heightMeters).toBeCloseTo(100 + hit.y, 10);
    expect(result?.target.heightMeters).not.toBe(
      item.catalogCenter!.heightMeters
    );
    expect(result?.target.longitude).not.toBe(item.catalogCenter!.longitude);
    expect(result?.imagePoint).toEqual({
      x: 0.5 + direction.x,
      y: 0.5 + direction.z,
    });
    expect(result?.surface).toBe("mesh");
    expect(mocks.physical.mock.calls[0][0].heightDatum).toBe("dhhn2016");
  });

  it("never falls back to a raw catalogue point on absent surface, and retries a changed LOD", async () => {
    const resolver = create();
    const item = {
      ...record(),
      catalogCenter: {
        longitude: 7.2,
        latitude: 51.3,
        heightMeters: 99,
        ecefMeters: [1, 2, 3],
      },
    } as ObliqueImageRecord;
    intersect.mockReturnValueOnce(null);
    const pending = resolver.resolve(item, 0.7, "auto", undefined, "catalog");
    await task();
    expect(await pending).toBeNull();
    expect(
      await resolver.resolve(item, 0.1, "auto", undefined, "catalog")
    ).toBeNull();
    expect(intersect).toHaveBeenCalledTimes(1);
    expect(mocks.physical).not.toHaveBeenCalled();
    expect(resolver.peek(item, 0.9, "auto", "catalog")).toBeNull();
    revision = "surface-2";
    expect(resolver.peek(item, 0.1, "auto", "catalog")).toBeUndefined();
    const refreshed = resolver.resolve(item, 0.1, "auto", undefined, "catalog");
    await task();
    expect(await refreshed).not.toBeNull();
  });

  it("skips missing catalogue metadata and rejects zero-length catalogue directions", async () => {
    const resolver = create();
    const missing = resolver.resolve(
      record(),
      0.5,
      "auto",
      undefined,
      "catalog"
    );
    await task();
    expect(await missing).toBeNull();
    expect(resolvePhoto).not.toHaveBeenCalled();
    const item = {
      ...record(),
      catalogCenter: {
        longitude: 7.2,
        latitude: 51.3,
        heightMeters: 99,
        ecefMeters: [1, 2, 3],
      },
    } as ObliqueImageRecord;
    mocks.presentation.mockImplementation(() => new Vector3(0, 10, 0));
    const invalid = resolver.resolve(item, 0.5, "auto", undefined, "catalog");
    await task();
    expect(await invalid).toBeNull();
    expect(intersect).not.toHaveBeenCalled();
  });

  it("preserves default preferred compatibility while isolating kinds and ignoring nonpreferred centreY", async () => {
    const resolver = create();
    const item = record();
    const preferred = resolver.resolve(item, 0.8, "auto");
    const explicit = resolver.resolve(
      item,
      0.8,
      "auto",
      undefined,
      "preferred"
    );
    await task();
    expect(await preferred).toBe(await explicit);
    const optical = resolver.resolve(item, 0.1, "auto", undefined, "optical");
    const opticalAgain = resolver.resolve(
      item,
      0.9,
      "auto",
      undefined,
      "optical"
    );
    await task();
    expect(await optical).toBe(await opticalAgain);
    expect(resolver.peek(item, 0.7, "auto", "optical")).toBe(await optical);
    expect(resolver.peek(item, 0.8, "auto")).toBe(await preferred);
    const sensor = resolver.resolve(item, 0.1, "auto", undefined, "sensor");
    await task();
    expect(await sensor).not.toBe(await optical);
    expect(intersect).toHaveBeenCalledTimes(3);
  });

  it("pauses mixed-kind jobs while busy, shares the resident Raycaster and aborts kinds independently", async () => {
    const resolver = create();
    const item = record();
    busy = true;
    const optical = resolver.resolve(item, 0.5, "auto", undefined, "optical");
    const abort = new AbortController();
    const sensor = resolver.resolve(item, 0.5, "auto", abort.signal, "sensor");
    const sensorUp = resolver.resolve(
      item,
      0.5,
      "auto",
      undefined,
      "sensor-up"
    );
    await task();
    expect(intersect).not.toHaveBeenCalled();
    abort.abort();
    expect(await sensor).toBeNull();
    busy = false;
    await vi.advanceTimersByTimeAsync(50);
    await task();
    expect(await optical).not.toBeNull();
    expect(intersect).toHaveBeenCalledTimes(1);
    await task();
    expect(await sensorUp).not.toBeNull();
    expect(intersect).toHaveBeenCalledTimes(2);
    expect(intersect.mock.calls[0][0]).toBe(intersect.mock.calls[1][0]);
    expect(intersect.mock.calls[1][0].firstHitOnly).toBe(true);
  });

  it.each([new Vector3(0, 11, 0), new Vector3(NaN, 0, 0)])(
    "rejects non-forward or non-finite debug intersections without a synthetic marker",
    async (point) => {
      const resolver = create();
      intersect.mockReturnValueOnce({ point, surface: "mesh" });
      const pending = resolver.resolve(
        record(),
        0.5,
        "auto",
        undefined,
        "optical"
      );
      await task();
      expect(await pending).toBeNull();
      expect(mocks.physical).not.toHaveBeenCalled();
    }
  );
});

it("retains all five debug-ray hits for 128 records without repeated sampling", async () => {
  const resolver = create();
  const items = Array.from(
    { length: 128 },
    (_, index) =>
      ({
        ...record(String(index)),
        catalogCenter: {
          longitude: 7.2,
          latitude: 51.3,
          heightMeters: 99,
          ecefMeters: [1, 2, 3],
        },
      } as ObliqueImageRecord)
  );
  const kinds = [
    "preferred",
    "optical",
    "sensor",
    "sensor-up",
    "catalog",
  ] as const;
  for (const item of items)
    for (const kind of kinds) {
      const pending = resolver.resolve(item, 0.6, "auto", undefined, kind);
      await task();
      expect(await pending).not.toBeNull();
    }
  expect(intersect).toHaveBeenCalledTimes(640);
  for (const item of items)
    for (const kind of kinds)
      expect(await resolver.resolve(item, 0.6, "auto", undefined, kind)).toBe(
        resolver.peek(item, 0.6, "auto", kind)
      );
  expect(intersect).toHaveBeenCalledTimes(640);
  expect(idle.size).toBe(0);
});

it("restores resident Raycaster first-hit and range defaults between debug jobs", async () => {
  const resolver = create();
  intersect
    .mockImplementationOnce((caster) => {
      caster.firstHitOnly = false;
      caster.near = 42;
      caster.far = 43;
      caster.layers.set(9);
      return { point: new Vector3(0, 0, 0), surface: "mesh" };
    })
    .mockImplementationOnce((caster) => {
      expect(caster.firstHitOnly).toBe(true);
      expect(caster.near).toBe(0);
      expect(caster.far).toBe(Infinity);
      expect(caster.layers.mask).toBe(1);
      return { point: new Vector3(0, 0, 0), surface: "mesh" };
    });
  const item = record();
  const first = resolver.resolve(item, 0.5, "auto", undefined, "optical");
  await task();
  expect(await first).not.toBeNull();
  const second = resolver.resolve(item, 0.5, "auto", undefined, "sensor");
  await task();
  expect(await second).not.toBeNull();
  expect(intersect).toHaveBeenCalledTimes(2);
});
