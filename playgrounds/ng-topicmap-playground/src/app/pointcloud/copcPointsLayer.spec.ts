import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("maplibre-gl", () => ({
  MercatorCoordinate: { fromLngLat: vi.fn() },
}));

import {
  createCopcPointCloudVisualizer,
  POINT_SHAPES,
} from "./copcPointsLayer";

describe("COPC point shapes", () => {
  it("uses transparent blending without depth writes for soft splats", () => {
    const visualizer = createCopcPointCloudVisualizer();
    visualizer.addChunk({
      nodeKey: "0-0-0-0",
      positions: new Float32Array([0, 0, 0]),
      colors: null,
      spacing: 1,
      fieldValues: {},
      pointCount: 1,
    });
    const points = visualizer.group.children[0] as THREE.Points<
      THREE.BufferGeometry,
      THREE.ShaderMaterial
    >;

    const materialVersion = points.material.version;
    visualizer.setShape(POINT_SHAPES.SOFT_SPLAT);

    expect(points.material.uniforms.uShape.value).toBe(3);
    expect(points.material.transparent).toBe(true);
    expect(points.material.depthWrite).toBe(false);
    expect(points.material.depthTest).toBe(true);
    expect(points.material.blending).toBe(THREE.NormalBlending);
    expect(points.material.premultipliedAlpha).toBe(true);
    expect(points.material.alphaToCoverage).toBe(false);
    expect(points.material.fragmentShader).not.toContain("screenDoorThreshold");
    expect(points.material.fragmentShader).toContain("shapeCoverage");
    expect(points.material.fragmentShader).toContain(
      "fragmentColor *= fragmentAlpha"
    );
    expect(points.material.version).toBeGreaterThan(materialVersion);

    visualizer.setShape(POINT_SHAPES.CIRCLE);

    expect(points.material.uniforms.uShape.value).toBe(1);
    expect(points.material.transparent).toBe(false);
    expect(points.material.depthWrite).toBe(true);
    expect(points.material.depthTest).toBe(true);
    expect(points.material.premultipliedAlpha).toBe(false);
    expect(points.material.alphaToCoverage).toBe(false);
    visualizer.dispose();
  });
});
