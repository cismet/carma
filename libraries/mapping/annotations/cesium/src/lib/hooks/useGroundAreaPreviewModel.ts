import { useMemo } from "react";

import { buildGroundPolygonPreviewGroups } from "@carma-mapping/annotations/core";

import {
  type PlanarPolygonGroup,
  type PointAnnotationEntry,
} from "../types/AnnotationTypes";
import { type DistanceLivePreviewLine } from "./areaPreviewModel.types";

export const useGroundAreaPreviewModel = ({
  planarPolygonGroups,
  pointsById,
  facadeRectanglePreviewOppositeByGroupId,
  activePlanarPolygonGroupId,
  livePreviewDistanceLine,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  pointsById: ReadonlyMap<string, PointAnnotationEntry>;
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, PointAnnotationEntry["geometryECEF"]>
  >;
  activePlanarPolygonGroupId: string | null;
  livePreviewDistanceLine: DistanceLivePreviewLine | null;
}) => {
  const groundPolygonPreviewGroups = useMemo(
    () =>
      buildGroundPolygonPreviewGroups({
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
    groundPolygonPreviewGroups,
  };
};
