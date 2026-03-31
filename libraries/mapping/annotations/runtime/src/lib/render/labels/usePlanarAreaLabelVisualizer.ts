import { buildPlanarAreaLabelText } from "@carma-mapping/annotations/core";

import { type PlanarAreaLabelVisualizerOptions } from "./areaLabelVisualizer.types";
import type { AreaLabelViewProjector } from "./areaLabelVisualizer.types";
import { useAreaLabelVisualizerBase } from "./useAreaLabelVisualizerBase";
const PLANAR_AREA_OVERLAY_PREFIX = "distance-planar-polygon-preview";

export const usePlanarAreaLabelVisualizer = (
  viewProjector: AreaLabelViewProjector,
  planarPolygonPreviewGroups: readonly import("@carma-mapping/annotations/core").PolygonPreviewGroup[],
  {
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
  }: PlanarAreaLabelVisualizerOptions
) => {
  useAreaLabelVisualizerBase(viewProjector, planarPolygonPreviewGroups, {
    overlayPrefix: PLANAR_AREA_OVERLAY_PREFIX,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText: buildPlanarAreaLabelText,
  });
};
