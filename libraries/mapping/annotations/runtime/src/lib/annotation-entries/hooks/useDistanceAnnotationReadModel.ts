import { useMemo } from "react";

import type { PointDistanceRelation } from "@carma-mapping/annotations/core";
import { type Cartesian3 } from "@carma/cesium";

import { useAnnotationsStore, useStoreSelector } from "../../store";
export type DistanceAnnotationReadModel = {
  referencePoint: Cartesian3 | null;
  distanceRelations: PointDistanceRelation[];
};

export const useDistanceAnnotationReadModel =
  (): DistanceAnnotationReadModel => {
    const annotationsStore = useAnnotationsStore(
      "useDistanceAnnotationReadModel"
    );
    const referencePoint = useStoreSelector(
      annotationsStore,
      (state) => state.referencePoint
    );
    const distanceRelations = useStoreSelector(
      annotationsStore,
      (state) => state.distanceRelations
    );

    return useMemo(
      () => ({
        referencePoint,
        distanceRelations,
      }),
      [distanceRelations, referencePoint]
    );
  };
