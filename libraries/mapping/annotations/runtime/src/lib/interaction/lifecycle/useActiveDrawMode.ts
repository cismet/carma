import { useMemo } from "react";

import type { NodeChainAnnotation } from "@carma-mapping/annotations/core";

export const useActiveDrawMode = (
  activeNodeChainAnnotationId: string | null,
  nodeChainAnnotations: readonly NodeChainAnnotation[]
) =>
  useMemo(() => {
    if (!activeNodeChainAnnotationId) return false;

    return nodeChainAnnotations.some(
      (group) =>
        group.id === activeNodeChainAnnotationId &&
        !group.closed &&
        group.nodeIds.length > 0
    );
  }, [activeNodeChainAnnotationId, nodeChainAnnotations]);
