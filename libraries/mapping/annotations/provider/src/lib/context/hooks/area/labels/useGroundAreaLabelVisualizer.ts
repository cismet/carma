import { buildGroundAreaLabelText } from "@carma-mapping/annotations/core";
import { type GroundAreaLabelVisualizerOptions } from "./areaLabelVisualizer.types";
import { useAreaLabelVisualizerBase } from "./useAreaLabelVisualizerBase";

const GROUND_AREA_OVERLAY_PREFIX = "distance-ground-polygon-preview";

export const useGroundAreaLabelVisualizer = ({
  viewProjector,
  focusedPolygonGroupId,
  polygonAreaBadgeByGroupId,
  groundPolygonPreviewGroups,
}: GroundAreaLabelVisualizerOptions) => {
  useAreaLabelVisualizerBase({
    overlayPrefix: GROUND_AREA_OVERLAY_PREFIX,
    viewProjector,
    polygonPreviewGroups: groundPolygonPreviewGroups,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText: buildGroundAreaLabelText,
  });
};
