import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { projectDiagnosticVolumes } from "./tile-diagnostic-capture";
import type { SharedThreeSceneTileVolume } from "../../core/shared-three-scene-types";

const frustumOf = (camera: THREE.Camera) => {
  camera.updateMatrixWorld(true);
  return new THREE.Frustum().setFromProjectionMatrix(
    camera.projectionMatrix
      .clone()
      .multiply(camera.matrixWorld.clone().invert()),
    camera.coordinateSystem,
    camera.reversedDepth
  );
};

const volume = (
  id: string,
  min: [number, number, number],
  max: [number, number, number],
  extra: Partial<SharedThreeSceneTileVolume> = {}
): SharedThreeSceneTileVolume => ({
  id,
  kind: "terrain-tile",
  minimum: min,
  maximum: max,
  ...extra,
});

describe("projectDiagnosticVolumes", () => {
  const toScreen = (x: number, z: number): [number, number] => [x, z];
  const identity = new THREE.Matrix4();

  it("cuts 2.5D tiles with the main and the corridor frustum", () => {
    const main = new THREE.PerspectiveCamera(60, 1, 1, 400);
    main.position.set(0, 0, 0);
    main.lookAt(0, 0, -1);
    // Overhead corridor over the tile behind the camera, like a sun frustum.
    const corridor = new THREE.OrthographicCamera(-60, 60, 60, -60, 1, 600);
    corridor.position.set(0, 300, 110);
    corridor.lookAt(0, 0, 110);
    const projected = projectDiagnosticVolumes(
      [
        volume("in-view", [-10, -10, -120], [10, 10, -100]),
        volume("behind", [-10, -10, 100], [10, 10, 120], {
          state: "loading",
        }),
      ],
      identity,
      toScreen,
      frustumOf(main),
      frustumOf(corridor)
    );
    expect(projected.map((entry) => entry.id)).toEqual(["in-view", "behind"]);
    const [inView, behind] = projected;
    expect(inView.inView).toBe(true);
    expect(inView.inShadow).toBe(false);
    expect(inView.kind).toBe("displayed");
    expect(behind.inView).toBe(false);
    expect(behind.inShadow).toBe(true);
    expect(behind.kind).toBe("loading");
  });

  it("projects the footprint and drops unusable boxes", () => {
    const [rect, ...rest] = projectDiagnosticVolumes(
      [
        volume("tile", [10, 0, 20], [30, 5, 60], { loadReason: "shadow" }),
        volume("broken", [Number.NaN, 0, 0], [1, 1, 1]),
      ],
      identity,
      toScreen,
      null,
      null
    );
    expect(rest).toHaveLength(0);
    expect([rect.x, rect.y, rect.w, rect.h]).toEqual([10, 20, 20, 40]);
    // Height still bounds the box even though the overview drops the y axis.
    expect(rect.world.max.y).toBe(5);
    expect(rect.inView).toBe(true);
    expect(rect.inShadow).toBe(false);
    expect(rect.kind).toBe("resident");
  });
});
