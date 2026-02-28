import { useMemo } from "react";

import { buildVerticalPolygonPreviewGroups } from "@carma-mapping/annotations/core";

import {
  type PlanarPolygonGroup,
  type PointAnnotationEntry,
} from "../types/AnnotationTypes";
import { type DistanceLivePreviewLine } from "./areaPreviewModel.types";

export const useVerticalAreaPreviewModel = ({
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
  const verticalPolygonPreviewGroups = useMemo(
    () =>
      buildVerticalPolygonPreviewGroups({
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
    verticalPolygonPreviewGroups,
  };
};
