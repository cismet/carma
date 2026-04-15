import { buildPlanarAreaLabelText } from "@carma-mapping/annotations/core";

import { type PlanarAreaLabelVisualizerOptions } from "./area-label-visualizer.types";
import type { AreaLabelViewProjector } from "./area-label-visualizer.types";
import { useAreaLabelVisualizerBase } from "./use-area-label-visualizer-base";
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
