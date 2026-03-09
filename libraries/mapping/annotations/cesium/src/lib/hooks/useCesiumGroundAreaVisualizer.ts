import { useGroundAreaLabelVisualizer } from "@carma-mapping/annotations/core";

import { type GroundAreaVisualizerOptions } from "./areaVisualizer.types";
import { useCesiumPolygonAreaPrimitives } from "./useCesiumPolygonAreaPrimitives";
import { useCesiumAreaLabelViewProjector } from "./utils/useCesiumAreaLabelViewProjector";

export const useCesiumGroundAreaVisualizer = (
  options: GroundAreaVisualizerOptions
) => {
  const {
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    groundPolygonPreviewGroups,
  } = options;
  const viewProjector = useCesiumAreaLabelViewProjector(scene);

  useGroundAreaLabelVisualizer({
    viewProjector,
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
