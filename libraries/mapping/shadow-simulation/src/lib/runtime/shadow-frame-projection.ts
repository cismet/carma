import * as THREE from "three";

import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
  SharedThreeSceneTileVolume,
} from "@carma-mapping/engines/maplibre";

const IDENTITY_MATRIX = new THREE.Matrix4();

/** Projects camera and external runtime bounds into the shared reference frame. */
export const createShadowFrameProjection = (
  initialLocalFrame: SharedThreeSceneFrame["localFrame"] | null,
  getLatestFrame: () => SharedThreeSceneFrame | null
) => {
  /** Scene to the frame's reference space, where the shadow scene works. */
  const frameFromScene = (): THREE.Matrix4 =>
    getLatestFrame()?.localFrame?.currentToReference ??
    initialLocalFrame?.currentToReference ??
    IDENTITY_MATRIX;
  const framePerspectiveCamera = new THREE.PerspectiveCamera();
  const frameGenericCamera = new THREE.Camera();
  /**
   * The observer expressed in frame space, for planning against frame cells.
   * A faithful copy of the render camera (lens, near/far, layers) whose pose
   * is brought into the reference fit; the render camera itself while the
   * frame still sits at its reference.
   */
  const getFrameCamera = (frame: SharedThreeSceneFrame): THREE.Camera => {
    const camera = frame.renderCamera;
    const { localFrame } = frame;
    if (!localFrame || localFrame.currentToReference.equals(IDENTITY_MATRIX))
      return camera;
    const frameCamera =
      camera instanceof THREE.PerspectiveCamera
        ? framePerspectiveCamera.copy(camera, false)
        : frameGenericCamera.copy(camera, false);
    frameCamera.matrixAutoUpdate = false;
    frameCamera.matrixWorldAutoUpdate = false;
    frameCamera.matrixWorld.multiplyMatrices(
      localFrame.currentToReference,
      camera.matrixWorld
    );
    frameCamera.matrixWorld.decompose(
      frameCamera.position,
      frameCamera.quaternion,
      frameCamera.scale
    );
    frameCamera.matrix.copy(frameCamera.matrixWorld);
    frameCamera.matrixWorldInverse.multiplyMatrices(
      camera.matrixWorldInverse,
      localFrame.referenceToCurrent
    );
    return frameCamera;
  };
  /** Volumes of a runtime outside the frame group, brought into frame space. */
  const toFrameVolumes = (
    runtime: SharedThreeSceneRuntime | null | undefined,
    volumes: readonly SharedThreeSceneTileVolume[]
  ): readonly SharedThreeSceneTileVolume[] => {
    if (runtime?.mountsOnLocalFrame || volumes.length === 0) return volumes;
    const matrix = frameFromScene();
    if (matrix.equals(IDENTITY_MATRIX)) return volumes;
    const box = new THREE.Box3();
    return volumes.map((volume) => {
      box.min.set(...volume.minimum);
      box.max.set(...volume.maximum);
      box.applyMatrix4(matrix);
      return {
        ...volume,
        minimum: [box.min.x, box.min.y, box.min.z],
        maximum: [box.max.x, box.max.y, box.max.z],
      };
    });
  };

  return { frameFromScene, getFrameCamera, toFrameVolumes };
};
