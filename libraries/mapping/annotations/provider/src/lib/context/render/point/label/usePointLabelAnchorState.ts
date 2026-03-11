import { useMemo } from "react";

import {
  buildDesiredPointLabelAnchorById,
  formatNumber,
  type DerivedPolylinePath,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import type { PointMarkerBadgeState } from "./usePointMarkerBadgeState";
import type { StandaloneDistancePointState } from "./useStandaloneDistancePointState";

export const derivePointLabelAnchors = (
  pointEntries: readonly PointAnnotationEntry[],
  polylines: readonly DerivedPolylinePath[],
  focusedNodeChainAnnotationId: string | null,
  pointMarkerBadgeByPointId: PointMarkerBadgeState["pointMarkerBadgeByPointId"],
  standaloneDistancePointState: StandaloneDistancePointState
) =>
  buildDesiredPointLabelAnchorById({
    pointMeasurements: pointEntries,
    polylines,
    focusedNodeChainAnnotationId,
    pointMarkerBadgeByPointId,
    standaloneDistanceHighestPointIds:
      standaloneDistancePointState.standaloneDistanceHighestPointIds,
    unfocusedStandaloneDistanceNonHighestPointIds:
      standaloneDistancePointState.unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds:
      standaloneDistancePointState.focusedStandaloneDistanceNonHighestPointIds,
    formatDistanceLabel: formatNumber,
  });

export const usePointLabelAnchorState = (
  pointEntries: readonly PointAnnotationEntry[],
  polylines: readonly DerivedPolylinePath[],
  focusedNodeChainAnnotationId: string | null,
  pointMarkerBadgeByPointId: PointMarkerBadgeState["pointMarkerBadgeByPointId"],
  standaloneDistancePointState: StandaloneDistancePointState
) =>
  useMemo(
    () =>
      derivePointLabelAnchors(
        pointEntries,
        polylines,
        focusedNodeChainAnnotationId,
        pointMarkerBadgeByPointId,
        standaloneDistancePointState
      ),
    [
      focusedNodeChainAnnotationId,
      pointEntries,
      pointMarkerBadgeByPointId,
      polylines,
      standaloneDistancePointState.focusedStandaloneDistanceNonHighestPointIds,
      standaloneDistancePointState.standaloneDistanceHighestPointIds,
      standaloneDistancePointState.unfocusedStandaloneDistanceNonHighestPointIds,
    ]
  );
