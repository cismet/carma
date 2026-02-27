import { useMemo } from "react";

import { buildPlanarPolygonPreviewGroups } from "@carma-mapping/annotations/core";

import {
  type PlanarPolygonGroup,
  type PointMeasurementEntry,
} from "../types/MeasurementTypes";
import { type DistanceLivePreviewLine } from "./areaPreviewModel.types";

export const usePlanarAreaPreviewModel = ({
  planarPolygonGroups,
  pointsById,
  facadeRectanglePreviewOppositeByGroupId,
  activePlanarPolygonGroupId,
  livePreviewDistanceLine,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  pointsById: ReadonlyMap<string, PointMeasurementEntry>;
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, PointMeasurementEntry["geometryECEF"]>
  >;
  activePlanarPolygonGroupId: string | null;
  livePreviewDistanceLine: DistanceLivePreviewLine | null;
}) => {
  const planarPolygonPreviewGroups = useMemo(
    () =>
      buildPlanarPolygonPreviewGroups({
        planarPolygonGroups,
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
        activePlanarPolygonGroupId,
        livePreviewDistanceLine,
      }),
    [
      activePlanarPolygonGroupId,
      facadeRectanglePreviewOppositeByGroupId,
      livePreviewDistanceLine,
      planarPolygonGroups,
      pointsById,
    ]
  );

  return {
    planarPolygonPreviewGroups,
  };
};
