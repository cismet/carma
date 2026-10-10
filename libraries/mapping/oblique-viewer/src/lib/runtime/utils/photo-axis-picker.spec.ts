vi.mock("./image-selection-ecef", () => ({
  physicalImageQueryTarget: async (target: any) => ({
    ...target,
    ecefMeters: [target.longitude, target.latitude, target.heightMeters ?? 0],
  }),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CssPixels, Meters } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Box3,
  DoubleSide,
  Group,
  InstancedMesh,
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
import { imageProjectionMatrix } from "../../core/utils/image-projection";

const engine = vi.hoisted(() => ({
  runtimes: [] as unknown[],
  acquire: vi.fn(),
  altitude: vi.fn(),
  terrain: vi.fn(),
  terrainBatch: vi.fn(),
  terrainSubscribers: new Set<() => void>(),
  terrainSubscribe: vi.fn(),
  terrainUnsubscribe: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getSharedThreeSceneRuntimes: () => engine.runtimes,
  acquireSharedThreeScene: engine.acquire,
  getSharedThreeTerrainElevation: engine.terrain,
  getSharedThreeTerrainElevations: engine.terrainBatch,
  subscribeSharedThreeTerrain: (_map: unknown, listener: () => void) => {
    engine.terrainSubscribe(listener);
    engine.terrainSubscribers.add(listener);
    return () => {
      engine.terrainSubscribers.delete(listener);
      engine.terrainUnsubscribe();
    };
  },
}));
vi.mock("../../core/utils/photo-center-rays", async () => {
  const actual = await vi.importActual<
    typeof import("../../core/utils/photo-center-rays")
  >("../../core/utils/photo-center-rays");
  return {
    ...actual,
    presentationPointToScene: (p: {
      longitude: number;
      latitude: number;
      heightMeters: number;
    }) =>
      new Vector3(
        (p.longitude - 7.2) * 100000,
        p.heightMeters,
        -(p.latitude - 51.27) * 100000
      ),
  };
});
vi.mock("./flyToImage", () => ({
  resolveCameraAltitude: engine.altitude,
}));
vi.mock("../../core/utils/image-projection", async () => {
  const { Matrix4 } = await import("three");
  const actual = await vi.importActual<
    typeof import("../../core/utils/image-projection")
  >("../../core/utils/image-projection");
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

const calibration = (nativeScale = 1, principalX = 500) =>
  calibrationFromMetadata({
    widthPx: 1000 * nativeScale,
    heightPx: 1000 * nativeScale,
    focalLengthMm: 10,
    imageMmToPixelAffine: [
      [100 * nativeScale, 0, principalX * nativeScale - 0.5],
      [0, -100 * nativeScale, 500 * nativeScale - 0.5],
    ],
    mountRotationDeg: 0,
    view: "front",
  });
const disposals: Array<() => void> = [];
const setup = (records: ObliqueImageRecord[], native = false) => {
  const events = new Map<string, (event: unknown) => void>();
  const map = {
    transform: { width: 1000, height: 800 },
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
  let version = 1,
    frameRevision = 1;
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
  let onFrame: ((frame: any) => void) | undefined;
  const stopFrame = vi.fn(() => {
    onFrame = undefined;
  });
  const addBeforeRenderCallback = vi.fn((callback: (frame: any) => void) => {
    onFrame = callback;
    return stopFrame;
  });
  engine.acquire.mockReturnValue({
    release,
    layer: {
      addBeforeRenderCallback,
      getLocalFrame: () => ({
        sceneFromLocal: new Matrix4(),
        revision: frameRevision,
      }),
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
    stopFrame,
    addBeforeRenderCallback,
    render: (
      clip = new Matrix4().set(
        0.01,
        0,
        0,
        0,
        0,
        0,
        0.01,
        0,
        0,
        0.01,
        0,
        0,
        0,
        0,
        0,
        1
      )
    ) =>
      onFrame?.({
        renderCamera: {
          projectionMatrix: clip,
          matrixWorldInverse: new Matrix4(),
        },
      }),
    events,
    data,
    bumpVersion: () => {
      version++;
    },
    bumpFrameRevision: () => {
      frameRevision++;
    },
  };
};
const addPublishedTerrain = (view: ReturnType<typeof setup>, bounds: Box3) => {
  const terrainMesh = new Mesh(
    view.surface.geometry.clone(),
    new MeshBasicMaterial()
  );
  terrainMesh.userData.isShadowTerrainSurface = true;
  const terrainRoot = new Group();
  terrainRoot.add(terrainMesh);
  terrainRoot.updateMatrixWorld(true);
  const getPublishedTerrainTiles = vi.fn(() => [{ bounds, mesh: terrainMesh }]);
  engine.runtimes.push({
    id: "cached-raster-dem",
    root: terrainRoot,
    providesTerrain: true,
    receivesMapStyleTexture: true,
    mapStyleProjectionVersion: () => 1,
    getPublishedTerrainTiles,
  });
  disposals.push(() => {
    terrainMesh.geometry.dispose();
    terrainMesh.material.dispose();
  });
  return {
    root: terrainRoot,
    getPublishedTerrainTiles,
    rootRaycast: vi.spyOn(terrainRoot, "raycast"),
    meshRaycast: vi.spyOn(terrainMesh, "raycast"),
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
  engine.terrain.mockReset().mockReturnValue(undefined);
  engine.terrainBatch
    .mockReset()
    .mockImplementation(
      (_map, coordinates: Float64Array, output?: Float64Array) => {
        const heights = output ?? new Float64Array(coordinates.length / 2);
        heights.fill(NaN);
        return heights;
      }
    );
  engine.terrainSubscribers.clear();
  engine.terrainSubscribe.mockClear();
  engine.terrainUnsubscribe.mockClear();
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
  it.each([false, true])(
    "returns a world-space geometric normal under nonuniform transforms (instanced=%s)",
    (instanced) => {
      const view = setup([]);
      const geometry = new PlaneGeometry(10, 10);
      const material = new MeshBasicMaterial({ side: DoubleSide });
      const mesh = instanced
        ? new InstancedMesh(geometry, material, 1)
        : new Mesh(geometry, material);
      disposals.push(() => {
        geometry.dispose();
        material.dispose();
      });
      view.root.clear();
      view.root.add(mesh);
      view.root.rotation.set(0.2, -0.4, 0.1);
      view.root.scale.set(3, 0.7, 1.5);
      mesh.rotation.set(0.45, 0.2, -0.3);
      mesh.scale.set(0.8, 2.1, 1.2);
      const instance = new Matrix4()
        .makeRotationY(0.6)
        .scale(new Vector3(2, 0.5, 1.3));
      if (mesh instanceof InstancedMesh) {
        mesh.setMatrixAt(0, instance);
        mesh.instanceMatrix.needsUpdate = true;
      }
      view.root.updateMatrixWorld(true);
      const world = mesh.matrixWorld.clone();
      if (instanced) world.multiply(instance);
      const center = new Vector3().applyMatrix4(world);
      const tangentX = new Vector3(1, 0, 0).applyMatrix4(world).sub(center);
      const tangentY = new Vector3(0, 1, 0).applyMatrix4(world).sub(center);
      // An independent geometric cross-product catches an incorrect direction transform.
      const expected = tangentX.cross(tangentY).normalize();
      expect(
        expected.distanceTo(new Vector3(0, 0, 1).transformDirection(world))
      ).toBeGreaterThan(0.1);
      const hit = view.picker.intersectSurface(
        new Raycaster(
          center.clone().addScaledVector(expected, 50),
          expected.clone().negate()
        ),
        [7.2, 51.27],
        "mesh"
      );
      expect(hit?.surface).toBe("mesh");
      expect(hit?.point.distanceTo(center)).toBeLessThan(1e-5);
      expect(hit?.normal?.length()).toBeCloseTo(1, 10);
      expect(hit?.normal?.distanceTo(expected)).toBeLessThan(1e-6);
    }
  );

  it("keeps custom receiver hits without face normals compatible", () => {
    const view = setup([]);
    vi.spyOn(view.surface, "raycast").mockImplementation((_ray, hits) => {
      hits.push({
        distance: 10,
        point: new Vector3(0, 10, 0),
        object: view.surface,
      });
    });
    const hit = view.picker.intersectSurface(
      new Raycaster(new Vector3(0, 20, 0), new Vector3(0, -1, 0)),
      [7.2, 51.27],
      "mesh"
    );
    expect(hit).toMatchObject({
      point: new Vector3(0, 10, 0),
      surface: "mesh",
    });
    expect(hit?.normal).toBeUndefined();
  });

  it("uses only the explicitly selected mesh or terrain sampler", () => {
    const view = setup([]);
    const rootRaycast = vi.spyOn(view.root, "raycast");
    engine.terrain.mockReturnValue(42);
    const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));

    const terrain = view.picker.intersectSurface(ray, [7.2, 51.27], "terrain");
    expect(terrain?.surface).toBe("terrain");
    expect(rootRaycast).not.toHaveBeenCalled();

    engine.terrain.mockClear();
    const mesh = view.picker.intersectSurface(ray, [7.2, 51.27], "mesh");
    expect(mesh?.surface).toBe("mesh");
    expect(engine.terrain).not.toHaveBeenCalled();
  });

  it("uses screen-image-only 3D buildings for surface mode while terrain mode excludes them", () => {
    const view = setup([]);
    view.surface.position.y = 66;
    view.root.updateMatrixWorld(true);
    engine.runtimes = [
      {
        id: "visible-lod2-buildings",
        root: view.root,
        providesTerrain: false,
        receivesMapStyleTexture: false,
        receivesScreenImages: true,
        mapStyleProjectionVersion: () => 1,
      },
    ];
    engine.terrain.mockReturnValue(42);
    const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
    const buildingRaycast = vi.spyOn(view.surface, "raycast");
    const surface = view.picker.intersectSurface(ray, [7.2, 51.27], "auto");
    expect(surface?.surface).toBe("mesh");
    expect(surface?.point.y).toBeCloseTo(66, 9);
    expect(buildingRaycast).toHaveBeenCalled();
    buildingRaycast.mockClear();
    const terrain = view.picker.intersectSurface(ray, [7.2, 51.27], "terrain");
    expect(terrain?.surface).toBe("terrain");
    expect(terrain?.point.y).toBeCloseTo(42, 9);
    expect(buildingRaycast).not.toHaveBeenCalled();
  });

  it("ignores a hidden building parent and restores the surface when it becomes visible", () => {
    const view = setup([]);
    view.surface.position.y = 66;
    const parent = new Group();
    parent.add(view.root);
    parent.updateMatrixWorld(true);
    engine.runtimes = [
      {
        id: "lod2-buildings",
        root: view.root,
        receivesScreenImages: true,
        mapStyleProjectionVersion: () => 1,
      },
    ];
    engine.terrain.mockReturnValue(42);
    const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
    expect(
      view.picker.intersectSurface(ray, [7.2, 51.27], "auto")?.point.y
    ).toBeCloseTo(66, 9);
    const buildingRaycast = vi.spyOn(view.surface, "raycast");
    parent.visible = false;
    expect(
      view.picker.intersectSurface(ray, [7.2, 51.27], "auto")?.point.y
    ).toBeCloseTo(42, 9);
    expect(buildingRaycast).not.toHaveBeenCalled();
    parent.visible = true;
    expect(
      view.picker.intersectSurface(ray, [7.2, 51.27], "auto")?.point.y
    ).toBeCloseTo(66, 9);
    expect(buildingRaycast).toHaveBeenCalled();
  });

  it("intersects current real mesh receivers through their roots and follows a receiver LOD revision", () => {
    const view = setup([]);
    const rootRaycast = vi.spyOn(view.root, "raycast");
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
    expect(rootRaycast).toHaveBeenCalledTimes(2);
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
    view.surface.position.y = 60;
    view.root.updateMatrixWorld(true);
    view.bumpVersion();
    expect(
      view.picker.intersectSurface(ray, [7.2005, 51.2702])!.point.y
    ).toBeCloseTo(60, 9);
    expect(rootRaycast).toHaveBeenCalledTimes(3);
    expect(view.release).toHaveBeenCalledTimes(3);
    view.picker.dispose();
    expect(view.picker.intersectSurface(ray, [7.2005, 51.2702])).toBeNull();
    expect(engine.acquire).toHaveBeenCalledTimes(4);
  });

  it("restores unchanged receiver roots after a dispose and restart", () => {
    const view = setup([]);
    const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
    expect(view.picker.intersectSurface(ray, [7.2, 51.27])!.surface).toBe(
      "mesh"
    );
    view.picker.dispose();
    view.picker.start();
    expect(view.picker.intersectSurface(ray, [7.2, 51.27])!.surface).toBe(
      "mesh"
    );
  });

  it("preserves receiver-specific bounding-volume raycasts instead of flattening tile meshes", () => {
    const view = setup([]);
    const meshRaycast = vi.spyOn(view.surface, "raycast");
    const rootRaycast = vi
      .spyOn(view.root, "raycast")
      .mockImplementation((ray, hits) => {
        hits.push({
          distance: 80,
          point: ray.ray.at(80, new Vector3()),
          object: view.surface,
        });
        return false;
      });
    const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
    expect(view.picker.intersectSurface(ray, [7.2, 51.27])!.point.y).toBe(20);
    expect(rootRaycast).toHaveBeenCalledOnce();
    expect(meshRaycast).not.toHaveBeenCalled();
  });

  it("retries a hidden first tile hit without losing the farther visible surface", () => {
    const view = setup([]);
    const hidden = new Group();
    hidden.visible = false;
    view.root.add(hidden);
    const ray = new Raycaster(
      new Vector3(0, 100, 0),
      new Vector3(0, -1, 0)
    ) as Raycaster & { firstHitOnly: boolean };
    ray.firstHitOnly = true;
    const rootRaycast = vi
      .spyOn(view.root, "raycast")
      .mockImplementation((currentRay, hits) => {
        hits.push({
          distance: 20,
          point: currentRay.ray.at(20, new Vector3()),
          object: hidden,
        });
        if (!(currentRay as typeof ray).firstHitOnly)
          hits.push({
            distance: 90,
            point: currentRay.ray.at(90, new Vector3()),
            object: view.surface,
          });
        return false;
      });
    expect(view.picker.intersectSurface(ray, [7.2, 51.27])!.point.y).toBe(10);
    expect(rootRaycast).toHaveBeenCalledTimes(2);
    expect(ray.firstHitOnly).toBe(true);
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
  });

  it("ignores hidden receiver descendants and falls back to native terrain", () => {
    const view = setup([]);
    view.surface.visible = false;
    const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
    expect(view.picker.intersectSurface(ray, [7.2, 51.27])!.surface).toBe(
      "terrain"
    );
  });

  it("finds a slanted ray's first cached DEM crossing with shared batches and reusable buffers", () => {
    const view = setup([]);
    const dem = addPublishedTerrain(
      view,
      new Box3(new Vector3(600, 0, -10), new Vector3(900, 120, 10))
    );
    engine.terrain.mockReturnValue(999);
    engine.terrainBatch.mockImplementation(
      (_map, coordinates: Float64Array, output: Float64Array) => {
        for (let index = 0; index < output.length; index++) {
          const x = (coordinates[2 * index] - 7.2) * 100000;
          output[index] = 42 + 0.2 * (x - 600);
        }
        return output;
      }
    );
    const ray = new Raycaster(
      new Vector3(600, 120, 0),
      new Vector3(1, -1, 0).normalize()
    );
    const first = view.picker.intersectSurface(ray, [7.206, 51.27])!;
    expect(first.surface).toBe("terrain");
    // y = 120-(x-600), DEM y = 42+0.2*(x-600), so x=665 and y=55.
    expect(first.point.distanceTo(new Vector3(665, 55, 0))).toBeLessThan(1);
    const second = view.picker.intersectSurface(ray, [7.206, 51.27])!;
    expect(second.point.distanceTo(first.point)).toBeLessThan(1e-8);
    expect(dem.getPublishedTerrainTiles).toHaveBeenCalledOnce();
    expect(engine.terrainBatch.mock.calls.length).toBeGreaterThanOrEqual(4);
    const coordinateBuffer = engine.terrainBatch.mock.calls[0][1].buffer;
    const heightBuffer = engine.terrainBatch.mock.calls[0][2].buffer;
    for (const [map, coordinates, output] of engine.terrainBatch.mock.calls) {
      expect(map).toBe(view.map);
      expect(coordinates.buffer).toBe(coordinateBuffer);
      expect(output.buffer).toBe(heightBuffer);
      expect(coordinates.length).toBe(2 * output.length);
      expect(output.length).toBeLessThanOrEqual(64);
    }
    view.bumpVersion();
    expect(
      view.picker
        .intersectSurface(ray, [7.206, 51.27])!
        .point.distanceTo(first.point)
    ).toBeLessThan(1e-8);
    expect(dem.getPublishedTerrainTiles).toHaveBeenCalledTimes(2);
    expect(dem.rootRaycast).not.toHaveBeenCalled();
    expect(dem.meshRaycast).not.toHaveBeenCalled();
    expect(engine.terrain).not.toHaveBeenCalled();
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
  });

  it("uses hidden DEM CPU bounds for batched angled sampling without adding its meshes to visible receivers", () => {
    const view = setup([]);
    const dem = addPublishedTerrain(
      view,
      new Box3(new Vector3(600, 0, -10), new Vector3(900, 120, 10))
    );
    dem.root.visible = false;
    engine.terrainBatch.mockImplementation(
      (_map, coordinates: Float64Array, output: Float64Array) => {
        for (let i = 0; i < output.length; i++) {
          const x = (coordinates[2 * i] - 7.2) * 100000;
          output[i] = 42 + 0.2 * (x - 600);
        }
        return output;
      }
    );
    const ray = new Raycaster(
      new Vector3(600, 120, 0),
      new Vector3(1, -1, 0).normalize()
    );
    const hit = view.picker.intersectSurface(ray, [7.206, 51.27])!;
    expect(hit.surface).toBe("terrain");
    expect(hit.point.distanceTo(new Vector3(665, 55, 0))).toBeLessThan(1);
    expect(engine.terrainBatch).toHaveBeenCalled();
    expect(dem.getPublishedTerrainTiles).toHaveBeenCalledOnce();
    expect(dem.rootRaycast).not.toHaveBeenCalled();
    expect(dem.meshRaycast).not.toHaveBeenCalled();
    expect(dem.root.visible).toBe(false);
    engine.terrainBatch.mockClear();
    expect(
      view.picker.intersectSurface(ray, [7.206, 51.27], "mesh")
    ).toBeNull();
    expect(engine.terrainBatch).not.toHaveBeenCalled();
  });
  it("does not invent a cached DEM crossing through a partially missing height interval", () => {
    const view = setup([]);
    const dem = addPublishedTerrain(
      view,
      new Box3(new Vector3(600, 0, -10), new Vector3(900, 120, 10))
    );
    engine.terrain.mockReturnValue(42);
    const samples: number[] = [];
    engine.terrainBatch.mockImplementation(
      (_map, coordinates: Float64Array, output: Float64Array) => {
        for (let index = 0; index < output.length; index++) {
          const x = (coordinates[2 * index] - 7.2) * 100000;
          output[index] = x >= 650 && x <= 680 ? NaN : 42 + 0.2 * (x - 600);
          samples.push(output[index]);
        }
        return output;
      }
    );
    const ray = new Raycaster(
      new Vector3(600, 120, 0),
      new Vector3(1, -1, 0).normalize()
    );
    expect(view.picker.intersectSurface(ray, [7.206, 51.27])).toBeNull();
    expect(samples.some(Number.isNaN)).toBe(true);
    expect(samples.some(Number.isFinite)).toBe(true);
    expect(samples.length).toBeLessThanOrEqual(4096);
    expect(engine.terrain).not.toHaveBeenCalled();
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
    expect(dem.rootRaycast).not.toHaveBeenCalled();
    expect(dem.meshRaycast).not.toHaveBeenCalled();
  });

  it("chooses a nearer cached DEM ridge before a distant real mesh intersection", () => {
    const view = setup([]);
    view.surface.scale.set(4, 4, 4);
    view.root.updateMatrixWorld(true);
    const meshRaycast = vi.spyOn(view.surface, "raycast");
    const dem = addPublishedTerrain(
      view,
      new Box3(new Vector3(600, 0, -10), new Vector3(900, 120, 10))
    );
    engine.terrainBatch.mockImplementation(
      (_map, _coordinates: Float64Array, output: Float64Array) => {
        output.fill(80);
        return output;
      }
    );
    const ray = new Raycaster(
      new Vector3(600, 120, 0),
      new Vector3(1, -1, 0).normalize()
    );
    const hit = view.picker.intersectSurface(ray, [7.206, 51.27])!;
    expect(hit.surface).toBe("terrain");
    expect(hit.point.distanceTo(new Vector3(640, 80, 0))).toBeLessThan(1);
    expect(meshRaycast).toHaveBeenCalledOnce();
    expect(dem.rootRaycast).not.toHaveBeenCalled();
    expect(dem.meshRaycast).not.toHaveBeenCalled();
    expect(engine.terrain).not.toHaveBeenCalled();
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
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
  it("keeps nearest surface-axis selection independent of native sensor resolution", async () => {
    const near = record("near-axis", 20);
    const detailed = {
      ...record("native-detail", 35, 30),
      cameraId: "highResolution",
    };
    const view = setup([near, detailed]);
    for (const records of [
      [near, detailed],
      [detailed, near],
    ]) {
      expect(
        await view.picker.pick(
          records,
          { ...query, heightMeters: 10 },
          false,
          () => true
        )
      ).toBe(near);
      expect(await view.picker.pick(records, query, true, () => true)).toBe(
        near
      );
    }
    expect(imageProjectionMatrix).not.toHaveBeenCalled();
  });

  it("reuses geographic surface hits across pointer motion and frame refits, refreshing only on surface changes", async () => {
    const near = record("near-axis", 20);
    const detailed = {
      ...record("native-detail", 35),
      cameraId: "highResolution",
    };
    const view = setup([near, detailed]);
    const intersect = vi.spyOn(Raycaster.prototype, "intersectObjects");
    await view.picker.pick([near, detailed], query, false, () => true);
    expect(intersect).toHaveBeenCalledTimes(2);
    await view.picker.pick(
      [near, detailed],
      { ...query, point: [7.20001, 51.27] },
      false,
      () => true
    );
    view.bumpFrameRevision();
    await view.picker.pick([near, detailed], query, false, () => true);
    expect(intersect).toHaveBeenCalledTimes(2);
    view.bumpVersion();
    await view.picker.pick([near, detailed], query, false, () => true);
    expect(intersect).toHaveBeenCalledTimes(4);
    expect(engine.altitude).toHaveBeenCalledTimes(2);
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
    const rootRaycast = vi.spyOn(view.root, "raycast");
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
    expect(rootRaycast).toHaveBeenCalledOnce();
    view.surface.position.y = 60;
    view.root.updateMatrixWorld(true);
    view.bumpVersion();
    await view.picker.pick([photo], query, false, () => true);
    expect(intersect).toHaveBeenCalledTimes(2);
    expect(rootRaycast).toHaveBeenCalledTimes(2);
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
    expect(engine.acquire).toHaveBeenCalledTimes(2);
  });
});

describe("shared DEM photo surface fallback", () => {
  it("uses the shared DEM outside mesh bounds without querying native DEM", () => {
    const view = setup([]);
    vi.mocked(view.map.queryTerrainElevation).mockReturnValue(null);
    engine.terrain.mockReturnValue(42);
    const ray = new Raycaster(new Vector3(600, 100, 0), new Vector3(0, -1, 0));
    const hit = view.picker.intersectSurface(ray, [7.206, 51.27])!;
    expect(hit.surface).toBe("terrain");
    expect(hit.point.y).toBe(42);
    expect(engine.terrain).toHaveBeenCalledTimes(2);
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
  });
  it("keeps a real mesh hit ahead of the shared DEM sampler", () => {
    const view = setup([]);
    engine.terrain.mockReturnValue(99);
    const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
    const hit = view.picker.intersectSurface(ray, [7.2, 51.27])!;
    expect(hit.surface).toBe("mesh");
    expect(hit.point.y).toBeCloseTo(10, 9);
    expect(engine.terrain).not.toHaveBeenCalled();
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
  });
  it("invalidates reused axis hits on shared DEM change without publishing React debug state", async () => {
    const item = record("shared-axis", 600);
    const view = setup([item]);
    engine.terrain.mockReturnValue(42);
    const listener = vi.fn();
    view.picker.subscribe(listener);
    expect(await view.picker.pick([item], query, false, () => true)).toBe(item);
    const sampled = engine.terrain.mock.calls.length;
    expect(sampled).toBeGreaterThan(0);
    expect(await view.picker.pick([item], query, false, () => true)).toBe(item);
    expect(engine.terrain).toHaveBeenCalledTimes(sampled);
    const publications = listener.mock.calls.length;
    engine.terrain.mockReturnValue(58);
    for (const notify of engine.terrainSubscribers) notify();
    expect(listener).toHaveBeenCalledTimes(publications);
    expect(await view.picker.pick([item], query, false, () => true)).toBe(item);
    expect(engine.terrain.mock.calls.length).toBeGreaterThan(sampled);
    expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
    const ray = new Raycaster(new Vector3(600, 100, 0), new Vector3(0, -1, 0));
    expect(view.picker.intersectSurface(ray, [7.206, 51.27])!.point.y).toBe(58);
  });
  it("unsubscribes shared DEM changes on disposal and subscribes again on restart", () => {
    const view = setup([]);
    expect(engine.terrainSubscribe).toHaveBeenCalledOnce();
    expect(engine.terrainSubscribers.size).toBe(1);
    view.picker.dispose();
    expect(engine.terrainUnsubscribe).toHaveBeenCalledOnce();
    expect(engine.terrainSubscribers.size).toBe(0);
    view.picker.start();
    expect(engine.terrainSubscribe).toHaveBeenCalledTimes(2);
    expect(engine.terrainSubscribers.size).toBe(1);
    view.picker.dispose();
    expect(engine.terrainUnsubscribe).toHaveBeenCalledTimes(2);
    expect(engine.terrainSubscribers.size).toBe(0);
  });
});

it("skips marked dense DEM triangles while retaining detailed mesh receiver roots", () => {
  const view = setup([]);
  view.surface.userData.isShadowTerrainSurface = true;
  const terrainRaycast = vi.spyOn(view.surface, "raycast");
  engine.terrain.mockReturnValue(42);
  const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
  const terrain = view.picker.intersectSurface(ray, [7.2, 51.27])!;
  expect(terrain.surface).toBe("terrain");
  expect(terrain.point.y).toBe(42);
  expect(terrainRaycast).not.toHaveBeenCalled();
  expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
  const detailedRoot = new Group();
  const detailed = new Mesh(
    new PlaneGeometry(1000, 1000),
    new MeshBasicMaterial({ side: DoubleSide })
  );
  detailed.rotation.x = -Math.PI / 2;
  detailed.position.y = 66;
  detailedRoot.add(detailed);
  detailedRoot.updateMatrixWorld(true);
  disposals.push(() => {
    detailed.geometry.dispose();
    detailed.material.dispose();
  });
  const detailedRaycast = vi.spyOn(detailed, "raycast");
  engine.runtimes.push({
    id: "detailed-mesh",
    root: detailedRoot,
    receivesMapStyleTexture: true,
    mapStyleProjectionVersion: () => 1,
  });
  engine.terrain.mockClear();
  const mesh = view.picker.intersectSurface(ray, [7.2, 51.27])!;
  expect(mesh.surface).toBe("mesh");
  expect(mesh.point.y).toBeCloseTo(66, 9);
  expect(detailedRaycast).toHaveBeenCalledOnce();
  expect(terrainRaycast).not.toHaveBeenCalled();
  expect(engine.terrain).not.toHaveBeenCalled();
});

it("intersects a slanted shared DEM along the actual nonvertical camera ray", () => {
  const view = setup([]);
  vi.mocked(view.map.queryTerrainElevation).mockReturnValue(null);
  engine.terrain.mockImplementation((_map: unknown, longitude: number) => {
    const sceneX = (longitude - 7.2) * 100000;
    return 42 + 0.2 * (sceneX - 600);
  });
  const ray = new Raycaster(
    new Vector3(600, 120, 0),
    new Vector3(1, -1, 0).normalize()
  );
  const hit = view.picker.intersectSurface(ray, [7.206, 51.27])!;
  expect(hit.surface).toBe("terrain");
  expect(Math.abs(hit.point.x - 665)).toBeLessThan(0.05);
  expect(Math.abs(hit.point.y - 55)).toBeLessThan(0.05);
  expect(hit.point.z).toBe(0);
  expect(hit.point.toArray().every(Number.isFinite)).toBe(true);
  expect(ray.ray.distanceToPoint(hit.point)).toBeLessThan(1e-9);
  expect(hit.point.x + hit.point.y).toBeCloseTo(720, 9);
  expect(engine.terrain.mock.calls.length).toBeGreaterThan(2);
  expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
});

describe("calibrated NG screen-centre picking", () => {
  const pointer = (x: number, y = 400) => ({
    x: x as CssPixels,
    y: y as CssPixels,
  });

  it("picks the calibrated sensor midpoint in render pixels while Classic keeps the nearer physical axis", async () => {
    const near = record("near-axis", 0);
    const shifted = { ...record("offset-sensor", 20), cameraId: "offset" };
    const view = setup([near, shifted]);
    view.data.datasets.get("2026")!.cameras.offset = calibration(1, 700);
    const pointQuery = {
      ...query,
      point: [7.20002, 51.27] as [number, number],
      heightMeters: 10,
    };
    view.render();
    expect(
      await view.picker.pick([shifted, near], pointQuery, false, () => true)
    ).toBe(near);
    expect(imageProjectionMatrix).not.toHaveBeenCalled();
    for (const records of [
      [near, shifted],
      [shifted, near],
    ])
      expect(
        await view.picker.pick(
          records,
          pointQuery,
          false,
          () => true,
          pointer(510)
        )
      ).toBe(shifted);
    expect(imageProjectionMatrix).toHaveBeenCalled();
    expect(
      await view.picker.pick([shifted, near], pointQuery, false, () => true)
    ).toBe(near);
  });

  it("ignores live pointer height and checks the known calibrated photo plane", async () => {
    const photo = record("height-sensitive", 0);
    const view = setup([photo]);
    view.render();
    const pointQuery = {
      ...query,
      point: [7.2004, 51.27] as [number, number],
      heightMeters: 10,
    };
    expect(
      await view.picker.pick(
        [photo],
        pointQuery,
        false,
        () => true,
        pointer(700)
      )
    ).toBe(photo);
    expect(
      await view.picker.pick(
        [photo],
        { ...pointQuery, heightMeters: 80 },
        false,
        () => true,
        pointer(700)
      )
    ).toBe(photo);
    expect(
      await view.picker.pick(
        [photo],
        pointQuery,
        false,
        () => true,
        pointer(700)
      )
    ).toBe(photo);
  });

  it("uses a fixed reference-height approximation independent of pointer height", async () => {
    const near = record("near-axis", 0);
    const shifted = { ...record("offset-sensor", 20), cameraId: "offset" };
    const view = setup([near, shifted], true);
    vi.mocked(view.map.queryTerrainElevation).mockReturnValue(null);
    view.data.datasets.get("2026")!.cameras.offset = calibration(1, 700);
    view.render();
    const pointQuery = {
      ...query,
      point: [7.20002, 51.27] as [number, number],
    };
    expect(
      await view.picker.pick(
        [near, shifted],
        { ...pointQuery, heightMeters: 10 },
        false,
        () => true,
        pointer(510)
      )
    ).toBe(shifted);
    expect(
      await view.picker.pick(
        [near, shifted],
        { ...pointQuery, heightMeters: 80 },
        false,
        () => true,
        pointer(510)
      )
    ).toBe(shifted);
  });

  it("owns one render callback lease and clears stale clip state through dispose/restart", async () => {
    const photo = record("visible", 0);
    const view = setup([photo]);
    expect(view.addBeforeRenderCallback).toHaveBeenCalledOnce();
    expect(
      await view.picker.pick(
        [photo],
        { ...query, heightMeters: 10 },
        false,
        () => true,
        pointer(500)
      )
    ).toBeNull();
    view.render();
    expect(
      await view.picker.pick(
        [photo],
        { ...query, heightMeters: 10 },
        false,
        () => true,
        pointer(500)
      )
    ).toBe(photo);
    const releases = view.release.mock.calls.length;
    view.picker.dispose();
    expect(view.stopFrame).toHaveBeenCalledOnce();
    expect(view.release).toHaveBeenCalledTimes(releases + 1);
    view.picker.start();
    expect(view.addBeforeRenderCallback).toHaveBeenCalledTimes(2);
    expect(
      await view.picker.pick(
        [photo],
        { ...query, heightMeters: 10 },
        false,
        () => true,
        pointer(500)
      )
    ).toBeNull();
    view.render();
    expect(
      await view.picker.pick(
        [photo],
        { ...query, heightMeters: 10 },
        false,
        () => true,
        pointer(500)
      )
    ).toBe(photo);
  });

  it("yields after rejected candidates and respects cancellation before processing the remaining batch", async () => {
    const records = Array.from({ length: 17 }, (_, index) => ({
      ...record(String(index), 0),
      seriesId: "unavailable",
    }));
    const view = setup(records);
    let current = true;
    const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void
    ) => {
      current = false;
      queueMicrotask(callback);
      return 1;
    }) as typeof setTimeout);
    expect(
      await view.picker.pick(records, query, false, () => current, pointer(500))
    ).toBeUndefined();
    expect(timer).toHaveBeenCalled();
    expect(engine.altitude).not.toHaveBeenCalled();
  });
});

it("ranks stored catalogue centres without any live mesh or DEM reads", async () => {
  const photo = {
    ...record("stored-center", 0),
    catalogCenter: {
      longitude: 7.2,
      latitude: 51.27,
      heightMeters: 10 as Meters,
      ecefMeters: [1, 2, 3] as [number, number, number],
    },
  };
  const view = setup([photo]);
  view.render();
  const mesh = vi.spyOn(view.surface, "raycast");
  const forbidden = () => {
    throw new Error("Live depth forbidden");
  };
  engine.terrain.mockImplementation(forbidden);
  engine.terrainBatch.mockImplementation(forbidden);
  vi.mocked(view.map.queryTerrainElevation).mockImplementation(forbidden);
  expect(
    await view.picker.pick([photo], query, false, () => true, {
      x: 500 as CssPixels,
      y: 400 as CssPixels,
    })
  ).toBe(photo);
  expect(mesh).not.toHaveBeenCalled();
  expect(engine.terrain).not.toHaveBeenCalled();
  expect(engine.terrainBatch).not.toHaveBeenCalled();
  expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
});

it("uses physical 3D centres without a screen pointer and reports the winning distance without live depth", async () => {
  const photo = {
    ...record("physical", 0),
    catalogCenter: {
      longitude: 7.2,
      latitude: 51.27,
      heightMeters: 10 as Meters,
      ecefMeters: [7.2, 51.27, 20] as [number, number, number],
    },
  };
  const high = {
    ...photo,
    id: "higher",
    sourceId: "higher",
    catalogCenter: {
      ...photo.catalogCenter,
      ecefMeters: [7.2, 51.27, 1000] as [number, number, number],
    },
  };
  const view = setup([photo, high]);
  view.render();
  const debug = vi.fn();
  view.picker.subscribe(debug);
  const forbidden = () => {
    throw Error("Live depth forbidden");
  };
  const mesh = vi.spyOn(view.surface, "raycast").mockImplementation(forbidden);
  engine.terrain.mockImplementation(forbidden);
  engine.terrainBatch.mockImplementation(forbidden);
  vi.mocked(view.map.queryTerrainElevation).mockImplementation(forbidden);
  expect(
    await view.picker.pick(
      [high, photo],
      { ...query, heightMeters: 10 },
      false,
      () => true
    )
  ).toBe(photo);
  expect(debug.mock.lastCall![0]).toMatchObject({
    surface: "catalog",
    distance: 10,
  });
  expect(mesh).not.toHaveBeenCalled();
  expect(engine.terrain).not.toHaveBeenCalled();
  expect(engine.terrainBatch).not.toHaveBeenCalled();
  expect(view.map.queryTerrainElevation).not.toHaveBeenCalled();
  view.picker.dispose();
});
