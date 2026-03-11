import { useMemo } from "react";

import {
  useAnnotationPointMarkerBadges,
  type AnnotationPointMarkerBadge,
} from "../../../render";
import type {
  NodeChainAnnotation,
  PointAnnotationEntry,
  PointDistanceRelation,
  PointMeasurementEntry,
} from "@carma-mapping/annotations/core";

export const usePointMarkerBadgeState = (
  pointEntries: readonly PointAnnotationEntry[],
  pointMeasureEntries: readonly PointMeasurementEntry[],
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  distanceRelations: readonly PointDistanceRelation[]
) => {
  const pointMeasureOrderById = useMemo(
    () =>
      pointMeasureEntries
        .filter((measurement) => !measurement.auxiliaryLabelAnchor)
        .reduce<Record<string, number>>((orderById, measurement, index) => {
          orderById[measurement.id] = index + 1;
          return orderById;
        }, {}),
    [pointMeasureEntries]
  );

  const pointMarkerBadgeByPointId = useAnnotationPointMarkerBadges(
    pointEntries,
    nodeChainAnnotations,
    distanceRelations,
    pointMeasureOrderById
  );

  return {
    pointMarkerBadgeByPointId,
  } as const;
};

export type PointMarkerBadgeState = {
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
};
