import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { snapshotTileCameraViews } from "../../core/tile-camera-demand";
import {
  projectTileDiagnosticViewport,
  projectTileDiagnosticViewports,
} from "./tile-diagnostic-viewport";

describe("live overview viewport", () => {
  it("draws plane intersections of each tile without bridging empty space between tiles", () => {
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 1, 20);
    camera.position.set(5, 10, 5);
    camera.up.set(0, 0, -1);
    camera.lookAt(5, 0, 5);
    const view = projectTileDiagnosticViewport(
      {
        bounds: [0, -1, 0, 10, 1, 10],
        tileBounds: [0, -1, 0, 4, 1, 10, 6, -1, 0, 10, 1, 10],
        worldToOverview: new THREE.Matrix4().toArray(),
        screen: [1, 0, 0],
        width: 20,
        height: 20,
      },
      snapshotTileCameraViews([
        {
          id: "sun",
          camera,
          viewport: [20, 20],
          errorTargetPixels: 1,
          role: "geometry",
        },
      ])[0]
    );
    expect(view.outline.length).toBeGreaterThan(0);
    expect(view.edges.length).toBeGreaterThan(view.outline.length);
    const endpoints: number[] = [];
    for (let i = 0; i < view.edges.length; i += 4) {
      const [x1, z1, x2, z2] = view.edges.slice(i, i + 4);
      endpoints.push(x1, x2);
      for (const coordinate of [x1, z1, x2, z2]) {
        expect(coordinate).toBeGreaterThanOrEqual(3 - 1e-5);
        expect(coordinate).toBeLessThanOrEqual(7 + 1e-5);
      }
      const midpoint = (x1 + x2) / 2;
      expect(midpoint <= 4 + 1e-5 || midpoint >= 6 - 1e-5).toBe(true);
    }
    expect(endpoints.some((x) => Math.abs(x - 4) < 1e-5)).toBe(true);
    expect(endpoints.some((x) => Math.abs(x - 6) < 1e-5)).toBe(true);
    expect(view.forward).toBeNull();
  });

  it("keeps only tile-plane cuts in a perspective map-aligned overview", () => {
    const light = new THREE.OrthographicCamera(-2, 2, 2, -2, 1, 20);
    light.position.set(5, 10, 5);
    light.up.set(0, 0, -1);
    light.lookAt(5, 0, 5);
    const observer = new THREE.PerspectiveCamera(60, 1, 1, 100);
    observer.position.set(5, 15, 20);
    observer.lookAt(5, 0, 5);
    observer.updateMatrixWorld();
    const worldToOverview = new THREE.Matrix4()
      .set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1)
      .multiply(observer.projectionMatrix)
      .multiply(observer.matrixWorldInverse);
    const view = projectTileDiagnosticViewport(
      {
        bounds: [0, -1, 0, 10, 1, 10],
        tileBounds: [0, -1, 0, 4, 1, 10, 6, -1, 0, 10, 1, 10],
        worldToOverview: worldToOverview.toArray(),
        screen: [100, 100, 100, -100],
        width: 200,
        height: 200,
      },
      snapshotTileCameraViews([
        {
          id: "sun",
          camera: light,
          viewport: [200, 200],
          errorTargetPixels: 1,
          role: "geometry",
        },
      ])[0]
    );
    expect(view.nearCenter).toBeUndefined();
    expect(view.edges.length).toBeGreaterThan(0);
    expect(Array.from(view.edges).every(Number.isFinite)).toBe(true);
  });

  it.each([THREE.WebGLCoordinateSystem, THREE.WebGPUCoordinateSystem])(
    "projects the asymmetric light near centre without drawing an empty tile set (%s)",
    (coordinateSystem) => {
      for (const reversedDepth of [false, true]) {
        const camera = new THREE.OrthographicCamera(-2, 4, 3, -1, 2, 12);
        camera.coordinateSystem = coordinateSystem;
        Object.defineProperty(camera, "reversedDepth", {
          value: reversedDepth,
        });
        camera.position.set(10, 20, 30);
        camera.lookAt(10, 10, 20);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        const view = projectTileDiagnosticViewport(
          {
            bounds: [-100, -100, -100, 100, 100, 100],
            tileBounds: [],
            worldToOverview: new THREE.Matrix4().toArray(),
            screen: [1, 0, 0],
            width: 200,
            height: 200,
          },
          snapshotTileCameraViews([
            {
              id: "sun",
              camera,
              viewport: [200, 200],
              errorTargetPixels: 1,
              role: "geometry",
            },
          ])[0]
        );
        const expected = new THREE.Vector3(1, 1, -2).applyMatrix4(
          camera.matrixWorld
        );
        expect(view.nearCenter![0]).toBeCloseTo(expected.x);
        expect(view.nearCenter![1]).toBeCloseTo(expected.z);
        expect(view.edges).toHaveLength(0);
      }
    }
  );

  it("preserves adjacent box cuts at ECEF magnitudes without Float32 gaps", () => {
    const project = (offset: number) => {
      const camera = new THREE.PerspectiveCamera(55, 1, 1, 100);
      camera.position.set(offset + 0.123, 20, offset + 10.321);
      camera.lookAt(offset, 0, offset);
      const snapshot = snapshotTileCameraViews([
        {
          id: "test",
          camera,
          viewport: [500, 500],
          errorTargetPixels: 4,
          role: "receiver",
        },
      ])[0];
      return [-10, 0].map(
        (x) =>
          projectTileDiagnosticViewport(
            {
              bounds: [
                offset + x,
                -2,
                offset - 10,
                offset + x + 10,
                2,
                offset + 10,
              ],
              worldToOverview: new THREE.Matrix4()
                .makeTranslation(-offset, 0, -offset)
                .toArray(),
              screen: [1, 0, 0],
              width: 100,
              height: 100,
            },
            snapshot
          ).edges
      );
    };
    const local = project(0),
      ecef = project(6_000_000);
    local.forEach((edges, tile) => {
      expect(edges.length).toBeGreaterThan(0);
      expect(ecef[tile].length).toBe(edges.length);
      edges.forEach((coordinate, index) =>
        expect(ecef[tile][index]).toBeCloseTo(coordinate, 4)
      );
    });
  });
  it("draws every frustum while cropping to the union or a selected camera", () => {
    const basis = {
      bounds: [-100, -10, -100, 100, 10, 100],
      worldToOverview: new THREE.Matrix4().toArray(),
      screen: [1, 100, 100],
      width: 200,
      height: 200,
    };
    const cameras = [-50, 50].map((x, i) => {
      const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 100);
      camera.position.set(x, 50, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(x, 0, 0);
      camera.updateMatrixWorld();
      return {
        id: String(i),
        camera,
        viewport: [200, 200] as const,
        errorTargetPixels: 2,
        role: "receiver" as const,
      };
    });
    const snapshots = snapshotTileCameraViews(cameras);
    const all = projectTileDiagnosticViewports(basis, snapshots, "all", 100);
    const single = projectTileDiagnosticViewports(basis, snapshots, "1", 100);
    expect(all.views).toHaveLength(2);
    expect(all.views.every((view) => view.edges.length > 0)).toBe(true);
    expect(single.views.map((view) => view.edges)).toEqual(
      all.views.map((view) => view.edges)
    );
    expect(all.view.w).toBeCloseTo(120);
    expect(single.view.w).toBeCloseTo(20);
    expect(single.view.x).toBeCloseTo(140);
    expect(
      projectTileDiagnosticViewports(basis, snapshots, "removed", 100).view
    ).toEqual(all.views[0].view);
  });
  it.each(["perspective", "orthographic"])(
    "moves independently of tile capture for %s cameras",
    (kind) => {
      const camera =
        kind === "perspective"
          ? new THREE.PerspectiveCamera(45, 1, 1, 100)
          : new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 100);
      const basis = {
        bounds: [-100, -10, -100, 100, 10, 100],
        worldToOverview: new THREE.Matrix4().toArray(),
        screen: [1, 100, 100],
        width: 200,
        height: 200,
      };
      const project = (x: number, paddingPercent?: number) => {
        camera.position.set(x, 50, 0);
        camera.up.set(0, 0, -1);
        camera.lookAt(x, 0, 0);
        camera.updateMatrixWorld();
        return projectTileDiagnosticViewport(
          basis,
          snapshotTileCameraViews([
            {
              id: "test",
              camera,
              viewport: [200, 200],
              errorTargetPixels: 2,
              role: "receiver",
            },
          ])[0],
          paddingPercent
        );
      };
      const before = project(0),
        after = project(20);
      expect(before.edges.length).toBeGreaterThan(0);
      const tight = project(0, 100);
      expect(before.view.w).toBeCloseTo(tight.view.w * 2);
      expect(project(0, 300).view.w).toBeCloseTo(tight.view.w * 3);
      expect(project(0, 300).edges).toEqual(before.edges);
      expect(after.center![0] - before.center![0]).toBeCloseTo(20);
      expect(after.view.x - before.view.x).toBeCloseTo(20);
      expect(after.edges).not.toEqual(before.edges);
      expect(basis.screen).toEqual([1, 100, 100]);
      const outside = project(500);
      expect(outside.edges.length).toBe(0);
      expect(outside.center).toBeNull();
    }
  );

  it("fits presented content instead of a deep unused ancestor extent", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 1000);
    camera.updateMatrixWorld();
    const snapshot = snapshotTileCameraViews([
      {
        id: "observer",
        camera,
        viewport: [400, 400],
        errorTargetPixels: 6,
        role: "receiver",
      },
    ])[0];
    const view = projectTileDiagnosticViewport(
      {
        bounds: [-1000, -1000, -1000, 1000, 1000, 1000],
        tileBounds: [-1, -1, -5, 1, 1, -3],
        worldToOverview: new THREE.Matrix4().toArray(),
        screen: [1, 0, 0],
        width: 400,
        height: 400,
      },
      snapshot
    );
    expect(view.footprintBounds).toEqual({
      minX: -1,
      maxX: 1,
      minY: -5,
      maxY: -3,
    });
    expect(view.view.w).toBe(4);
    expect(view.edges).toHaveLength(0);
  });

  it("clips side cuts at the far plane without drawing a far-plane closure", () => {
    // Only the four side planes produce lines; far depth bounds their length.
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 60);
    camera.position.set(0, 40, 0);
    camera.lookAt(0, 0, -30);
    const snapshot = snapshotTileCameraViews([
      {
        id: "near-far",
        camera,
        viewport: [500, 500],
        errorTargetPixels: 4,
        role: "receiver",
      },
    ])[0];
    const { edges } = projectTileDiagnosticViewport(
      {
        bounds: [-200, -5, -200, 200, 5, 200],
        worldToOverview: new THREE.Matrix4().toArray(),
        screen: [1, 0, 0],
        width: 400,
        height: 400,
      },
      snapshot
    );
    const segments = Array.from({ length: edges.length / 4 }, (_, i) =>
      Array.from(edges.subarray(i * 4, i * 4 + 4))
    );
    expect(segments.length).toBeGreaterThan(3);
    // Far-clipped side cuts have open ends rather than an invented cap.
    const counts = new Map<string, number>();
    for (const [x0, y0, x1, y1] of segments)
      for (const point of [
        `${x0.toFixed(3)}:${y0.toFixed(3)}`,
        `${x1.toFixed(3)}:${y1.toFixed(3)}`,
      ])
        counts.set(point, (counts.get(point) ?? 0) + 1);
    expect([...counts.values()].some((count) => count === 1)).toBe(true);
  });

  it("does not close surface cuts along box faces untouched by a frustum plane", () => {
    // A pitched camera over a thin terrain tile: neither the near nor the far
    // plane touches the box. The side cuts must stay open at the tile rim;
    // a horizontal connector there would only outline the clipped solid.
    const camera = new THREE.PerspectiveCamera(45, 1.3, 5, 4000);
    camera.position.set(0, 300, 900);
    camera.lookAt(0, 120, 0);
    const snapshot = snapshotTileCameraViews([
      {
        id: "pitched",
        camera,
        viewport: [1000, 800],
        errorTargetPixels: 1,
        role: "receiver",
      },
    ])[0];
    const { edges } = projectTileDiagnosticViewport(
      {
        bounds: [-500, 100, -500, 500, 160, 500],
        worldToOverview: new THREE.Matrix4().toArray(),
        screen: [0.3, 200, 200],
        width: 400,
        height: 400,
      },
      snapshot
    );
    const segments = Array.from({ length: edges.length / 4 }, (_, i) =>
      Array.from(edges.subarray(i * 4, i * 4 + 4))
    );
    // No segment collapses to a point, and none is drawn twice.
    const keys = segments.map(([x0, y0, x1, y1]) =>
      [x0, y0, x1, y1].map((value) => value.toFixed(2)).join(":")
    );
    expect(new Set(keys).size).toBe(keys.length);
    // Nothing collapses to a point, and short connectors survive: dropping
    // them by length is what left the outline as loose strokes.
    expect(
      segments.every(([x0, y0, x1, y1]) => Math.hypot(x1 - x0, y1 - y0) > 0)
    ).toBe(true);
    // No artificial front/back closing edge: neither is a frustum-plane cut.
    const span = (y: number) =>
      segments.some(
        ([x0, y0, x1, y1]) =>
          Math.abs(y0 - y) < 1 && Math.abs(y1 - y) < 1 && Math.abs(x1 - x0) > 50
      );
    expect(
      span(Math.min(...segments.flatMap(([, y0, , y1]) => [y0, y1])))
    ).toBe(false);
    expect(
      span(Math.max(...segments.flatMap(([, y0, , y1]) => [y0, y1])))
    ).toBe(false);
  });
});
