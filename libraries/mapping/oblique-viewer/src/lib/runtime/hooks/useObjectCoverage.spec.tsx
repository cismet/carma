import { act, renderHook, waitFor } from "@testing-library/react";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Mesh, MeshBasicMaterial, Vector3 } from "three";
import type { SharedThreeSceneRuntime } from "@carma-mapping/engines/maplibre";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CardinalDirection,
  ObliqueDataset,
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import type { ObjectCoverageSphere } from "../../core/utils/object-coverage";
import {
  computeObjectCoverageGroups,
  objectCoverageRadiusMeters,
  objectCoverageSphereMatrix,
  useObjectCoverage,
} from "./useObjectCoverage";

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
  getLocalFrame: vi.fn(),
  projectSceneToLngLat: vi.fn(),
  setMapStyleProjectiveOverlay: vi.fn(),
}));
const coverage = vi.hoisted(() => ({ group: vi.fn(), altitude: vi.fn() }));
vi.mock("@carma-mapping/engines/maplibre", async () => ({
  ...(await import("../../../../../engines/maplibre/src/utils/clickClaims")),
  acquireSharedThreeScene: () => ({
    layer: scene,
    release: scene.release,
  }),
}));
vi.mock("../../core/utils/orientation", () => ({
  CARDINALS_CLOCKWISE: [0, 1, 2, 3],
}));
vi.mock("../../core/utils/object-coverage", () => ({
  groupObjectCoverageImages: coverage.group,
}));
vi.mock("../utils/flyToImage", () => ({
  resolveCameraAltitude: coverage.altitude,
}));

const sphere: ObjectCoverageSphere = {
  center: { longitude: 7, latitude: 51, heightMeters: 100 },
  radiusMeters: 10,
};
const dataOf = (count: number): ObliqueSelectionData => ({
  datasets: new Map([
    [
      "2024",
      { heightDatum: "ellipsoidal", allowUnverifiedSourceHeight: false },
    ],
  ]) as unknown as Map<string, ObliqueDataset>,
  imageRecords: new Map(
    Array.from({ length: count }, (_, index) => [
      String(index),
      { id: String(index), seriesId: "2024", z: 300 + index },
    ])
  ) as unknown as Map<string, ObliqueImageRecord>,
  centers: new Map(),
});

beforeEach(() => {
  vi.clearAllMocks();
  scene.projectLngLatToScene.mockImplementation(
    ([longitude, latitude]: [number, number], height: number) =>
      new Vector3(longitude, height, latitude)
  );
  scene.getLocalFrame.mockReturnValue({
    sceneFromLocal: new Matrix4(),
    revision: 1,
  });
  scene.projectSceneToLngLat.mockReturnValue([7, 51]);
  scene.removeRuntime.mockImplementation((id: string) => {
    const runtime = scene.addRuntime.mock.calls
      .map(([runtime]) => runtime as SharedThreeSceneRuntime)
      .find((runtime) => runtime.id === id);
    runtime?.dispose();
  });
  coverage.altitude.mockResolvedValue(300);
  coverage.group.mockImplementation(
    (
      data: ObliqueSelectionData,
      _sphere: ObjectCoverageSphere,
      altitudes: ReadonlyMap<string, number>,
      records: Iterable<ObliqueImageRecord>
    ) =>
      new Map([
        [
          0 as CardinalDirection,
          [...records]
            .filter((record) => altitudes.has(record.id))
            .map((record) => ({
              record,
              dataset: data.datasets.get(record.seriesId),
              crop: { x: 1, y: 2, width: 3, height: 4 },
              pixelsPerMeter: Number(record.id) + 1,
            })),
        ],
      ])
  );
});

describe("physical coverage sphere", () => {
  it("projects every physical axis independently through the scene affine", () => {
    const anchor = MercatorCoordinate.fromLngLat(
      [sphere.center.longitude, sphere.center.latitude],
      sphere.center.heightMeters
    );
    const meter = anchor.meterInMercatorCoordinateUnits();
    const project = (lngLat: [number, number], height: number) => {
      const coordinate = MercatorCoordinate.fromLngLat(lngLat, height);
      return new Vector3(
        (7 * (coordinate.x - anchor.x)) / meter + height / 4,
        height * 3,
        (2 * (coordinate.y - anchor.y)) / meter
      );
    };
    const matrix = objectCoverageSphereMatrix(sphere, project)!;
    const center = new Vector3().applyMatrix4(matrix);
    const east = new Vector3(1, 0, 0).applyMatrix4(matrix).sub(center);
    const up = new Vector3(0, 1, 0).applyMatrix4(matrix).sub(center);
    const south = new Vector3(0, 0, 1).applyMatrix4(matrix).sub(center);
    expect(east.x).toBeCloseTo(70, 5);
    expect(up.toArray()).toEqual([2.5, 30, 0]);
    expect(south.z).toBeCloseTo(20, 5);
    expect(objectCoverageSphereMatrix(sphere, () => null)).toBeNull();
  });

  it("includes vertical metres when deriving the picked radius", () => {
    const anchor = MercatorCoordinate.fromLngLat([7, 51], 100);
    const meter = anchor.meterInMercatorCoordinateUnits();
    const edge = new MercatorCoordinate(
      anchor.x + 3 * meter,
      anchor.y,
      MercatorCoordinate.fromLngLat([7, 51], 104).z
    );
    expect(objectCoverageRadiusMeters(sphere.center, edge)).toBeCloseTo(5, 5);
  });
});

describe("bounded catalog coverage", () => {
  it("resolves the source datum in bounded batches and ranks the merged catalog", async () => {
    let inFlight = 0;
    let maximumInFlight = 0;
    const resolveAltitude = vi.fn(async (record: ObliqueImageRecord) => {
      inFlight++;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return record.z;
    });
    const yieldBatch = vi.fn(async () => {});
    const result = await computeObjectCoverageGroups(
      dataOf(130),
      sphere,
      12,
      new AbortController().signal,
      resolveAltitude,
      yieldBatch
    );
    expect(maximumInFlight).toBe(64);
    expect(resolveAltitude).toHaveBeenCalledTimes(130);
    expect(resolveAltitude).toHaveBeenCalledWith(
      expect.anything(),
      "ellipsoidal",
      12,
      false
    );
    expect(yieldBatch).toHaveBeenCalledTimes(3);
    expect(result.groups.get(0)).toHaveLength(130);
    expect(result.groups.get(0)?.[0].record.id).toBe("129");
    expect(result.error).toBeNull();
  });

  it("stops before the next batch when cancellation arrives during a yield", async () => {
    const controller = new AbortController();
    const resolveAltitude = vi.fn(async () => 300);
    await expect(
      computeObjectCoverageGroups(
        dataOf(200),
        sphere,
        0,
        controller.signal,
        resolveAltitude,
        async () => controller.abort()
      )
    ).rejects.toThrow();
    expect(resolveAltitude).toHaveBeenCalledTimes(64);
    expect(coverage.group).toHaveBeenCalledTimes(1);
  });

  it("excludes unresolved camera heights and reports the datum failure", async () => {
    const result = await computeObjectCoverageGroups(
      dataOf(2),
      sphere,
      0,
      new AbortController().signal,
      async (record) => {
        if (record.id === "0") throw new Error("unknown height datum");
        return 300;
      },
      async () => {}
    );
    expect(result.groups.get(0)?.map((image) => image.record.id)).toEqual([
      "1",
    ]);
    expect(result.error).toBe("unknown height datum");
  });
});

const setup = () => {
  const container = document.createElement("div");
  const canvas = document.createElement("canvas");
  const button = document.createElement("button");
  container.append(canvas, button);
  document.body.append(container);
  canvas.style.cursor = "grab";
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0 } as DOMRect);
  const map = {
    getContainer: () => container,
    getCanvas: () => canvas,
    getCenter: () => ({ lng: 7, lat: 51 }),
    triggerRepaint: vi.fn(),
  } as unknown as MaplibreMap;
  const anchor = MercatorCoordinate.fromLngLat([7, 51], 100);
  const meter = anchor.meterInMercatorCoordinateUnits();
  const readViewAnchor = vi.fn(
    ({ x, y }: { x: number; y: number }) =>
      new MercatorCoordinate(
        anchor.x + x * meter,
        anchor.y + y * meter,
        anchor.z
      )
  );
  const hostPick = vi.fn();
  canvas.addEventListener("click", hostPick);
  const onCancel = vi.fn();
  const props = {
    map,
    enabled: true,
    suspended: false,
    data: null as ObliqueSelectionData | null,
    resetToken: "2024",
    heightOffset: 0,
    readViewAnchor,
    onCancel,
  };
  const view = renderHook(useObjectCoverage, { initialProps: props });
  const click = (x: number, target: HTMLElement = canvas) => {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: 0,
    });
    act(() => target.dispatchEvent(event));
    return event;
  };
  return {
    ...view,
    props,
    canvas,
    button,
    container,
    click,
    hostPick,
    onCancel,
  };
};

describe("object coverage picking lifecycle", () => {
  it("shows the draft in the shared runtime and disposes its lease on mode exit", async () => {
    const view = setup();
    view.click(0);
    act(() => {
      view.canvas.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 20,
          clientY: 0,
        })
      );
    });
    await waitFor(() =>
      expect(view.props.readViewAnchor).toHaveBeenCalledTimes(2)
    );
    const runtime = scene.addRuntime.mock
      .calls[0][0] as SharedThreeSceneRuntime;
    runtime.update({} as Parameters<SharedThreeSceneRuntime["update"]>[0]);
    expect(runtime.root.visible).toBe(true);
    expect(view.result.current.sphere).toBeNull();
    expect(scene.projectLngLatToScene).toHaveBeenCalledTimes(4);
    const mesh = runtime.root.children[0] as Mesh;
    const material = mesh.material as MeshBasicMaterial;
    expect(material.opacity).toBe(0.3);
    expect(material.transparent).toBe(true);
    expect(material.wireframe).toBe(false);
    expect(material.depthWrite).toBe(false);
    const [overlayId, overlay] =
      scene.setMapStyleProjectiveOverlay.mock.lastCall!;
    expect(overlay.marks).toHaveLength(1);
    expect(overlay.marks[0]).toMatchObject({
      shape: "sphere",
      width: 2,
      opacity: 1,
      showUpMarker: false,
    });
    expect(overlay.marks[0].color.getHexString()).toBe("ffffff");
    const center = new Vector3().setFromMatrixPosition(runtime.root.matrix);
    expect(
      center.clone().applyMatrix4(overlay.marks[0].sceneToImageTerrain).length()
    ).toBeCloseTo(0, 7);
    const edge = new Vector3(1, 0, 0).applyMatrix4(runtime.root.matrix);
    expect(
      edge.applyMatrix4(overlay.marks[0].sceneToImageTerrain).length()
    ).toBeCloseTo(1, 7);
    runtime.update({} as Parameters<SharedThreeSceneRuntime["update"]>[0]);
    expect(scene.setMapStyleProjectiveOverlay).toHaveBeenCalledOnce();
    scene.getLocalFrame.mockReturnValue({
      sceneFromLocal: new Matrix4().makeScale(2, 3, 4),
      revision: 2,
    });
    runtime.update({} as Parameters<SharedThreeSceneRuntime["update"]>[0]);
    expect(scene.setMapStyleProjectiveOverlay).toHaveBeenCalledTimes(2);
    expect(
      scene.setMapStyleProjectiveOverlay.mock.lastCall![1].marks[0].sceneToImage
        .elements
    ).not.toEqual(overlay.marks[0].sceneToImage.elements);
    const geometry = mesh.geometry;
    const dispose = vi.spyOn(geometry, "dispose");
    view.rerender({ ...view.props, enabled: false });
    expect(dispose).toHaveBeenCalledOnce();
    expect(scene.setMapStyleProjectiveOverlay).toHaveBeenLastCalledWith(
      overlayId,
      null
    );
    expect(scene.release).toHaveBeenCalledOnce();
    view.unmount();
    view.container.remove();
  });

  it("claims only canvas clicks, discards zero radius and finishes the second pick", () => {
    const view = setup();
    view.click(10, view.button);
    expect(view.props.readViewAnchor).not.toHaveBeenCalled();
    const first = view.click(0);
    expect(first.defaultPrevented).toBe(true);
    expect(view.hostPick).not.toHaveBeenCalled();
    expect(view.result.current.center?.heightMeters).toBeCloseTo(100);
    view.click(0);
    expect(view.result.current.sphere).toBeNull();
    view.click(10);
    expect(view.result.current.sphere?.radiusMeters).toBeCloseTo(10, 5);
    view.unmount();
    expect(scene.removeRuntime).toHaveBeenCalledTimes(1);
    expect(scene.release).toHaveBeenCalledTimes(1);
    expect(view.canvas.style.cursor).toBe("grab");
    view.container.remove();
  });

  it("resets the sphere and results on series toggles and Escape", async () => {
    const view = setup();
    view.click(0);
    view.click(10);
    view.rerender({ ...view.props, resetToken: "2024,2022" });
    expect(view.result.current.center).toBeNull();
    expect(view.result.current.sphere).toBeNull();
    view.click(0);
    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    );
    expect(view.onCancel).toHaveBeenCalledOnce();
    await waitFor(() => expect(view.result.current.center).toBeNull());
    view.unmount();
    view.container.remove();
  });

  it("does not publish old catalog results after data changes during height resolution", async () => {
    const view = setup();
    let resolveHeight!: (height: number) => void;
    const pendingHeight = new Promise<number>((resolve) => {
      resolveHeight = resolve;
    });
    coverage.altitude.mockReturnValue(pendingHeight);
    const originalData = dataOf(2);
    view.rerender({ ...view.props, data: originalData });
    view.click(0);
    view.click(10);
    expect(view.result.current.loading).toBe(true);
    expect(coverage.altitude).toHaveBeenCalledTimes(2);
    view.rerender({ ...view.props, data: dataOf(3) });
    expect(view.result.current.sphere).toBeNull();
    await act(async () => {
      resolveHeight(300);
      await pendingHeight;
    });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.groups.get(0)).toEqual([]);
    expect(coverage.group).not.toHaveBeenCalled();
    view.unmount();
    view.container.remove();
  });
});
