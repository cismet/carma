import { buildVerticalAreaLabelText } from "./areaLabelTextBuilders";
import { type VerticalAreaLabelVisualizerOptions } from "./areaLabelVisualizer.types";
import { useAreaLabelVisualizerBase } from "./useAreaLabelVisualizerBase";

const VERTICAL_AREA_OVERLAY_PREFIX = "distance-vertical-polygon-preview";

export const useVerticalAreaLabelVisualizer = ({
  scene,
  focusedPolygonGroupId,
  polygonAreaBadgeByGroupId,
  verticalPolygonPreviewGroups,
}: VerticalAreaLabelVisualizerOptions) => {
  useAreaLabelVisualizerBase({
    overlayPrefix: VERTICAL_AREA_OVERLAY_PREFIX,
    scene,
    polygonPreviewGroups: verticalPolygonPreviewGroups,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText: buildVerticalAreaLabelText,
  });
};
