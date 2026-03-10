import { useMemo } from "react";

import {
  buildDesiredPointLabelAnchorById,
  formatNumber,
  type DerivedPolylinePath,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import type { PointMarkerBadgeState } from "./usePointMarkerBadgeState";
import type { StandaloneDistancePointState } from "./useStandaloneDistancePointState";

export const usePointLabelAnchorState = (
  pointEntries: readonly PointAnnotationEntry[],
  polylines: readonly DerivedPolylinePath[],
  focusedPlanarMeasurementId: string | null,
  pointMarkerBadgeByPointId: PointMarkerBadgeState["pointMarkerBadgeByPointId"],
  standaloneDistancePointState: StandaloneDistancePointState
) =>
  useMemo(
    () =>
      buildDesiredPointLabelAnchorById({
        pointMeasurements: pointEntries,
        polylines,
        focusedPlanarMeasurementId,
        pointMarkerBadgeByPointId,
        standaloneDistanceHighestPointIds:
          standaloneDistancePointState.standaloneDistanceHighestPointIds,
        unfocusedStandaloneDistanceNonHighestPointIds:
          standaloneDistancePointState.unfocusedStandaloneDistanceNonHighestPointIds,
        focusedStandaloneDistanceNonHighestPointIds:
          standaloneDistancePointState.focusedStandaloneDistanceNonHighestPointIds,
        formatDistanceLabel: formatNumber,
      }),
    [
      focusedPlanarMeasurementId,
      pointEntries,
      pointMarkerBadgeByPointId,
      polylines,
      standaloneDistancePointState.focusedStandaloneDistanceNonHighestPointIds,
      standaloneDistancePointState.standaloneDistanceHighestPointIds,
      standaloneDistancePointState.unfocusedStandaloneDistanceNonHighestPointIds,
    ]
  );
