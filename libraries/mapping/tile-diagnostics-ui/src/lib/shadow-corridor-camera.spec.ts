import { describe, expect, it } from "vitest";
import { OrthographicCamera } from "three";
import {
  SHADOW_CORRIDOR_CAMERA_ID,
  snapshotShadowCorridorCameras,
} from "./shadow-corridor-camera";

const shadowView = (camera: OrthographicCamera) =>
  ({
    camera,
    shadowMapSize: { width: 2048, height: 2048 },
  } as never);

describe("snapshotShadowCorridorCameras", () => {
  it("snapshots an orthographic corridor camera for the overlay", () => {
    const camera = new OrthographicCamera(-500, 500, 400, -400, 1, 9000);
    camera.position.set(1200, 800, -300);
    camera.lookAt(0, 0, 0);
    const [snapshot, ...rest] = snapshotShadowCorridorCameras(
      shadowView(camera)
    );
    expect(rest).toHaveLength(0);
    expect(snapshot.id).toBe(SHADOW_CORRIDOR_CAMERA_ID);
    expect(snapshot.role).toBe("geometry");
    expect(snapshot.viewport).toEqual([2048, 2048]);
    // World matrix is taken from the live camera, not an identity default.
    expect(snapshot.matrixWorld.slice(12, 15)).toEqual([1200, 800, -300]);
    expect(snapshot.projectionMatrix.every(Number.isFinite)).toBe(true);
  });

  it("publishes nothing without a corridor or with a broken matrix", () => {
    expect(snapshotShadowCorridorCameras(null)).toEqual([]);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 10);
    camera.position.setX(Number.NaN);
    camera.updateMatrix();
    camera.matrixAutoUpdate = false;
    camera.matrixWorld.elements[12] = Number.NaN;
    expect(snapshotShadowCorridorCameras(shadowView(camera))).toEqual([]);
  });
});
