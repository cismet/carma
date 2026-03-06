import { usePlanarAreaLabelVisualizer } from "@carma-mapping/annotations/core";

import { type PlanarAreaVisualizerOptions } from "./areaVisualizer.types";
import { useCesiumPolygonAreaPrimitives } from "./useCesiumPolygonAreaPrimitives";

export const useCesiumPlanarAreaVisualizer = (
  options: PlanarAreaVisualizerOptions
) => {
  const {
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    planarPolygonPreviewGroups,
  } = options;

  usePlanarAreaLabelVisualizer({
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    planarPolygonPreviewGroups,
  });

  useCesiumPolygonAreaPrimitives({
    scene,
    focusedPolygonGroupId,
    polygonPreviewGroups: planarPolygonPreviewGroups,
  });
};
