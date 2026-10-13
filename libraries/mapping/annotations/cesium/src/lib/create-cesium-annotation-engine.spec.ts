import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { readHorizontalFovFromVertical } from "@carma-commons/camera/model";
import type { Radians } from "@carma-units";
import type { Scene } from "@carma-cesium";

import { createCesiumAnnotationEngine } from "./create-cesium-annotation-engine";

const createSceneWithFrustum = (frustum: {
  fov: number;
  aspectRatio: number;
}) => {
  const setView = vi.fn();
  const requestRender = vi.fn();
  const scene = {
    canvas: document.createElement("canvas"),
    camera: { setView, frustum },
    requestRender,
    isDestroyed: () => false,
  } as unknown as Scene;
  return { scene, frustum, setView, requestRender };
};

const pose = (verticalFovRad: number) => ({
  positionECEF: new Vector3(6_378_137, 0, 0),
  directionECEF: new Vector3(-1, 0, 0),
  upECEF: new Vector3(0, 0, 1),
  verticalFovRad: verticalFovRad as Radians,
});

describe("createCesiumAnnotationEngine setCameraPose", () => {
  it("sets the vertical field of view on a portrait frustum", () => {
    const { scene, frustum, setView, requestRender } = createSceneWithFrustum({
      fov: 1,
      aspectRatio: 0.5,
    });
    const engine = createCesiumAnnotationEngine(scene);
    expect(engine.setCameraPose(pose(0.6))).toBe(true);
    expect(setView).toHaveBeenCalledTimes(1);
    expect(frustum.fov).toBe(0.6);
    expect(requestRender).toHaveBeenCalled();
  });

  it("sets the horizontal field of view on a landscape frustum", () => {
    const { scene, frustum } = createSceneWithFrustum({
      fov: 1,
      aspectRatio: 2,
    });
    createCesiumAnnotationEngine(scene).setCameraPose(pose(0.6));
    expect(frustum.fov).toBeCloseTo(readHorizontalFovFromVertical(0.6, 2)!, 12);
    expect(frustum.fov).toBeGreaterThan(0.6);
  });

  it("does nothing once disposed with its scene gone", () => {
    const { scene, setView } = createSceneWithFrustum({
      fov: 1,
      aspectRatio: 2,
    });
    const engine = createCesiumAnnotationEngine(scene);
    engine.dispose();
    expect(engine.setCameraPose(pose(0.6))).toBe(false);
    expect(setView).not.toHaveBeenCalled();
  });
});
