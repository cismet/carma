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
  uv: vi.fn(),
  ground: vi.fn(),
  physical: vi.fn(),
  sceneToPhoto: vi.fn(),
  projection: vi.fn(),
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
  photoCenterRayUv: mocks.uv,
  sceneToPresentationPoint: mocks.ground,
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
const create = () => {
  const resolver = createPhotoReferencePoints({
    map: {} as MaplibreMap,
    resolvePhoto,
    intersectSurface: intersect,
    readSurfaceRevision: () => revision,
    isBusy: () => busy,
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
  }));
  mocks.uv.mockReturnValue({ x: 0.47, y: 0.63 });
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
  it("bounds cached geographic results to 512 entries", async () => {
    const resolver = create();
    const items = Array.from({ length: 513 }, (_, i) => record(String(i)));
    for (const item of items) {
      const result = resolver.resolve(item, 0.5, "auto");
      await task();
      await result;
    }
    expect(resolver.peek(items[0], 0.5, "auto")).toBeUndefined();
    expect(resolver.peek(items[512], 0.5, "auto")).not.toBeNull();
  });
});
