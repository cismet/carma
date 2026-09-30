import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createCylinderCameraRig } from "./cylinder-camera-rig";
import { forward, referenceEdge } from "./camera-rig.test-support";

describe("cylinder camera rig", () => {
  it("creates a no-parallax panorama with outward cameras", () => {
    const center = new Vector3(3, 4, 5);
    const views = createCylinderCameraRig({
      center,
      radius: 10,
      height: 8,
      count: 4,
      mode: "panorama",
      aspect: 2,
      near: 0.1,
      far: 100,
    });
    expect(views).toHaveLength(4);
    expect(
      views.every(({ camera }) => camera instanceof PerspectiveCamera)
    ).toBe(true);
    expect(views.every(({ camera }) => camera.position.equals(center))).toBe(
      true
    );
    expect(
      forward(views[0].camera).distanceTo(new Vector3(1, 0, 0))
    ).toBeLessThan(1e-12);
    expect((views[0].camera as PerspectiveCamera).fov).toBeCloseTo(
      (2 * Math.atan(0.5) * 180) / Math.PI
    );
  });

  it("creates inward orthographic cylinder slices", () => {
    const views = createCylinderCameraRig({
      center: new Vector3(),
      radius: 10,
      height: 6,
      count: 4,
      mode: "object-cover",
      aspect: 1,
      near: 0.1,
      far: 100,
    });
    const camera = views[0].camera as OrthographicCamera;
    expect(camera).toBeInstanceOf(OrthographicCamera);
    expect(camera.position).toEqual(new Vector3(10, 0, 0));
    expect(forward(camera).distanceTo(new Vector3(-1, 0, 0))).toBeLessThan(
      1e-12
    );
    expect(camera.right - camera.left).toBeCloseTo(10);
    expect(views[0].distance).toBe(5);
    for (let index = 0; index < views.length; index++)
      expect(
        referenceEdge(views[index], -1).distanceTo(
          referenceEdge(views[(index + 1) % views.length], 1)
        )
      ).toBeLessThan(1e-10);
    expect(
      views[0].clipPlanes[0].distanceToPoint(new Vector3())
    ).toBeGreaterThan(0);
  });

  it("rejects an invalid panorama count", () => {
    expect(() =>
      createCylinderCameraRig({
        center: new Vector3(),
        radius: 1,
        height: 1,
        count: 2,
        mode: "panorama",
        aspect: 1,
        near: 1,
        far: 2,
      })
    ).toThrow();
  });
});
