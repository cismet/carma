import { useMemo } from "react";

import {
  type PlanarPolygonGroup,
  type PointAnnotationEntry,
} from "../types/AnnotationTypes";
import { buildDistanceRelationRenderContext } from "./annotationVisualizationContext";

export const useDistancePreviewModel = ({
  planarPolygonGroups,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
  pointsById,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  pointsById: ReadonlyMap<string, PointAnnotationEntry>;
}) => {
  const distanceRelationRenderContext = useMemo(
    () =>
      buildDistanceRelationRenderContext({
        planarPolygonGroups,
        selectedPlanarPolygonGroupId,
        activePlanarPolygonGroupId,
        pointsById,
      }),
    [
      activePlanarPolygonGroupId,
      planarPolygonGroups,
      pointsById,
      selectedPlanarPolygonGroupId,
    ]
  );

  return {
    distanceRelationRenderContext,
  };
};
