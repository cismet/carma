import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { snapshotTileCameraViews } from "../../core/tile-camera-demand";
import {
  projectTileDiagnosticViewport,
  projectTileDiagnosticViewports,
} from "./tile-diagnostic-viewport";

describe("live overview viewport", () => {
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

  it("closes the footprint, far cut included", () => {
    // A camera whose far plane cuts inside the extent: the far edge is a face
    // of the clipped volume like any other, so the outline must close instead
    // of showing two open side rails.
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
    // Every endpoint is shared with another segment: a closed outline.
    const counts = new Map<string, number>();
    for (const [x0, y0, x1, y1] of segments)
      for (const point of [
        `${x0.toFixed(3)}:${y0.toFixed(3)}`,
        `${x1.toFixed(3)}:${y1.toFixed(3)}`,
      ])
        counts.set(point, (counts.get(point) ?? 0) + 1);
    expect([...counts.values()].every((count) => count >= 2)).toBe(true);
  });
});
