import { useVerticalAreaLabelVisualizer } from "@carma-mapping/annotations/core";

import { type VerticalAreaVisualizerOptions } from "./areaVisualizer.types";
import { useCesiumPolygonAreaPrimitives } from "./useCesiumPolygonAreaPrimitives";

export const useCesiumVerticalAreaVisualizer = (
  options: VerticalAreaVisualizerOptions
) => {
  const {
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    verticalPolygonPreviewGroups,
  } = options;

  useVerticalAreaLabelVisualizer({
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    verticalPolygonPreviewGroups,
  });

  useCesiumPolygonAreaPrimitives({
    scene,
    focusedPolygonGroupId,
    polygonPreviewGroups: verticalPolygonPreviewGroups,
  });
};
