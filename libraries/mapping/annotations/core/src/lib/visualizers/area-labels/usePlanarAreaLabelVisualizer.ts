import { buildPlanarAreaLabelText } from "./areaLabelTextBuilders";
import { type PlanarAreaLabelVisualizerOptions } from "./areaLabelVisualizer.types";
import { useAreaLabelVisualizerBase } from "./useAreaLabelVisualizerBase";

const PLANAR_AREA_OVERLAY_PREFIX = "distance-planar-polygon-preview";

export const usePlanarAreaLabelVisualizer = ({
  viewProjector,
  focusedPolygonGroupId,
  polygonAreaBadgeByGroupId,
  planarPolygonPreviewGroups,
}: PlanarAreaLabelVisualizerOptions) => {
  useAreaLabelVisualizerBase({
    overlayPrefix: PLANAR_AREA_OVERLAY_PREFIX,
    viewProjector,
    polygonPreviewGroups: planarPolygonPreviewGroups,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText: buildPlanarAreaLabelText,
  });
};
