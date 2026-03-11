import { useMemo } from "react";

import type { NodeChainAnnotation } from "@carma-mapping/annotations/core";

export const useActiveDrawModeState = (
  doubleClickChainSourcePointId: string | null,
  selectablePointIds: ReadonlySet<string>,
  activeNodeChainAnnotationId: string | null,
  nodeChainAnnotations: NodeChainAnnotation[]
) =>
  useMemo(() => {
    if (!doubleClickChainSourcePointId) return false;
    if (!selectablePointIds.has(doubleClickChainSourcePointId)) return false;
    if (!activeNodeChainAnnotationId) return false;
    return nodeChainAnnotations.some(
      (group) => group.id === activeNodeChainAnnotationId && !group.closed
    );
  }, [
    activeNodeChainAnnotationId,
    doubleClickChainSourcePointId,
    nodeChainAnnotations,
    selectablePointIds,
  ]);
