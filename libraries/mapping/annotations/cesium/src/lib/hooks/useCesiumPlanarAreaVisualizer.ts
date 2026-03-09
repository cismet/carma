import { usePlanarAreaLabelVisualizer } from "@carma-mapping/annotations/core";

import { type PlanarAreaVisualizerOptions } from "./areaVisualizer.types";
import { useCesiumPolygonAreaPrimitives } from "./useCesiumPolygonAreaPrimitives";
import { useCesiumAreaLabelViewProjector } from "./utils/useCesiumAreaLabelViewProjector";

export const useCesiumPlanarAreaVisualizer = (
  options: PlanarAreaVisualizerOptions
) => {
  const {
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    planarPolygonPreviewGroups,
  } = options;
  const viewProjector = useCesiumAreaLabelViewProjector(scene);

  usePlanarAreaLabelVisualizer({
    viewProjector,
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
