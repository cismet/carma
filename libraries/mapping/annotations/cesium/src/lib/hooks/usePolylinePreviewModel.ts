import { useMemo } from "react";

import { buildPolylinePreviewMeasurements } from "@carma-mapping/annotations/core";

import {
  type PlanarPolygonGroup,
  type PointAnnotationEntry,
} from "../types/AnnotationTypes";

export const usePolylinePreviewModel = ({
  planarPolygonGroups,
  pointsById,
  facadeRectanglePreviewOppositeByGroupId,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  pointsById: ReadonlyMap<string, PointAnnotationEntry>;
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, PointAnnotationEntry["geometryECEF"]>
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
