import { buildGroundAreaLabelText } from "@carma-mapping/annotations/core";

import { type GroundAreaLabelVisualizerOptions } from "./area-label-visualizer.types";
import type { AreaLabelViewProjector } from "./area-label-visualizer.types";
import { useAreaLabelVisualizerBase } from "./use-area-label-visualizer-base";
const GROUND_AREA_OVERLAY_PREFIX = "distance-ground-polygon-preview";

export const useGroundAreaLabelVisualizer = (
  viewProjector: AreaLabelViewProjector,
  groundPolygonPreviewGroups: readonly import("@carma-mapping/annotations/core").PolygonPreviewGroup[],
  {
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
  }: GroundAreaLabelVisualizerOptions
) => {
  useAreaLabelVisualizerBase(viewProjector, groundPolygonPreviewGroups, {
    overlayPrefix: GROUND_AREA_OVERLAY_PREFIX,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText: buildGroundAreaLabelText,
  });
};
