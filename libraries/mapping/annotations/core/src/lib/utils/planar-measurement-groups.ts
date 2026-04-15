import { ANNOTATION_TYPE_POLYLINE } from "../types/annotation-types";
import type { NodeChainAnnotation } from "../types/annotation-types";
export const getConnectedOpenPolylineGroupIds = (
  groups: readonly NodeChainAnnotation[],
  startGroupId: string
) => {
  const openGroups = groups.filter(
    (group): group is NodeChainAnnotation =>
      !group.closed && group.type === ANNOTATION_TYPE_POLYLINE
  );
  const startGroup = openGroups.find((group) => group.id === startGroupId);
  if (!startGroup) {
    return new Set<string>();
  }

  const groupById = new Map(openGroups.map((group) => [group.id, group]));
  const nodeIdsByGroupId = new Map(
    openGroups.map((group) => [group.id, new Set(group.nodeIds)])
  );

  const connectedIds = new Set<string>();
  const queue: string[] = [startGroupId];

  while (queue.length > 0) {
    const groupId = queue.shift();
    if (!groupId || connectedIds.has(groupId)) {
      continue;
    }

    const currentNodes = nodeIdsByGroupId.get(groupId);
    if (!currentNodes) {
      continue;
    }

    connectedIds.add(groupId);

    groupById.forEach((candidateGroup, candidateId) => {
      if (connectedIds.has(candidateId)) {
        return;
      }

      const candidateNodes = nodeIdsByGroupId.get(candidateId);
      if (!candidateNodes) {
        return;
      }

      const sharesNode = Array.from(currentNodes).some((nodeId) =>
        candidateNodes.has(nodeId)
      );
      if (sharesNode) {
        queue.push(candidateGroup.id);
      }
    });
  }

  return connectedIds;
};
