import { quantize } from "@carma-commons/math";
import type { SharedThreeSceneShadowView } from "./shared-three-scene-types";

export const getSharedThreeShadowViewSignature = (
  view: SharedThreeSceneShadowView | null
): string => {
  if (!view) return "";
  const { camera, shadowMapSize } = view;
  camera.updateMatrixWorld(true);
  return [
    quantize(camera.position.x, 0.25),
    quantize(camera.position.y, 0.25),
    quantize(camera.position.z, 0.25),
    quantize(camera.quaternion.x, 0.0001),
    quantize(camera.quaternion.y, 0.0001),
    quantize(camera.quaternion.z, 0.0001),
    quantize(camera.quaternion.w, 0.0001),
    ...camera.projectionMatrix.elements.map((value) => quantize(value, 0.0001)),
    `${shadowMapSize.width}x${shadowMapSize.height}`,
    view.casterAngularRadiusRadians ?? 0,
  ].join(",");
};
