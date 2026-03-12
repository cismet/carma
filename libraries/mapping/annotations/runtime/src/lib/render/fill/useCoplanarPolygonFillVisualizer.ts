import type { Scene } from "@carma/cesium";
import { useCesiumCoplanarPolygonPrimitives } from "@carma-mapping/annotations/cesium";

import type { PolygonPrimitiveRenderModel } from "../scene/visualization.types";

export type CoplanarPolygonFillRenderModels = {
  verticalPolygonPrimitives: readonly PolygonPrimitiveRenderModel[];
  planarPolygonPrimitives: readonly PolygonPrimitiveRenderModel[];
};

export const useCoplanarPolygonFillVisualizer = (
  scene: Scene | null,
  {
    verticalPolygonPrimitives,
    planarPolygonPrimitives,
  }: CoplanarPolygonFillRenderModels
) => {
  useCesiumCoplanarPolygonPrimitives(scene, verticalPolygonPrimitives);
  useCesiumCoplanarPolygonPrimitives(scene, planarPolygonPrimitives);
};
