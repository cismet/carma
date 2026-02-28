import { buildPlanarAreaLabelText } from "./areaLabelTextBuilders";
import { type PlanarAreaLabelVisualizerOptions } from "./areaLabelVisualizer.types";
import { useAreaLabelVisualizerBase } from "./useAreaLabelVisualizerBase";

const PLANAR_AREA_OVERLAY_PREFIX = "distance-planar-polygon-preview";

export const usePlanarAreaLabelVisualizer = ({
  scene,
  focusedPolygonGroupId,
  polygonAreaBadgeByGroupId,
  planarPolygonPreviewGroups,
}: PlanarAreaLabelVisualizerOptions) => {
  useAreaLabelVisualizerBase({
    overlayPrefix: PLANAR_AREA_OVERLAY_PREFIX,
    scene,
    polygonPreviewGroups: planarPolygonPreviewGroups,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText: buildPlanarAreaLabelText,
  });
};
