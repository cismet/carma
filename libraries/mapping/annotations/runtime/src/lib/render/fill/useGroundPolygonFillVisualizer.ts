import type { Scene } from "@carma/cesium";
import { useCesiumGroundPolygonPrimitives } from "@carma-mapping/engines/cesium/react/primitives";

import type { PolygonPrimitiveRenderModel } from "../scene/visualization.types";

export const useGroundPolygonFillVisualizer = (
  scene: Scene | null,
  groundPolygonPrimitives: readonly PolygonPrimitiveRenderModel[]
) => {
  useCesiumGroundPolygonPrimitives(scene, groundPolygonPrimitives);
};
