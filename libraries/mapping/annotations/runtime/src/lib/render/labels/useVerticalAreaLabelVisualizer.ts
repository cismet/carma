import { buildVerticalAreaLabelText } from "@carma-mapping/annotations/core";

import { type VerticalAreaLabelVisualizerOptions } from "./areaLabelVisualizer.types";
import type { AreaLabelViewProjector } from "./areaLabelVisualizer.types";
import { useAreaLabelVisualizerBase } from "./useAreaLabelVisualizerBase";
const VERTICAL_AREA_OVERLAY_PREFIX = "distance-vertical-polygon-preview";

export const useVerticalAreaLabelVisualizer = (
  viewProjector: AreaLabelViewProjector,
  verticalPolygonPreviewGroups: readonly import("@carma-mapping/annotations/core").PolygonPreviewGroup[],
  {
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
  }: VerticalAreaLabelVisualizerOptions
) => {
  useAreaLabelVisualizerBase(viewProjector, verticalPolygonPreviewGroups, {
    overlayPrefix: VERTICAL_AREA_OVERLAY_PREFIX,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText: buildVerticalAreaLabelText,
  });
};
