import type {
  RuntimeLinkedNodeGroup,
  RuntimeLinkedNodeGroupId,
  RuntimeNode,
} from "./annotationsStore.types";

export type LegacyRuntimeNodeWithLinkedGroupId = RuntimeNode & {
  linkedNodeGroupId?: RuntimeLinkedNodeGroupId;
};

export const buildLinkedNodeGroupIdByNodeId = (
  linkedNodeGroups: readonly RuntimeLinkedNodeGroup[]
) =>
  new Map(
    linkedNodeGroups.flatMap((linkedNodeGroup) =>
      linkedNodeGroup.nodeIds.map(
        (nodeId) => [nodeId, linkedNodeGroup.id] as const
      )
    )
  );

export const resolveLinkedNodeGroupIdForNodeId = (
  linkedNodeGroups: readonly RuntimeLinkedNodeGroup[],
  nodeId: string
) => buildLinkedNodeGroupIdByNodeId(linkedNodeGroups).get(nodeId) ?? null;

export const resolveLinkedNodeGroupNodeIds = (
  linkedNodeGroups: readonly RuntimeLinkedNodeGroup[],
  nodeId: string
) =>
  linkedNodeGroups.find((linkedNodeGroup) =>
    linkedNodeGroup.nodeIds.includes(nodeId)
  )?.nodeIds ?? [nodeId];

export const reconcileLinkedNodeGroups = ({
  nodes,
  linkedNodeGroups,
}: {
  nodes: readonly RuntimeNode[];
  linkedNodeGroups: readonly RuntimeLinkedNodeGroup[];
}): RuntimeLinkedNodeGroup[] => {
  const validNodeIdSet = new Set(nodes.map((node) => node.id));
  const normalizedLinkedNodeGroups = linkedNodeGroups
    .map((linkedNodeGroup) => ({
      ...linkedNodeGroup,
      nodeIds: Array.from(
        new Set(
          linkedNodeGroup.nodeIds.filter((nodeId) => validNodeIdSet.has(nodeId))
        )
      ),
    }))
    .filter((linkedNodeGroup) => linkedNodeGroup.nodeIds.length > 0);

  const assignedNodeIdSet = new Set(
    normalizedLinkedNodeGroups.flatMap((linkedNodeGroup) => linkedNodeGroup.nodeIds)
  );
  const fallbackSingletonGroups = nodes
    .filter((node) => !assignedNodeIdSet.has(node.id))
    .map((node) => ({
      id: node.id,
      nodeIds: [node.id],
    }));

  return [...normalizedLinkedNodeGroups, ...fallbackSingletonGroups];
};

export const buildLinkedNodeGroupsFromLegacyNodes = (
  nodes: readonly LegacyRuntimeNodeWithLinkedGroupId[]
): RuntimeLinkedNodeGroup[] => {
  const nodeIdsByGroupId = new Map<RuntimeLinkedNodeGroupId, string[]>();

  nodes.forEach((node) => {
    const linkedNodeGroupId =
      typeof node.linkedNodeGroupId === "string" &&
      node.linkedNodeGroupId.trim().length > 0
        ? node.linkedNodeGroupId.trim()
        : node.id;
    const existingNodeIds = nodeIdsByGroupId.get(linkedNodeGroupId) ?? [];
    existingNodeIds.push(node.id);
    nodeIdsByGroupId.set(linkedNodeGroupId, existingNodeIds);
  });

  return [...nodeIdsByGroupId.entries()].map(([id, nodeIds]) => ({
    id,
    nodeIds,
  }));
};
