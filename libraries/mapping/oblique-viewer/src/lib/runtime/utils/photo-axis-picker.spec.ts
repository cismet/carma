import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  Vector3,
} from "three";
import type {
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import { createPhotoAxisPicker } from "./photo-axis-picker";
import { calibrationFromMetadata } from "../../core/utils/calibration";
import { imageProjectionMatrix } from "./image-projection";

const engine = vi.hoisted(() => ({
  runtimes: [] as unknown[],
  acquire: vi.fn(),
  altitude: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getSharedThreeSceneRuntimes: () => engine.runtimes,
  acquireSharedThreeScene: engine.acquire,
}));
vi.mock("./flyToImage", () => ({
  poseOf: (record: ObliqueImageRecord) => record.pose,
  resolveCameraAltitude: engine.altitude,
}));
vi.mock("./image-projection", async () => {
  const { Matrix4 } = await import("three");
  const actual = await vi.importActual<typeof import("./image-projection")>(
    "./image-projection"
  );
  return {
    ...actual,
    imageProjectionMatrix: vi.fn(actual.imageProjectionMatrix),
    // A local, linear coordinate adapter keeps the actual Three ray/mesh math
    // independent of ECEF conversion, which is covered by projection specs.
    sceneToPhotoEnu: (
      _origin: unknown,
      _frame: unknown,
      pose: { longitude: number; latitude: number },
      altitude: number
    ) =>
      new Matrix4().set(
        1,
        0,
        0,
        -(pose.longitude - 7.2) * 100000,
        0,
        0,
        -1,
        -(pose.latitude - 51.27) * 100000,
        0,
        1,
        0,
        -altitude,
        0,
        0,
        0,
        1
      ),
  };
});

const record = (
  id: string,
  x: number,
  bearingDeg = 0,
  direction = [0, 0, -1]
): ObliqueImageRecord =>
  ({
    id,
    sourceId: `source-${id}`,
    seriesId: "2026",
    cameraId: "oblique",
    z: 100,
    m: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    // Footprint-centre ranking would select the wrong image in this fixture.
    centerWGS84: id === "near-axis" ? [8, 52] : [7.2, 51.27],
    pose: {
      longitude: 7.2 + x / 100000,
      latitude: 51.27,
      z: 100,
      bearingDeg,
      pitchDeg: 45,
      rollDeg: 0,
      direction,
      up: [0, 1, 0],
      utmConvergenceRad: 0,
    },
  } as unknown as ObliqueImageRecord);

const calibration = (nativeScale = 1) =>
  calibrationFromMetadata({
    widthPx: 1000 * nativeScale,
    heightPx: 1000 * nativeScale,
    focalLengthMm: 10,
    imageMmToPixelAffine: [
      [100 * nativeScale, 0, 500 * nativeScale - 0.5],
      [0, -100 * nativeScale, 500 * nativeScale - 0.5],
    ],
    mountRotationDeg: 0,
    view: "front",
  });
const disposals: Array<() => void> = [];
const setup = (records: ObliqueImageRecord[], native = false) => {
  const events = new Map<string, (event: unknown) => void>();
  const map = {
    getCenterElevation: () => 0,
    queryTerrainElevation: vi.fn(() => 20),
    on: vi.fn((name: string, handler: (event: unknown) => void) =>
      events.set(name, handler)
    ),
    off: vi.fn((name: string) => events.delete(name)),
  } as unknown as MaplibreMap;
  const surface = new Mesh(
    new PlaneGeometry(1000, 1000),
    new MeshBasicMaterial({ side: DoubleSide })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 10;
  const root = new Group();
  root.add(surface);
  root.updateMatrixWorld(true);
  let version = 1;
  engine.runtimes = native
    ? []
    : [
        {
          id: "photomesh",
          root,
          receivesMapStyleTexture: true,
          mapStyleProjectionVersion: () => version,
        },
      ];
  const release = vi.fn();
  engine.acquire.mockReturnValue({
    release,
    layer: {
      getLocalFrame: () => ({ sceneFromLocal: new Matrix4() }),
      projectSceneToLngLat: (position: Vector3 | number[]) => {
        const x = position instanceof Vector3 ? position.x : position[0];
        const z = position instanceof Vector3 ? position.z : position[2];
        return [7.2 + x / 100000, 51.27 - z / 100000];
      },
      projectLngLatToScene: ([lng, lat]: number[], altitude: number) =>
        new Vector3((lng - 7.2) * 100000, altitude, (51.27 - lat) * 100000),
    },
  });
  const data = {
    imageRecords: new Map(records.map((item) => [item.id, item])),
    datasets: new Map([
      [
        "2026",
        {
          id: "2026",
          heightDatum: "dhhn2016",
          cameras: { oblique: calibration(), highResolution: calibration(4) },
        },
      ],
    ]),
    centers: new Map(),
  } as ObliqueSelectionData;
  const picker = createPhotoAxisPicker(map, data, 0);
  picker.start();
  disposals.push(() => {
    picker.dispose();
    surface.geometry.dispose();
    surface.material.dispose();
  });
  return {
    picker,
    map,
    root,
    surface,
    release,
    events,
    data,
    bumpVersion: () => {
      version++;
    },
  };
};
const query = {
  point: [7.2, 51.27] as [number, number],
  headingRad: 0,
  viewMode: "oblique" as const,
};

beforeEach(() => {
  engine.runtimes = [];
  engine.acquire.mockReset();
  vi.mocked(imageProjectionMatrix).mockClear();
  engine.altitude
    .mockReset()
    .mockImplementation((item: ObliqueImageRecord) => Promise.resolve(item.z));
});
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

describe("arbitrary calibrated photo surface rays", () => {
  it("intersects current real mesh receivers, reuses their traversal and follows a receiver LOD revision", () => {
    const view = setup([]);
    const traverse = vi.spyOn(view.root, "traverseVisible");
    const ray = new Raycaster(new Vector3(50, 100, -20), new Vector3(0, -1, 0));
    const first = view.picker.intersectSurface(ray, [7.2005, 51.2702])!;
    expect(first.surface).toBe("mesh");
    first.point
      .toArray()
      .forEach((value, index) =>
        expect(value).toBeCloseTo([50, 10, -20][index], 9)
      );
    ray.ray.origin.x = 75;
    const second = view.picker.intersectSurface(ray, [7.2005, 51.2702])!;
    second.point
      .toArray()
      .forEach((value, index) =>
        expect(value).toBeCloseTo([75, 10, -20][index], 9)
      );
    expect(first.point.x).toBe(50);
    expect(traverse).toHaveBeenCalledOnce();
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
    view.surface.position.y = 60;
    view.root.updateMatrixWorld(true);
    view.bumpVersion();
    expect(
      view.picker.intersectSurface(ray, [7.2005, 51.2702])!.point.y
    ).toBeCloseTo(60, 9);
    expect(traverse).toHaveBeenCalledTimes(2);
    expect(view.release).toHaveBeenCalledTimes(3);
    view.picker.dispose();
    expect(view.picker.intersectSurface(ray, [7.2005, 51.2702])).toBeNull();
    expect(engine.acquire).toHaveBeenCalledTimes(3);
  });

  it("confirms a slanted native DEM intersection along the actual photo ray without catalog or altitude lookup", () => {
    const view = setup([], true);
    const ray = new Raycaster(
      new Vector3(0, 100, 0),
      new Vector3(1, -1, 0).normalize()
    );
    const hit = view.picker.intersectSurface(ray, [7.2, 51.27])!;
    expect(hit.surface).toBe("terrain");
    expect(hit.point.x).toBeCloseTo(80, 9);
    expect(hit.point.y).toBeCloseTo(20, 9);
    expect(hit.point.z).toBe(0);
    expect(view.map.queryTerrainElevation).toHaveBeenCalledTimes(2);
    const locations = vi
      .mocked(view.map.queryTerrainElevation)
      .mock.calls.map(([point]) => point as [number, number]);
    expect(locations[0][0]).toBeCloseTo(7.201, 10);
    expect(locations[1][0]).toBeCloseTo(7.2008, 10);
    expect(engine.altitude).not.toHaveBeenCalled();
    expect(view.release).toHaveBeenCalledOnce();
  });

  it.each([null, NaN, Infinity])(
    "does not invent a native terrain hit for an unavailable elevation (%s)",
    (elevation) => {
      const view = setup([], true);
      vi.mocked(view.map.queryTerrainElevation).mockReturnValue(elevation);
      const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
      expect(view.picker.intersectSurface(ray, [7.2, 51.27])).toBeNull();
      expect(view.map.queryTerrainElevation).toHaveBeenCalledOnce();
      expect(view.release).toHaveBeenCalledOnce();
    }
  );

  it("rejects upward or behind-camera terrain intersections and caps non-converging DEM queries", () => {
    const view = setup([], true);
    expect(
      view.picker.intersectSurface(
        new Raycaster(new Vector3(0, 100, 0), new Vector3(0, 1, 0)),
        [7.2, 51.27]
      )
    ).toBeNull();
    expect(
      view.picker.intersectSurface(
        new Raycaster(new Vector3(0, -10, 0), new Vector3(0, -1, 0)),
        [7.2, 51.27]
      )
    ).toBeNull();
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
    let height = 0;
    vi.mocked(view.map.queryTerrainElevation).mockImplementation(
      () => (height += 20)
    );
    expect(
      view.picker.intersectSurface(
        new Raycaster(
          new Vector3(0, 500, 0),
          new Vector3(1, -1, 0).normalize()
        ),
        [7.2, 51.27]
      )
    ).toBeNull();
    expect(view.map.queryTerrainElevation).toHaveBeenCalledTimes(5);
    expect(view.release).toHaveBeenCalledTimes(3);
  });
});

describe("physical photo-axis selection", () => {
  it("selects the native higher-resolution photograph at the target even when its surface axis is farther away", async () => {
    const near = record("near-axis", 20);
    const detailed = {
      ...record("native-detail", 35, 30),
      cameraId: "highResolution",
    };
    const view = setup([near, detailed]);
    const densityQuery = {
      ...query,
      heightMeters: 10,
      selectionStrategy: "best-resolution" as const,
    };
    expect(
      await view.picker.pick([near, detailed], densityQuery, false, () => true)
    ).toBe(detailed);
    expect(
      await view.picker.pick(
        [near, detailed],
        { ...densityQuery, selectionStrategy: "nearest-axis" },
        false,
        () => true
      )
    ).toBe(near);
    // When the sector contains no footprint, heading retains priority over density.
    expect(
      await view.picker.pick([near, detailed], densityQuery, true, () => true)
    ).toBe(near);
  });

  it("reuses calibrated projection matrices and surface hits across pointer motion and LOD refresh", async () => {
    const near = record("near-axis", 20);
    const detailed = {
      ...record("native-detail", 35),
      cameraId: "highResolution",
    };
    const view = setup([near, detailed]);
    const intersect = vi.spyOn(Raycaster.prototype, "intersectObjects");
    const densityQuery = {
      ...query,
      heightMeters: 10,
      selectionStrategy: "best-resolution" as const,
    };
    await view.picker.pick([near, detailed], densityQuery, false, () => true);
    expect(imageProjectionMatrix).toHaveBeenCalledTimes(2);
    expect(intersect).toHaveBeenCalledTimes(2);
    await view.picker.pick(
      [near, detailed],
      { ...densityQuery, point: [7.20001, 51.27] },
      false,
      () => true
    );
    expect(imageProjectionMatrix).toHaveBeenCalledTimes(2);
    expect(intersect).toHaveBeenCalledTimes(2);
    view.bumpVersion();
    await view.picker.pick([near, detailed], densityQuery, false, () => true);
    expect(intersect).toHaveBeenCalledTimes(4);
    expect(imageProjectionMatrix).toHaveBeenCalledTimes(2);
    expect(engine.altitude).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, NaN])(
    "uses axis distance without claiming calibrated density for an unavailable target height (%s)",
    async (heightMeters) => {
      const near = record("near-axis", 20);
      const detailed = {
        ...record("native-detail", 35),
        cameraId: "highResolution",
      };
      const view = setup([near, detailed]);
      expect(
        await view.picker.pick(
          [near, detailed],
          { ...query, heightMeters, selectionStrategy: "best-resolution" },
          false,
          () => true
        )
      ).toBe(near);
      expect(imageProjectionMatrix).not.toHaveBeenCalled();
    }
  );

  it("does not treat an explicitly unverified camera height as calibrated native density", async () => {
    const near = record("near-axis", 20);
    const detailed = {
      ...record("native-detail", 35),
      cameraId: "highResolution",
    };
    const view = setup([near, detailed]);
    view.data.datasets.get("2026")!.heightDatum = "unknown";
    view.data.datasets.get("2026")!.allowUnverifiedSourceHeight = true;
    expect(
      await view.picker.pick(
        [near, detailed],
        { ...query, heightMeters: 10, selectionStrategy: "best-resolution" },
        false,
        () => true
      )
    ).toBe(near);
    expect(imageProjectionMatrix).not.toHaveBeenCalled();
  });

  it("ranks real mesh-axis hits by surface distance and preserves heading-first gap fallback", async () => {
    const far = record("far-axis", 100);
    const near = record("near-axis", 20, 30);
    const view = setup([far, near]);
    const debug = vi.fn();
    view.picker.subscribe(debug);
    expect(await view.picker.pick([far, near], query, false, () => true)).toBe(
      near
    );
    expect(debug.mock.lastCall![0]).toMatchObject({
      imageId: near.sourceId,
      seriesId: "2026",
      surface: "mesh",
    });
    expect(debug.mock.lastCall![0].distance).toBeGreaterThan(0);
    expect(Number.isFinite(debug.mock.lastCall![0].distance)).toBe(true);
    expect(await view.picker.pick([far, near], query, true, () => true)).toBe(
      far
    );
    expect(debug.mock.lastCall![0].imageId).toBe(far.sourceId);
    expect(vi.mocked(view.map.queryTerrainElevation)).not.toHaveBeenCalled();
    expect(view.release).toHaveBeenCalledTimes(2);
  });

  it("reuses cached live-axis hits and invalidates them when receiver LOD version changes", async () => {
    const photo = record("inclined", 0, 0, [0.5, 0, -1]);
    const view = setup([photo]);
    const intersect = vi.spyOn(Raycaster.prototype, "intersectObjects");
    const traverse = vi.spyOn(view.root, "traverseVisible");
    const debug = vi.fn();
    view.picker.subscribe(debug);
    await view.picker.pick([photo], query, false, () => true);
    const firstDistance = debug.mock.lastCall![0].distance;
    await view.picker.pick(
      [photo],
      { ...query, point: [7.2001, 51.27] },
      false,
      () => true
    );
    expect(intersect).toHaveBeenCalledOnce();
    expect(traverse).toHaveBeenCalledOnce();
    view.surface.position.y = 60;
    view.root.updateMatrixWorld(true);
    view.bumpVersion();
    await view.picker.pick([photo], query, false, () => true);
    expect(intersect).toHaveBeenCalledTimes(2);
    expect(traverse).toHaveBeenCalledTimes(2);
    expect(debug.mock.lastCall![0].distance).toBeLessThan(firstDistance);
    expect(engine.altitude).toHaveBeenCalledOnce();
    expect(view.release).toHaveBeenCalledTimes(3);
  });

  it("uses and caches the native terrain intersection and refreshes it on DEM source updates", async () => {
    const photo = record("native", 30);
    const view = setup([photo], true);
    const debug = vi.fn();
    view.picker.subscribe(debug);
    expect(await view.picker.pick([photo], query, false, () => true)).toBe(
      photo
    );
    expect(debug.mock.lastCall![0].surface).toBe("terrain");
    expect(vi.mocked(view.map.queryTerrainElevation)).toHaveBeenCalledTimes(2);
    await view.picker.pick([photo], query, false, () => true);
    expect(vi.mocked(view.map.queryTerrainElevation)).toHaveBeenCalledTimes(2);
    view.events.get("sourcedata")?.({ source: { type: "raster-dem" } });
    await view.picker.pick([photo], query, false, () => true);
    expect(vi.mocked(view.map.queryTerrainElevation)).toHaveBeenCalledTimes(4);
    expect(engine.altitude).toHaveBeenCalledOnce();
    view.picker.clearDebug();
    expect(debug.mock.lastCall![0]).toBeNull();
    view.picker.dispose();
    expect(view.map.off).toHaveBeenCalledWith(
      "sourcedata",
      expect.any(Function)
    );
  });

  it("abandons an obsolete async altitude batch without publishing debug and releases the scene", async () => {
    const photo = record("pending", 20);
    let resolve!: (altitude: number) => void;
    engine.altitude.mockImplementationOnce(
      () =>
        new Promise<number>((done) => {
          resolve = done;
        })
    );
    const view = setup([photo]);
    const debug = vi.fn();
    view.picker.subscribe(debug);
    const intersect = vi.spyOn(Raycaster.prototype, "intersectObjects");
    let current = true;
    const pending = view.picker.pick([photo], query, false, () => current);
    current = false;
    resolve(100);
    await expect(pending).resolves.toBeUndefined();
    expect(intersect).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledOnce();
    expect(debug).toHaveBeenCalledWith(null);
    expect(view.release).toHaveBeenCalledOnce();
    view.picker.dispose();
    await expect(
      view.picker.pick([photo], query, false, () => true)
    ).resolves.toBeUndefined();
    expect(engine.acquire).toHaveBeenCalledOnce();
  });
});
