import type { TilesRenderer } from "3d-tiles-renderer";
import { Matrix4, Vector3, type Camera } from "three";
import { TilesViewFrustum } from "./three-tiles-runtime-vendor";

type CameraInfo = {
  frustum: TilesViewFrustum;
  isOrthographic: boolean;
  sseDenominator: number;
  position: Vector3;
  invScale: number;
  pixelSize: number;
};

type NativeCameraState = {
  group: { matrixWorld: Matrix4; matrixWorldInverse: Matrix4 };
  cameras: Camera[];
  cameraMap: Map<Camera, { width: number; height: number }>;
  cameraInfo: CameraInfo[];
};

/** Gershgorin bound on the largest singular value of the linear transform. */
const maximumStretch = (matrix: Matrix4): number => {
  const e = matrix.elements;
  let maximum = 0;
  for (let column = 0; column < 3; column++) {
    let rowSum = 0;
    for (let other = 0; other < 3; other++) {
      let dot = 0;
      for (let row = 0; row < 3; row++)
        dot += e[column * 4 + row] * e[other * 4 + row];
      rowSum += Math.abs(dot);
    }
    maximum = Math.max(maximum, rowSum);
  }
  return Math.sqrt(maximum);
};

/**
 * Upstream's root-space SSE assumes a similarity transform. The geodetic
 * Mercator mount intentionally has different east/north scales. Prepare the
 * same exact camera frustum and conservatively bound its fallback SSE under
 * that affine mount; compiled world-space camera demand still owns admission.
 * Returns false for similarity mounts, which keep the upstream preparation.
 */
export function createAffineTilesTraversalPreparation(renderer: TilesRenderer) {
  const state = renderer as unknown as NativeCameraState;
  const projection = new Matrix4();
  return (): boolean => {
    const stretch = maximumStretch(state.group.matrixWorld);
    const inverseStretch = maximumStretch(state.group.matrixWorldInverse);
    const condition = stretch * inverseStretch;
    if (!Number.isFinite(condition) || condition <= 1 + 1e-10) return false;

    state.cameraInfo.length = Math.min(
      state.cameraInfo.length,
      state.cameras.length
    );
    while (state.cameraInfo.length < state.cameras.length)
      state.cameraInfo.push({
        frustum: new TilesViewFrustum(),
        isOrthographic: false,
        sseDenominator: -1,
        position: new Vector3(),
        invScale: -1,
        pixelSize: 0,
      });

    state.cameras.forEach((camera, index) => {
      const info = state.cameraInfo[index];
      const resolution = state.cameraMap.get(camera)!;
      if (resolution.width === 0 || resolution.height === 0)
        console.warn(
          "TilesRenderer: resolution for camera error calculation is not set."
        );
      const elements = camera.projectionMatrix.elements;
      info.isOrthographic = elements[15] === 1;
      if (info.isOrthographic) {
        // Geometric error is in root units; projection pixel size is in world
        // units. The largest stretch bounds all possible error directions.
        info.pixelSize =
          Math.min(
            Math.abs(2 / elements[5] / resolution.height),
            Math.abs(2 / elements[0] / resolution.width)
          ) / stretch;
      } else {
        // Both error and distance originate in the root frame. Their relative
        // distortion is bounded by ||A|| * ||A^-1||, including shear.
        info.sseDenominator =
          Math.min(
            Math.abs(2 / elements[5] / resolution.height),
            Math.abs(2 / elements[0] / resolution.width)
          ) / condition;
      }
      projection
        .copy(state.group.matrixWorld)
        .premultiply(camera.matrixWorldInverse)
        .premultiply(camera.projectionMatrix);
      info.frustum.setFromProjectionMatrix(
        projection,
        camera.coordinateSystem,
        camera.reversedDepth
      );
      info.position
        .setFromMatrixPosition(camera.matrixWorld)
        .applyMatrix4(state.group.matrixWorldInverse);
    });
    return true;
  };
}
