import { Matrix4, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import type {
  AnnotationEngine,
  AnnotationGeographicCoordinate,
  AnnotationSceneLineOptions,
} from "@carma-mapping/annotations/core";
import { annotationVisualStyles } from "../config/annotation-visual-defaults";
import { createPathAuthoringController } from "./create-path-authoring-controller";
import { createPointQueryIndicatorController } from "./create-point-query-indicator-controller";
const a = { longitude: 0, latitude: 0, altitude: 0 },
  b = { longitude: 0.00001, latitude: 0.00002, altitude: 30 };
const resources = new Set<() => void>();
const harness = (inScene = true) => {
  const container = document.createElement("div"),
    canvas = document.createElement("canvas");
  container.dataset.annotationLabelOverlayRoot = "true";
  container.append(canvas);
  document.body.append(container);
  Object.defineProperties(canvas, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  const origin = ecefFromGeographicCoordinate(a),
    listeners = new Set<() => void>(),
    pre = new Set<() => void>();
  const lines = new Map<
    string,
    {
      options: AnnotationSceneLineOptions;
      positions: Vector3[];
      visible: boolean;
      destroyed: boolean;
    }
  >();
  const primitives: Matrix4[] = [];
  const state = { project: true };
  const project = (p: Vector3) =>
    state.project ? { x: 200 + p.y * 12.8, y: 100 - p.z * 12.8 } : null;
  const engine = {
    kind: inScene ? "maplibre" : "cesium",
    capabilities: { pointQueryDiscInScene: inScene },
    canvas,
    isDestroyed: () => false,
    getOverlayContainer: () => container,
    worldToScreen: project,
    getScreenPixelsPerMeterAt: () => 12.8,
    getViewportCenterGroundPosition: () => origin.clone(),
    getCameraPose: () => ({ directionECEF: new Vector3(1, 0, 0) }),
    getPickRay: ({ x, y }: { x: number; y: number }) => ({
      origin: new Vector3(origin.x - 1000, (x - 200) / 12.8, (100 - y) / 12.8),
      direction: new Vector3(1, 0, 0),
    }),
    subscribeCameraMove: () => () => {},
    requestRender: vi.fn(),
    pointer: { register: () => () => {}, getScreenPosition: () => null },
    subscribePreRender: (callback: () => void) => {
      pre.add(callback);
      return () => pre.delete(callback);
    },
    subscribePostRender: (callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    createRing: () => {
      const matrix = new Matrix4();
      primitives.push(matrix);
      return {
        setModelMatrix: (next: Matrix4) => matrix.copy(next),
        setVisible: () => {},
        destroy: () => {},
      };
    },
    createLineCollection: () => {
      const owned: typeof lines extends Map<string, infer T> ? T[] : never = [];
      return {
        addLine: (options: AnnotationSceneLineOptions) => {
          const record = {
            options,
            positions: [] as Vector3[],
            visible: false,
            destroyed: false,
          };
          owned.push(record);
          lines.set(options.id, record);
          return {
            setPositions: (positions: readonly Vector3[]) => {
              record.positions = positions.map((p) => p.clone());
            },
            setVisible: (visible: boolean) => {
              record.visible = visible;
            },
            setStyle: (style: Partial<AnnotationSceneLineOptions>) => {
              record.options = { ...record.options, ...style };
            },
            destroy: () => {
              record.destroyed = true;
            },
          };
        },
        destroy: () => {
          owned.forEach((record) => (record.destroyed = true));
        },
      };
    },
  } as unknown as AnnotationEngine;
  const path = createPathAuthoringController(engine, {
    overlayLayerId: "path",
    lineId: "path-line",
    lineColor: "white",
  });
  resources.add(() => path.destroy());
  const sampler = () => {
    const controller = createPointQueryIndicatorController(engine, {
      radius: 3,
      showNormalLine: true,
      tangentDiscVisualizerTrailSampleCount: 1,
    });
    resources.add(() => controller.destroy());
    controller.setEnabled(true);
    return controller;
  };
  const visibleMarkers = () =>
    [...container.querySelectorAll<HTMLDivElement>("#path > div")].filter(
      (marker) => marker.style.display !== "none"
    );
  return {
    engine,
    state,
    container,
    path,
    sampler,
    visibleMarkers,
    project,
    lines,
    primitives,
    frame: () => {
      pre.forEach((callback) => callback());
      listeners.forEach((callback) => callback());
    },
  };
};
beforeEach(() =>
  vi.useFakeTimers({
    toFake: ["performance", "setTimeout", "clearTimeout", "Date"],
  })
);
afterEach(() => {
  for (const destroy of resources) destroy();
  resources.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
});
describe("one shared Three hover circle and retained path drafts", () => {
  it("draws exactly one shared sampler circle and keeps other draft nodes", () => {
    const h = harness(),
      sampler = h.sampler(),
      point = ecefFromGeographicCoordinate(b),
      normal = new Vector3(1, 0, 0);
    const source = {
      lineCoordinates: [a, b],
      markerCoordinates: [a, b],
      hoverCoordinate: b,
    };
    h.path.setState(source);
    sampler.setPreview({ pointECEF: point, surfaceNormalECEF: normal });
    expect(h.visibleMarkers()).toHaveLength(1);
    expect(h.visibleMarkers()[0]!.style.width).toBe("10px");
    expect(h.visibleMarkers()[0]!.style.borderWidth).toBe("1px");
    expect(h.visibleMarkers()[0]!.style.transform).toBe(
      "translate(200px, 100px) translate(-50%, -50%)"
    );
    const active = [...h.lines.values()].filter(
      (line) => line.visible && line.options.id.endsWith("center-circle")
    );
    expect(active).toHaveLength(1);
    const circle = active[0]!;
    expect(circle.options.width).toBe(
      annotationVisualStyles.point.outlineWidth
    );
    expect(circle.options.color).toBe(annotationVisualStyles.point.outline);
    expect(circle.options.color).toMatch(/0\.92/);
    const screen = h.project(point)!;
    for (const position of circle.positions) {
      const p = h.project(position)!;
      expect(
        Math.hypot(p.x - screen.x, p.y - screen.y) + circle.options.width / 2
      ).toBeCloseTo(5, 8);
    }
    expect(source.markerCoordinates).toEqual([a, b]);
    expect(source.hoverCoordinate).toBe(b);
  });
  it("keeps only the travelling circle while snapping; the true hover anchor is not interpolated", () => {
    const h = harness(),
      sampler = h.sampler(),
      initial = ecefFromGeographicCoordinate(a),
      target = ecefFromGeographicCoordinate(b),
      normal = new Vector3(1, 0, 0);
    sampler.setPreview({ pointECEF: initial, surfaceNormalECEF: normal });
    h.path.setState({
      lineCoordinates: [],
      markerCoordinates: [b],
      hoverCoordinate: b,
    });
    const pick = {
      pointECEF: target,
      surfaceNormalECEF: normal,
      lockToPreviewPoint: true,
    };
    sampler.setPreview(pick);
    expect(h.visibleMarkers()).toHaveLength(0);
    vi.advanceTimersByTime(150);
    h.frame();
    expect(
      new Vector3()
        .setFromMatrixPosition(h.primitives.at(-1)!)
        .distanceTo(initial.clone().lerp(target, 0.5))
    ).toBeLessThan(1e-8);
    expect(
      [...h.lines.values()].filter(
        (line) => line.visible && line.options.id.endsWith("center-circle")
      )
    ).toHaveLength(1);
    expect(pick.pointECEF).toBe(target);
    expect(target.equals(ecefFromGeographicCoordinate(b))).toBe(true);
    vi.advanceTimersByTime(150);
    h.frame();
    expect(
      new Vector3()
        .setFromMatrixPosition(h.primitives.at(-1)!)
        .distanceTo(target)
    ).toBeLessThan(1e-8);
  });
  it("suppresses a projected plane-roundtrip duplicate within one CSS pixel while keeping a separate draft", () => {
    const h = harness(),
      roundTrip = { ...b, altitude: 10 },
      near = { ...b, longitude: b.longitude + 1e-7 },
      separate = { ...b, longitude: b.longitude + 1e-6 };
    expect(
      ecefFromGeographicCoordinate(roundTrip).distanceTo(
        ecefFromGeographicCoordinate(b)
      )
    ).toBeGreaterThan(10);
    h.path.setState({
      lineCoordinates: [],
      markerCoordinates: [roundTrip, near, separate],
      hoverCoordinate: b,
    });
    expect(h.visibleMarkers()).toHaveLength(1);
    const screen = h.project(ecefFromGeographicCoordinate(separate))!;
    expect(h.visibleMarkers()[0]!.style.transform).toBe(
      "translate(" +
        Math.round(screen.x) +
        "px, " +
        Math.round(screen.y) +
        "px) translate(-50%, -50%)"
    );
  });
  it("includes hover metadata in cache equality and restores draft markers when hover clears", () => {
    const h = harness(),
      coordinates = [a, b];
    h.path.setState({ lineCoordinates: [], markerCoordinates: coordinates });
    expect(h.visibleMarkers()).toHaveLength(2);
    h.path.setState({
      lineCoordinates: [],
      markerCoordinates: coordinates,
      hoverCoordinate: b,
    });
    expect(h.visibleMarkers()).toHaveLength(1);
    h.path.setState({
      lineCoordinates: [],
      markerCoordinates: coordinates,
      hoverCoordinate: null,
    });
    expect(h.visibleMarkers()).toHaveLength(2);
    expect(coordinates).toEqual([a, b]);
  });
  it("keeps legacy marker lists and style even when callers provide hover metadata", () => {
    const h = harness(false);
    h.path.setState({
      lineCoordinates: [],
      markerCoordinates: [a, b],
      hoverCoordinate: b,
    });
    expect(h.visibleMarkers()).toHaveLength(2);
    for (const marker of h.visibleMarkers()) {
      expect(marker.style.width).toBe("10px");
      expect(marker.style.borderWidth).toBe("1px");
    }
    expect([...h.lines.keys()]).toEqual(["path-line"]);
  });
  it("falls back to coordinate equality without removing distinct drafts when projection is unavailable", () => {
    const h = harness();
    h.state.project = false;
    h.path.setState({
      lineCoordinates: [],
      markerCoordinates: [a, b],
      hoverCoordinate: b,
    });
    expect(h.visibleMarkers()).toHaveLength(0);
    h.state.project = true;
    h.frame();
    expect(h.visibleMarkers()).toHaveLength(1);
  });
  it("clears and destroys all draft marker resources without touching input coordinates", () => {
    const h = harness(),
      coordinates: AnnotationGeographicCoordinate[] = [a, b];
    h.path.setState({
      lineCoordinates: coordinates,
      markerCoordinates: coordinates,
      hoverCoordinate: b,
    });
    h.path.clear();
    expect(h.visibleMarkers()).toHaveLength(0);
    h.path.destroy();
    expect(h.container.querySelector("#path")).toBeNull();
    expect(coordinates).toEqual([a, b]);
  });
});
