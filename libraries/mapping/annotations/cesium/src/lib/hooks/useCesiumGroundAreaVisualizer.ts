import { useGroundAreaLabelVisualizer } from "@carma-mapping/annotations/core";

import { type GroundAreaVisualizerOptions } from "./areaVisualizer.types";
import { useCesiumPolygonAreaPrimitives } from "./useCesiumPolygonAreaPrimitives";

export const useCesiumGroundAreaVisualizer = (
  options: GroundAreaVisualizerOptions
) => {
  const {
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    groundPolygonPreviewGroups,
  } = options;

  useGroundAreaLabelVisualizer({
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    groundPolygonPreviewGroups,
  });

  useCesiumPolygonAreaPrimitives({
    scene,
    focusedPolygonGroupId,
    polygonPreviewGroups: groundPolygonPreviewGroups,
  });
};
