import type { NodeChainAnnotation } from "@carma-mapping/annotations/core";

export const findProtectedPolygonCandidateNodeIds = (
  selectedPointIds: ReadonlySet<string>,
  nodeChainAnnotations: readonly NodeChainAnnotation[]
): string[] | null => {
  const protectedPolygonCandidate = nodeChainAnnotations.find((group) => {
    if (!group.closed || group.nodeIds.length > 3) {
      return false;
    }

    const nodeIds = group.nodeIds.filter((nodeId): nodeId is string =>
      Boolean(nodeId)
    );
    if (nodeIds.length === 0) {
      return false;
    }

    const includesAnyNode = nodeIds.some((nodeId) =>
      selectedPointIds.has(nodeId)
    );
    if (!includesAnyNode) {
      return false;
    }

    const includesAllNodes = nodeIds.every((nodeId) =>
      selectedPointIds.has(nodeId)
    );

    return !includesAllNodes;
  });

  return protectedPolygonCandidate?.nodeIds ?? null;
};
