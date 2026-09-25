import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  createPrintedModelCaptureCamera,
  fitPrintedCaptureBounds,
  PROJECTOR_ASPECT_RATIO,
} from "./shadow-texture-camera";

describe("printed-model perspective capture", () => {
  const bounds = new THREE.Box3(
    new THREE.Vector3(-2_869, 124.35, -1_598),
    new THREE.Vector3(2_869, 340, 1_598)
  );

  it("keeps the physical camera height at the 1:2000 print scale", () => {
    const camera = createPrintedModelCaptureCamera(bounds, 124.35, 2.3);
    expect(camera.position.y).toBeCloseTo(4_724.35);
    expect(camera.position.x).toBe(0);
    expect(camera.position.z).toBe(0);
  });

  it("uses the entire 16:9 frame and projects its footprint corners to the image corners", () => {
    const footprint = fitPrintedCaptureBounds(bounds);
    const camera = createPrintedModelCaptureCamera(bounds, 124.35, 2.3);
    expect(camera.aspect).toBe(PROJECTOR_ASPECT_RATIO);
    expect(footprint.getSize(new THREE.Vector3()).x /
      footprint.getSize(new THREE.Vector3()).z).toBeCloseTo(PROJECTOR_ASPECT_RATIO);
    for (const x of [footprint.min.x, footprint.max.x]) {
      for (const z of [footprint.min.z, footprint.max.z]) {
        const clip = new THREE.Vector3(x, 124.35, z).project(camera);
        expect(Math.abs(clip.x)).toBeCloseTo(1);
        expect(Math.abs(clip.y)).toBeCloseTo(1);
      }
    }
  });

  it("narrows the angle as the physical camera rises", () => {
    const low = createPrintedModelCaptureCamera(bounds, 124.35, 1);
    const high = createPrintedModelCaptureCamera(bounds, 124.35, 3);
    expect(high.fov).toBeLessThan(low.fov);
  });
});
