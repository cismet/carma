import { WGS84_ELLIPSOID } from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
import type {
  AnnotationGeographicCoordinate,
  AnnotationNodeLink,
  AnnotationNodeId,
  AnnotationNode,
} from "./annotations-store.types";

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

const NODE_LINK_DETACH_EPSILON_METERS = 0.1;

// Keep the production node-link tolerance metric: ellipsoidal ENU changes
// keep/detach decisions around the existing 10 cm boundary. This private
// comparison preserves that policy rather than changing surface-distance math.
const resolveCoordinateDistanceMeters = (
  left: AnnotationGeographicCoordinate,
  right: AnnotationGeographicCoordinate
) => {
  const deltaLatitudeRad = degToRadNumeric(right.latitude - left.latitude);
  const deltaLongitudeRad = degToRadNumeric(right.longitude - left.longitude);
  const meanLatitudeRad = degToRadNumeric((left.latitude + right.latitude) / 2);
  const horizontalEastMeters =
    deltaLongitudeRad *
    Math.cos(meanLatitudeRad) *
    WGS84_ELLIPSOID.semiMajorAxis;
  const horizontalNorthMeters =
    deltaLatitudeRad * WGS84_ELLIPSOID.semiMajorAxis;
  const deltaAltitudeMeters = right.altitude - left.altitude;
  return Math.hypot(
    horizontalEastMeters,
    horizontalNorthMeters,
    deltaAltitudeMeters
  );
};

/** The trimmed id, or null when it is missing or blank. */
export const normalizeEntityId = (id?: string | null) =>
  typeof id === "string" && id.trim().length > 0 ? id.trim() : null;

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
  const normalizedLinkToNodeId = normalizeEntityId(linkToNodeId);
  const linkTargetNodeLink =
    normalizedLinkToNodeId && !movedNodeIdSet.has(normalizedLinkToNodeId)
      ? nodeLinks.find((nodeLink) =>
          nodeLink.nodeIds.includes(normalizedLinkToNodeId)
        ) ?? null
      : null;

  const shouldMergeMovedNodeIdsIntoLinkTarget =
    linkTargetNodeLink !== null &&
    !linkTargetNodeLink.nodeIds.some((linkedNodeId) =>
      movedNodeIdSet.has(linkedNodeId)
    );

  if (shouldMergeMovedNodeIdsIntoLinkTarget) {
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
