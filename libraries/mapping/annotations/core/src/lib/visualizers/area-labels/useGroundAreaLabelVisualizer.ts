import { buildGroundAreaLabelText } from "./areaLabelTextBuilders";
import { type GroundAreaLabelVisualizerOptions } from "./areaLabelVisualizer.types";
import { useAreaLabelVisualizerBase } from "./useAreaLabelVisualizerBase";

const GROUND_AREA_OVERLAY_PREFIX = "distance-ground-polygon-preview";

export const useGroundAreaLabelVisualizer = ({
  scene,
  focusedPolygonGroupId,
  polygonAreaBadgeByGroupId,
  groundPolygonPreviewGroups,
}: GroundAreaLabelVisualizerOptions) => {
  useAreaLabelVisualizerBase({
    overlayPrefix: GROUND_AREA_OVERLAY_PREFIX,
    scene,
    polygonPreviewGroups: groundPolygonPreviewGroups,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText: buildGroundAreaLabelText,
  });
};
