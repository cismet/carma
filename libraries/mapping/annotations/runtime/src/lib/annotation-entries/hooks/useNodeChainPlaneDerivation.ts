import { useCallback } from "react";

import {
  computePolygonGroupDerivedData,
  orientPlaneNormalTowardPosition,
  type NodeChainAnnotation,
  type PlanarPolygonPlane,
} from "@carma-mapping/annotations/core";
import { Cartesian3, type Scene } from "@carma-cesium";
import { isValidScene } from "@carma-mapping/engines/cesium/core";
export const useNodeChainPlaneDerivation = (scene: Scene) => {
  const getPreferredPlaneFacingPosition = useCallback((): Cartesian3 | null => {
    if (!isValidScene(scene)) return null;
    return scene.camera.positionWC;
  }, [scene]);

  const orientPlaneTowardSceneCamera = useCallback(
    (plane: PlanarPolygonPlane): PlanarPolygonPlane =>
      orientPlaneNormalTowardPosition(plane, getPreferredPlaneFacingPosition()),
    [getPreferredPlaneFacingPosition]
  );

  const computePolygonGroupDerivedDataWithCamera = useCallback(
    (group: NodeChainAnnotation, pointById: Map<string, Cartesian3>) =>
      computePolygonGroupDerivedData(group, pointById, {
        preferredFacingPositionECEF: getPreferredPlaneFacingPosition(),
      }),
    [getPreferredPlaneFacingPosition]
  );

  return {
    getPreferredPlaneFacingPosition,
    orientPlaneTowardSceneCamera,
    computePolygonGroupDerivedDataWithCamera,
  };
};
