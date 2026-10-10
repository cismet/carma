import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { PerspectiveCamera, Vector2, Vector3, type Object3D } from "three";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createQueryCursorThree } from "./query-cursor-three";

vi.hoisted(() => {
  // MapLibre's module registers its worker blob even when the map is mocked.
  URL.createObjectURL ??= () => "blob:oblique-test-worker";
  URL.revokeObjectURL ??= () => {};
});

const scene = vi.hoisted(() => ({
  addRuntime: vi.fn(),
  removeRuntime: vi.fn(),
  release: vi.fn(),
  projectLngLatToScene: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => ({ layer: scene, release: scene.release }),
}));

const ORIGIN: [number, number] = [7, 51];
/** Local metres: x east, y up, z south (the shared scene's axes). */
const METRES_PER_DEGREE = { lng: 70_000, lat: 111_000 };
const at = (east: number, north: number, height: number) =>
  MercatorCoordinate.fromLngLat(
    [
      ORIGIN[0] + east / METRES_PER_DEGREE.lng,
      ORIGIN[1] + north / METRES_PER_DEGREE.lat,
    ],
    height
  );

const frameFrom = (cameraPosition: Vector3): SharedThreeSceneFrame => {
  const camera = new PerspectiveCamera(50, 1200 / 800, 0.1, 100_000);
  camera.position.copy(cameraPosition);
  camera.lookAt(new Vector3());
  camera.updateMatrixWorld(true);
  return {
    renderCamera: camera,
    cssViewport: new Vector2(1200, 800),
    viewport: new Vector2(2400, 1600),
  } as unknown as SharedThreeSceneFrame;
};

const setup = () => {
  const map = {
    getCenter: () => ({ lng: ORIGIN[0], lat: ORIGIN[1] }),
    getCanvas: () => ({ clientWidth: 1200, clientHeight: 800 }),
    triggerRepaint: vi.fn(),
  } as unknown as MaplibreMap;
  const cursor = createQueryCursorThree(map);
  const runtime = scene.addRuntime.mock.calls[0]![0] as SharedThreeSceneRuntime;
  const ringGroup = runtime.root.children[0] as Object3D;
  return { map, cursor, runtime, ringGroup };
};

beforeEach(() => {
  vi.clearAllMocks();
  scene.projectLngLatToScene.mockImplementation(
    ([lng, lat]: [number, number], height: number) =>
      new Vector3(
        (lng - ORIGIN[0]) * METRES_PER_DEGREE.lng,
        height,
        -(lat - ORIGIN[1]) * METRES_PER_DEGREE.lat
      )
  );
});

describe("createQueryCursorThree", () => {
  it("joins the shared scene as a non-pickable runtime", () => {
    const { runtime } = setup();
    expect(runtime.providesTerrain).toBe(false);
    expect(runtime.receivesMapStyleTexture).toBe(false);
    expect(runtime.root.visible).toBe(true);
  });

  it("shows the ring at the sampled surface point and hides it again", () => {
    const { map, cursor, runtime, ringGroup } = setup();
    runtime.update(frameFrom(new Vector3(0, 150, 150)));
    expect(cursor.isVisible()).toBe(false);

    cursor.setSample({ center: at(3, -4, 0) });
    expect(map.triggerRepaint).toHaveBeenCalled();
    runtime.update(frameFrom(new Vector3(0, 150, 150)));
    expect(cursor.isVisible()).toBe(true);
    const position = new Vector3().setFromMatrixPosition(ringGroup.matrix);
    expect(position.x).toBeCloseTo(3, 6);
    expect(position.y).toBeCloseTo(0, 6);
    expect(position.z).toBeCloseTo(4, 6);

    cursor.setSample(null);
    expect(cursor.isVisible()).toBe(false);
    // Only the cursor group toggles; picker caches key on the runtime root.
    expect(runtime.root.visible).toBe(true);
    runtime.update(frameFrom(new Vector3(0, 150, 150)));
    expect(cursor.isVisible()).toBe(false);
  });

  it("orients the ring by the neighbour picks and keeps it screen-sized", () => {
    const { cursor, runtime, ringGroup } = setup();
    // A roof rising toward the east: right is higher, left lower.
    cursor.setSample({
      center: at(0, 0, 10),
      neighbours: {
        right: at(1, 0, 11),
        left: at(-1, 0, 9),
        up: at(0, 1, 10),
        down: at(0, -1, 10),
      },
    });
    runtime.update(frameFrom(new Vector3(0, 150, 150)));
    const x = new Vector3();
    const y = new Vector3();
    const z = new Vector3();
    ringGroup.matrix.extractBasis(x, y, z);
    const normal = z.clone().normalize();
    expect(normal.x).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(normal.y).toBeCloseTo(Math.SQRT1_2, 6);
    const nearRadius = x.length();

    runtime.update(frameFrom(new Vector3(0, 300, 300)));
    ringGroup.matrix.extractBasis(x, y, z);
    expect(x.length() / nearRadius).toBeGreaterThan(1.9);
  });

  it("falls back to local up without neighbour picks and hides behind the camera", () => {
    const { cursor, runtime, ringGroup } = setup();
    cursor.setSample({ center: at(0, 0, 0) });
    runtime.update(frameFrom(new Vector3(0, 150, 150)));
    const z = new Vector3();
    ringGroup.matrix.extractBasis(new Vector3(), new Vector3(), z);
    expect(z.normalize().y).toBeCloseTo(1, 9);

    cursor.setSample({ center: at(0, -500, 0) });
    runtime.update(frameFrom(new Vector3(0, 150, 150)));
    expect(cursor.isVisible()).toBe(false);
  });

  it("leaves the shared scene on dispose and ignores later samples", () => {
    const { map, cursor, runtime } = setup();
    cursor.dispose();
    expect(scene.removeRuntime).toHaveBeenCalledWith(runtime.id);
    expect(scene.release).toHaveBeenCalledTimes(1);
    vi.mocked(map.triggerRepaint).mockClear();
    cursor.setSample({ center: at(0, 0, 0) });
    cursor.dispose();
    expect(map.triggerRepaint).not.toHaveBeenCalled();
    expect(scene.release).toHaveBeenCalledTimes(1);
  });
});
