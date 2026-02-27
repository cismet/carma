import { useMemo } from "react";

import { buildPolylinePreviewMeasurements } from "@carma-mapping/annotations/core";

import {
  type PlanarPolygonGroup,
  type PointMeasurementEntry,
} from "../types/MeasurementTypes";

export const usePolylinePreviewModel = ({
  planarPolygonGroups,
  pointsById,
  facadeRectanglePreviewOppositeByGroupId,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  pointsById: ReadonlyMap<string, PointMeasurementEntry>;
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, PointMeasurementEntry["geometryECEF"]>
  >;
}) => {
  const polylineMeasurements = useMemo(
    () =>
      buildPolylinePreviewMeasurements({
        planarPolygonGroups,
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
      }),
    [facadeRectanglePreviewOppositeByGroupId, planarPolygonGroups, pointsById]
  );

  return {
    polylineMeasurements,
  };
};
