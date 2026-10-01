import {
  Box3,
  DirectionalLight,
  Group,
  Matrix4,
  OrthographicCamera,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";

import { createTerrainRuntimeFrame } from "./terrain-runtime-frame";

describe("terrain shadow reference frame", () => {
  it("snapshots the actual world sun camera before carrying it through a later mount", () => {
    const mount = new Group();
    mount.matrixAutoUpdate = false;
    mount.matrix.makeRotationY(Math.PI / 3).setPosition(20, 30, -40);
    const light = new DirectionalLight();
    light.position.set(8, 20, 30);
    mount.add(light, light.target);
    mount.updateMatrixWorld(true);
    light.shadow.updateMatrices(light);
    const worldCamera = light.shadow.camera;
    const originalWorld = worldCamera.matrixWorld.clone();
    const frame = createTerrainRuntimeFrame();
    // Shadow-controller updates precede terrain.update: the live mount wins
    // over a stale frame cached from the previous render.
    frame.updateMount(mount.matrixWorld);
    const referenceCamera = frame.toReferenceCamera(worldCamera);
    const roundTripCamera = frame.toWorldCamera(referenceCamera);
    const receiver = new Vector3(2, 0, 3);
    const originalClip = receiver
      .clone()
      .applyMatrix4(mount.matrixWorld)
      .applyMatrix4(worldCamera.matrixWorldInverse)
      .applyMatrix4(worldCamera.projectionMatrix);
    const roundTripClip = receiver
      .clone()
      .applyMatrix4(mount.matrixWorld)
      .applyMatrix4(roundTripCamera.matrixWorldInverse)
      .applyMatrix4(roundTripCamera.projectionMatrix);
    expect(roundTripClip.distanceTo(originalClip)).toBeLessThan(1e-12);
    expect(worldCamera.matrixWorld.equals(originalWorld)).toBe(true);
    const nextMount = new Matrix4()
      .makeRotationY(-Math.PI / 4)
      .setPosition(-15, 10, 20);
    frame.updateMount(nextMount);
    const carriedCamera = frame.toWorldCamera(referenceCamera);
    const carriedClip = receiver
      .clone()
      .applyMatrix4(nextMount)
      .applyMatrix4(carriedCamera.matrixWorldInverse)
      .applyMatrix4(carriedCamera.projectionMatrix);
    expect(carriedClip.distanceTo(originalClip)).toBeLessThan(1e-12);
  });

  it("moves a reference light camera with the geometry without changing clip coordinates", () => {
    const referenceToCurrent = new Matrix4()
      .makeRotationY(Math.PI / 3)
      .setPosition(20, 30, -40);
    const frame = createTerrainRuntimeFrame();
    frame.update({
      referenceToCurrent,
      currentToReference: referenceToCurrent.clone().invert(),
    });
    const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(8, 20, 30);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const original = camera.matrixWorld.clone();
    const worldCamera = frame.toWorldCamera(camera);
    const receiver = new Vector3(2, 0, 3);
    const referenceClip = receiver
      .clone()
      .applyMatrix4(camera.matrixWorldInverse)
      .applyMatrix4(camera.projectionMatrix);
    const worldClip = receiver
      .clone()
      .applyMatrix4(referenceToCurrent)
      .applyMatrix4(worldCamera.matrixWorldInverse)
      .applyMatrix4(worldCamera.projectionMatrix);
    expect(worldClip.distanceTo(referenceClip)).toBeLessThan(1e-12);
    expect(camera.matrixWorld.equals(original)).toBe(true);
    expect(
      worldCamera.matrixWorld
        .clone()
        .multiply(worldCamera.matrixWorldInverse)
        .elements.every(
          (value, index) =>
            Math.abs(value - new Matrix4().elements[index]) < 1e-12
        )
    ).toBe(true);
    const referenceBox = new Box3(new Vector3(1, 2, 3), new Vector3(1, 2, 3));
    const restored = frame.toReferenceBounds(
      frame.toWorldBounds(referenceBox.clone())
    );
    expect(restored.min.distanceTo(referenceBox.min)).toBeLessThan(1e-12);
    expect(restored.max.distanceTo(referenceBox.max)).toBeLessThan(1e-12);
  });
});
