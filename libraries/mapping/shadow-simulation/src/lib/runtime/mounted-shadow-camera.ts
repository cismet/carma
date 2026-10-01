import { DirectionalLight, Matrix4, Vector3 } from "three";

/** Keep a directional shadow camera in the light/terrain reference frame.
 * Three's default world-space lookAt discards an affine mount's orientation
 * and metric. Preserve its projection conventions, then transform the complete
 * local camera through the same mount as the geometry, including shear/scale.
 */
export const configureMountedShadowCamera = (
  light: DirectionalLight,
  enabled: () => boolean
): (() => void) => {
  const shadow = light.shadow;
  const camera = shadow.camera;
  const original = shadow.updateMatrices;
  const auto = camera.matrixAutoUpdate;
  const worldAuto = camera.matrixWorldAutoUpdate;
  const originalWorld = new Matrix4();
  const localCamera = new Matrix4();
  const projectionView = new Matrix4();
  const inverseMount = new Matrix4();
  const target = new Vector3();
  const up = new Vector3(0, 1, 0);

  shadow.updateMatrices = function (source) {
    camera.matrixAutoUpdate = auto;
    camera.matrixWorldAutoUpdate = worldAuto;
    original.call(this, source);
    const mount = light.parent;
    if (source !== light || !mount || !enabled()) return;
    mount.updateWorldMatrix(true, false);
    inverseMount.copy(mount.matrixWorld).invert();
    light.target.getWorldPosition(target).applyMatrix4(inverseMount);
    localCamera.lookAt(light.position, target, up).setPosition(light.position);
    originalWorld.copy(camera.matrixWorld);
    camera.matrixWorld.multiplyMatrices(mount.matrixWorld, localCamera);
    camera.matrix.copy(camera.matrixWorld);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    camera.position.setFromMatrixPosition(camera.matrixWorld);
    camera.matrixAutoUpdate = false;
    camera.matrixWorldAutoUpdate = false;
    // Reuse Three's clip-to-texture convention, including reversed depth.
    shadow.matrix.multiply(originalWorld).multiply(camera.matrixWorldInverse);
    projectionView.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    shadow
      .getFrustum()
      .setFromProjectionMatrix(
        projectionView,
        camera.coordinateSystem,
        camera.reversedDepth
      );
  };
  return () => {
    shadow.updateMatrices = original;
    camera.matrixAutoUpdate = auto;
    camera.matrixWorldAutoUpdate = worldAuto;
  };
};
