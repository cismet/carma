import { useMemo } from "react";

import {
  type PlanarPolygonGroup,
  type PointMeasurementEntry,
} from "../types/MeasurementTypes";
import { buildDistanceRelationRenderContext } from "./measurementVisualizationContext";

export const useDistancePreviewModel = ({
  planarPolygonGroups,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
  pointsById,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  pointsById: ReadonlyMap<string, PointMeasurementEntry>;
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
