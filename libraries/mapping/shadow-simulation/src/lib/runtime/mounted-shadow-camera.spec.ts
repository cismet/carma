import { DirectionalLight, Group, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { configureMountedShadowCamera } from "./mounted-shadow-camera";

describe("mounted shadow camera", () => {
  it("preserves terrain shadow coordinates across rotated and affine mounts", () => {
    const mount = new Group();
    const light = new DirectionalLight();
    mount.add(light, light.target);
    light.position.set(-800, 200, 300);
    const restore = configureMountedShadowCamera(light, () => true);
    const point = new Vector3(1, 2, 3);
    try {
      mount.updateMatrixWorld(true);
      light.shadow.updateMatrices(light);
      const baseline = point.clone().applyMatrix4(light.shadow.matrix);
      for (const matrix of [
        new Matrix4().makeRotationX(0.7),
        new Matrix4().makeRotationZ(-0.3).scale(new Vector3(0.8, 1.2, 1.1)),
        new Matrix4().makeShear(0.1, 0.2, -0.1, 0.03, 0.1, 0.02),
      ]) {
        matrix.setPosition(120, -34, 560);
        mount.matrixAutoUpdate = false;
        mount.matrix.copy(matrix);
        mount.updateMatrixWorld(true);
        light.shadow.updateMatrices(light);
        const projected = point
          .clone()
          .applyMatrix4(mount.matrixWorld)
          .applyMatrix4(light.shadow.matrix);
        expect(projected.distanceTo(baseline)).toBeLessThan(1e-11);
      }
    } finally {
      restore();
    }
  });
  it("restores Three's original camera update on disposal", () => {
    const light = new DirectionalLight();
    const original = light.shadow.updateMatrices;
    const restore = configureMountedShadowCamera(light, () => true);
    restore();
    expect(light.shadow.updateMatrices).toBe(original);
    expect(light.shadow.camera.matrixAutoUpdate).toBe(true);
    expect(light.shadow.camera.matrixWorldAutoUpdate).toBe(true);
  });
});
