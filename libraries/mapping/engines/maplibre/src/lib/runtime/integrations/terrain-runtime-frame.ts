import { Box3, Camera, Matrix4 } from "three";

import type { SharedThreeSceneFrame } from "../../core/shared-three-scene-types";

/** The runtime measures current scene geometry while mounted shadow consumers
 * exchange cameras and bounds in the shared frame's stable reference fit.
 */
export const createTerrainRuntimeFrame = () => {
  const worldToReference = new Matrix4();
  const referenceToWorld = new Matrix4();
  const transformCamera = (camera: Camera, matrix: Matrix4): Camera => {
    const result = camera.clone();
    result.matrixAutoUpdate = false;
    result.matrixWorldAutoUpdate = false;
    result.matrixWorld.multiplyMatrices(matrix, camera.matrixWorld);
    result.matrix.copy(result.matrixWorld);
    result.matrixWorldInverse.copy(result.matrixWorld).invert();
    result.matrixWorld.decompose(
      result.position,
      result.quaternion,
      result.scale
    );
    return result;
  };
  return {
    update: (
      frame: Pick<
        SharedThreeSceneFrame["localFrame"],
        "currentToReference" | "referenceToCurrent"
      >
    ) => {
      worldToReference.copy(frame.currentToReference);
      referenceToWorld.copy(frame.referenceToCurrent);
    },
    updateMount: (referenceToCurrent: Matrix4) => {
      referenceToWorld.copy(referenceToCurrent);
      worldToReference.copy(referenceToCurrent).invert();
    },
    toReferenceCamera: (camera: Camera): Camera =>
      transformCamera(camera, worldToReference),
    toWorldCamera: (camera: Camera): Camera =>
      transformCamera(camera, referenceToWorld),
    toReferenceBounds: (bounds: Box3) => bounds.applyMatrix4(worldToReference),
    toWorldBounds: (bounds: Box3) => bounds.applyMatrix4(referenceToWorld),
  };
};
