import { describe, expect, it } from "vitest";
import type {
  InterleavedBufferAttribute,
  InstancedBufferAttribute,
} from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import {
  updateSceneLineBuffers,
  updateSegmentDashScales,
} from "./maplibre-scene-line-buffers";

const dataOf = (geometry: LineSegmentsGeometry, name: string) =>
  (geometry.getAttribute(name) as InterleavedBufferAttribute).data;

describe("scene line GPU buffers", () => {
  it("reuses positions and distance buffers when a connector moves, and uploads no equal frame", () => {
    const geometry = new LineGeometry();
    const positions = new Float32Array([0, 0, 0, 3, 4, 0, 3, 4, 12]);
    updateSceneLineBuffers(geometry, positions, false);
    const positionBuffer = dataOf(geometry, "instanceStart");
    const distanceBuffer = dataOf(geometry, "instanceDistanceStart");
    expect(Array.from(distanceBuffer.array)).toEqual([0, 5, 5, 17]);
    const before = [positionBuffer.version, distanceBuffer.version];
    updateSceneLineBuffers(geometry, positions.slice(), false);
    expect([positionBuffer.version, distanceBuffer.version]).toEqual(before);
    const moved = new Float32Array([0, 0, 0, 6, 8, 0, 6, 8, 12]);
    updateSceneLineBuffers(geometry, moved, false);
    expect(dataOf(geometry, "instanceStart")).toBe(positionBuffer);
    expect(dataOf(geometry, "instanceDistanceStart")).toBe(distanceBuffer);
    expect(positionBuffer.version).toBe(before[0]! + 1);
    expect(Array.from(distanceBuffer.array)).toEqual([0, 10, 10, 22]);
    geometry.dispose();
  });

  it("keeps disjoint dash endpoints and resets the occluded phase for every dash", () => {
    const geometry = new LineSegmentsGeometry();
    const positions = new Float32Array([0, 0, 0, 5, 0, 0, 20, 0, 0, 25, 0, 0]);
    updateSceneLineBuffers(geometry, positions, true);
    expect(Array.from(dataOf(geometry, "instanceStart").array)).toEqual(
      Array.from(positions)
    );
    expect(Array.from(dataOf(geometry, "instanceDistanceStart").array)).toEqual(
      [0, 5, 0, 5]
    );
    const scene = {
      getPixelsPerMeterAtScene: (point: { x: number }) => point.x,
    } as unknown as MapLibreAnnotationScene;
    updateSegmentDashScales(geometry, scene, positions);
    const scale = geometry.getAttribute(
      "instanceDashScale"
    ) as InstancedBufferAttribute;
    expect(Array.from(scale.array)).toEqual([2.5, 22.5]);
    const beforeVersion = scale.version;
    updateSegmentDashScales(geometry, scene, positions);
    expect(geometry.getAttribute("instanceDashScale")).toBe(scale);
    expect(scale.version).toBe(beforeVersion);
    geometry.dispose();
  });
});
