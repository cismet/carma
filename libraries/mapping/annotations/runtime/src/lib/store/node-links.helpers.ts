import type {
  CesiumGeographicCoordinate,
  AnnotationNodeLink,
  AnnotationNodeLinkId,
  AnnotationNodeId,
  AnnotationNode,
} from "./annotations-store.types";

export type LegacyAnnotationNodeWithLinkedGroupId = AnnotationNode & {
  linkedNodeGroupId?: AnnotationNodeLinkId;
};

export const buildNodeLinkIdByNodeId = (
  nodeLinks: readonly AnnotationNodeLink[]
) =>
  new Map(
    nodeLinks.flatMap((nodeLink) =>
      nodeLink.nodeIds.map((nodeId) => [nodeId, nodeLink.id] as const)
    )
  );

export const resolveNodeLinkIdForNodeId = (
  nodeLinks: readonly AnnotationNodeLink[],
  nodeId: string
) => buildNodeLinkIdByNodeId(nodeLinks).get(nodeId) ?? null;

export const resolveNodeLinkNodeIds = (
  nodeLinks: readonly AnnotationNodeLink[],
  nodeId: string
) =>
  nodeLinks.find((nodeLink) => nodeLink.nodeIds.includes(nodeId))?.nodeIds ?? [
    nodeId,
  ];

export const reconcileNodeLinks = ({
  nodes,
  nodeLinks,
}: {
  nodes: readonly AnnotationNode[];
  nodeLinks: readonly AnnotationNodeLink[];
}): AnnotationNodeLink[] => {
  const validNodeIdSet = new Set(nodes.map((node) => node.id));
  const normalizedNodeLinks = nodeLinks
    .map((nodeLink) => ({
      ...nodeLink,
      nodeIds: Array.from(
        new Set(nodeLink.nodeIds.filter((nodeId) => validNodeIdSet.has(nodeId)))
      ),
    }))
    .filter((nodeLink) => nodeLink.nodeIds.length > 0);

  const assignedNodeIdSet = new Set(
    normalizedNodeLinks.flatMap((nodeLink) => nodeLink.nodeIds)
  );
  const fallbackSingletonGroups = nodes
    .filter((node) => !assignedNodeIdSet.has(node.id))
    .map((node) => ({
      id: node.id,
      nodeIds: [node.id],
    }));

  return [...normalizedNodeLinks, ...fallbackSingletonGroups];
};

const EARTH_RADIUS_METERS = 6_378_137;
const NODE_LINK_DETACH_EPSILON_METERS = 0.1;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const resolveCoordinateDistanceMeters = (
  left: CesiumGeographicCoordinate,
  right: CesiumGeographicCoordinate
) => {
  const deltaLatitudeRad = toRadians(right.latitude - left.latitude);
  const deltaLongitudeRad = toRadians(right.longitude - left.longitude);
  const meanLatitudeRad = toRadians((left.latitude + right.latitude) / 2);
  const horizontalEastMeters =
    deltaLongitudeRad * Math.cos(meanLatitudeRad) * EARTH_RADIUS_METERS;
  const horizontalNorthMeters = deltaLatitudeRad * EARTH_RADIUS_METERS;
  const deltaAltitudeMeters = right.altitude - left.altitude;

  return Math.hypot(
    horizontalEastMeters,
    horizontalNorthMeters,
    deltaAltitudeMeters
  );
};

const normalizeNodeId = (nodeId?: string | null) =>
  typeof nodeId === "string" && nodeId.trim().length > 0 ? nodeId.trim() : null;

export const resolveNextNodeLinksForNodeMove = ({
  nodes,
  nodeLinks,
  nodeId,
  movedNodeIds,
  linkToNodeId,
}: {
  nodes: readonly AnnotationNode[];
  nodeLinks: readonly AnnotationNodeLink[];
  nodeId: AnnotationNodeId;
  movedNodeIds: readonly AnnotationNodeId[];
  linkToNodeId?: AnnotationNodeId | null;
}): AnnotationNodeLink[] => {
  const targetNode = nodes.find((node) => node.id === nodeId) ?? null;
  const normalizedMovedNodeIds = Array.from(
    new Set(movedNodeIds.filter(Boolean))
  );
  if (!targetNode || normalizedMovedNodeIds.length === 0) {
    return [...nodeLinks];
  }

  const movedNodeIdSet = new Set(normalizedMovedNodeIds);
  const targetNodeLink =
    nodeLinks.find((nodeLink) => nodeLink.nodeIds.includes(nodeId)) ?? null;
  const normalizedLinkToNodeId = normalizeNodeId(linkToNodeId);
  const linkTargetNodeLink =
    normalizedLinkToNodeId && !movedNodeIdSet.has(normalizedLinkToNodeId)
      ? nodeLinks.find((nodeLink) =>
          nodeLink.nodeIds.includes(normalizedLinkToNodeId)
        ) ?? null
      : null;

  if (
    linkTargetNodeLink &&
    !linkTargetNodeLink.nodeIds.some((linkedNodeId) =>
      movedNodeIdSet.has(linkedNodeId)
    )
  ) {
    return reconcileNodeLinks({
      nodes,
      nodeLinks: nodeLinks.map((nodeLink) =>
        nodeLink.id === linkTargetNodeLink.id
          ? {
              ...nodeLink,
              nodeIds: Array.from(
                new Set([...nodeLink.nodeIds, ...normalizedMovedNodeIds])
              ),
            }
          : {
              ...nodeLink,
              nodeIds: nodeLink.nodeIds.filter(
                (linkedNodeId) => !movedNodeIdSet.has(linkedNodeId)
              ),
            }
      ),
    });
  }

  if (
    !targetNodeLink ||
    normalizedMovedNodeIds.length === targetNodeLink.nodeIds.length
  ) {
    return [...nodeLinks];
  }

  const untouchedNodes = nodes.filter(
    (node) =>
      targetNodeLink.nodeIds.includes(node.id) && !movedNodeIdSet.has(node.id)
  );
  const shouldDetachMovedNodes = untouchedNodes.some(
    (untouchedNode) =>
      resolveCoordinateDistanceMeters(
        untouchedNode.coordinate,
        targetNode.coordinate
      ) > NODE_LINK_DETACH_EPSILON_METERS
  );
  if (!shouldDetachMovedNodes) {
    return [...nodeLinks];
  }

  return reconcileNodeLinks({
    nodes,
    nodeLinks: nodeLinks.map((nodeLink) =>
      nodeLink.id === targetNodeLink.id
        ? {
            ...nodeLink,
            nodeIds: nodeLink.nodeIds.filter(
              (linkedNodeId) => !movedNodeIdSet.has(linkedNodeId)
            ),
          }
        : { ...nodeLink }
    ),
  });
};

export const buildNodeLinksFromLegacyNodes = (
  nodes: readonly LegacyAnnotationNodeWithLinkedGroupId[]
): AnnotationNodeLink[] => {
  const nodeIdsByGroupId = new Map<AnnotationNodeLinkId, string[]>();

  nodes.forEach((node) => {
    const nodeLinkId =
      typeof node.linkedNodeGroupId === "string" &&
      node.linkedNodeGroupId.trim().length > 0
        ? node.linkedNodeGroupId.trim()
        : node.id;
    const existingNodeIds = nodeIdsByGroupId.get(nodeLinkId) ?? [];
    existingNodeIds.push(node.id);
    nodeIdsByGroupId.set(nodeLinkId, existingNodeIds);
  });

  return [...nodeIdsByGroupId.entries()].map(([id, nodeIds]) => ({
    id,
    nodeIds,
  }));
};
