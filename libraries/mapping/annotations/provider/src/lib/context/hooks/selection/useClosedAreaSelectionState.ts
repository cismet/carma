import { useMemo } from "react";

import type { PlanarMeasurementGroup } from "@carma-mapping/annotations/core";

export const useClosedAreaSelectionState = (
  planarPolygonGroups: readonly PlanarMeasurementGroup[],
  focusedPlanarMeasurementId: string | null,
  activePlanarMeasurementId: string | null
) => {
  const selectedClosedAreaGroupIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (!focusedPlanarMeasurementId && !activePlanarMeasurementId) {
      return ids;
    }

    planarPolygonGroups.forEach((group) => {
      if (!group.closed) {
        return;
      }
      if (
        group.id === focusedPlanarMeasurementId ||
        group.id === activePlanarMeasurementId
      ) {
        ids.add(group.id);
      }
    });
    return ids;
  }, [
    activePlanarMeasurementId,
    focusedPlanarMeasurementId,
    planarPolygonGroups,
  ]);

  const closedAreaNodeIdSet = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      if (!group.closed) {
        return;
      }
      group.nodeIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups]);

  const selectedClosedAreaNodeIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (selectedClosedAreaGroupIdSet.size === 0) {
      return ids;
    }

    planarPolygonGroups.forEach((group) => {
      if (!group.closed || !selectedClosedAreaGroupIdSet.has(group.id)) {
        return;
      }
      group.nodeIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups, selectedClosedAreaGroupIdSet]);

  const unselectedClosedAreaNodeIdSet = useMemo(() => {
    const ids = new Set<string>();
    closedAreaNodeIdSet.forEach((pointId) => {
      if (!selectedClosedAreaNodeIdSet.has(pointId)) {
        ids.add(pointId);
      }
    });
    return ids;
  }, [closedAreaNodeIdSet, selectedClosedAreaNodeIdSet]);

  return {
    unselectedClosedAreaNodeIdSet,
  };
};
