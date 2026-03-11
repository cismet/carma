import { useMemo } from "react";

import type { NodeChainAnnotation } from "@carma-mapping/annotations/core";

export const useClosedAreaSelectionState = (
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  focusedNodeChainAnnotationId: string | null,
  activeNodeChainAnnotationId: string | null
) => {
  const selectedClosedAreaGroupIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (!focusedNodeChainAnnotationId && !activeNodeChainAnnotationId) {
      return ids;
    }

    nodeChainAnnotations.forEach((group) => {
      if (!group.closed) {
        return;
      }
      if (
        group.id === focusedNodeChainAnnotationId ||
        group.id === activeNodeChainAnnotationId
      ) {
        ids.add(group.id);
      }
    });
    return ids;
  }, [
    activeNodeChainAnnotationId,
    focusedNodeChainAnnotationId,
    nodeChainAnnotations,
  ]);

  const closedAreaNodeIdSet = useMemo(() => {
    const ids = new Set<string>();
    nodeChainAnnotations.forEach((group) => {
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
  }, [nodeChainAnnotations]);

  const selectedClosedAreaNodeIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (selectedClosedAreaGroupIdSet.size === 0) {
      return ids;
    }

    nodeChainAnnotations.forEach((group) => {
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
  }, [nodeChainAnnotations, selectedClosedAreaGroupIdSet]);

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
