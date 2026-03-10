import { useMemo } from "react";

import {
  collectCollapsedPillPointIds,
  collectLabelAnchorPointIdsWithForcedVisibility,
  collectPointIdsWithoutSelfLabelAnchor,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";

export const usePointLabelVisibilityState = (
  pointEntries: readonly PointAnnotationEntry[],
  unselectedClosedAreaNodeIdSet: ReadonlySet<string>
) => {
  const collapsedPillPointIds = useMemo(
    () => collectCollapsedPillPointIds(pointEntries),
    [pointEntries]
  );
  const pointIdsWithoutLabelAnchor = useMemo(
    () => collectPointIdsWithoutSelfLabelAnchor(pointEntries),
    [pointEntries]
  );
  const labelAnchorPointIdsWithForcedVisibility = useMemo(
    () =>
      collectLabelAnchorPointIdsWithForcedVisibility(
        pointEntries,
        unselectedClosedAreaNodeIdSet
      ),
    [pointEntries, unselectedClosedAreaNodeIdSet]
  );

  return {
    collapsedPillPointIds,
    pointIdsWithoutLabelAnchor,
    labelAnchorPointIdsWithForcedVisibility,
  } as const;
};
