import { useVerticalAreaLabelVisualizer } from "@carma-mapping/annotations/core";

import { type VerticalAreaVisualizerOptions } from "./areaVisualizer.types";
import { useCesiumPolygonAreaPrimitives } from "./useCesiumPolygonAreaPrimitives";
import { useCesiumAreaLabelViewProjector } from "./utils/useCesiumAreaLabelViewProjector";

export const useCesiumVerticalAreaVisualizer = (
  options: VerticalAreaVisualizerOptions
) => {
  const {
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    verticalPolygonPreviewGroups,
  } = options;
  const viewProjector = useCesiumAreaLabelViewProjector(scene);

  useVerticalAreaLabelVisualizer({
    viewProjector,
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
