import { buildVerticalAreaLabelText } from "@carma-mapping/annotations/core";
import { type VerticalAreaLabelVisualizerOptions } from "./areaLabelVisualizer.types";
import { useAreaLabelVisualizerBase } from "./useAreaLabelVisualizerBase";

const VERTICAL_AREA_OVERLAY_PREFIX = "distance-vertical-polygon-preview";

export const useVerticalAreaLabelVisualizer = ({
  viewProjector,
  focusedPolygonGroupId,
  polygonAreaBadgeByGroupId,
  verticalPolygonPreviewGroups,
}: VerticalAreaLabelVisualizerOptions) => {
  useAreaLabelVisualizerBase({
    overlayPrefix: VERTICAL_AREA_OVERLAY_PREFIX,
    viewProjector,
    polygonPreviewGroups: verticalPolygonPreviewGroups,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText: buildVerticalAreaLabelText,
  });
};
