import { projectGeographicCoordinateToScreen } from "@carma-mapping/engines/cesium/core";

import type {
  RuntimeCoordinate,
  RuntimeNodeLink,
  RuntimeNodeLinkId,
  RuntimeNode,
  RuntimeNodeId,
} from "../../store";
import { resolveNodeLinkIdForNodeId } from "../../store";
import type { RuntimeScene } from "../../types/runtime-scene.types";

// Cursor-to-node acquire radius in screen pixels.
// This is separate from the DOM hidden-target diameter in PointLabel.tsx.
export const NODE_SNAP_ACQUIRE_DISTANCE_THRESHOLD_PX = 14;
// Slightly larger release radius to avoid snap flicker while hovering nearby.
export const NODE_SNAP_RELEASE_DISTANCE_THRESHOLD_PX = 18;

export type RuntimeNodeSnapSample = {
  coordinate: RuntimeCoordinate;
  linkedNodeGroupId: RuntimeNodeLinkId | null;
  snappedNodeId: RuntimeNodeId | null;
};

const findNodeById = (
  nodes: readonly RuntimeNode[],
  nodeId: RuntimeNodeId | null
) => (nodeId ? nodes.find((node) => node.id === nodeId) ?? null : null);

const resolveScreenDistanceSquaredToNode = ({
  scene,
  node,
  screenPosition,
}: {
  scene: RuntimeScene;
  node: RuntimeNode;
  screenPosition: { x: number; y: number };
}) => {
  const nodeScreenPosition = projectGeographicCoordinateToScreen(
    scene,
    node.coordinate
  );
  if (!nodeScreenPosition) {
    return null;
  }

  const dx = nodeScreenPosition.x - screenPosition.x;
  const dy = nodeScreenPosition.y - screenPosition.y;
  return dx * dx + dy * dy;
};

const resolveSnappedNode = ({
  scene,
  nodes,
  screenPosition,
}: {
  scene: RuntimeScene | null;
  nodes: readonly RuntimeNode[];
  screenPosition?: { x: number; y: number };
}): RuntimeNode | null => {
  if (!screenPosition || !scene || scene.isDestroyed() || nodes.length === 0) {
    return null;
  }

  const thresholdSquared = NODE_SNAP_ACQUIRE_DISTANCE_THRESHOLD_PX ** 2;
  let bestSquaredDistance = thresholdSquared;
  let snappedNode: RuntimeNode | null = null;

  for (const node of nodes) {
    const squaredDistance = resolveScreenDistanceSquaredToNode({
      scene,
      node,
      screenPosition,
    });
    if (squaredDistance === null || squaredDistance > bestSquaredDistance) {
      continue;
    }

    bestSquaredDistance = squaredDistance;
    snappedNode = node;
  }

  return snappedNode;
};

export const resolveRuntimeNodeSnapSample = ({
  scene,
  nodes,
  linkedNodeGroups,
  coordinate,
  screenPosition,
  forcedSnappedNodeId = null,
  lockedNodeId = null,
  excludedNodeIds = [],
}: {
  scene: RuntimeScene | null;
  nodes: readonly RuntimeNode[];
  linkedNodeGroups: readonly RuntimeNodeLink[];
  coordinate: RuntimeCoordinate;
  screenPosition?: { x: number; y: number };
  forcedSnappedNodeId?: RuntimeNodeId | null;
  lockedNodeId?: RuntimeNodeId | null;
  excludedNodeIds?: readonly RuntimeNodeId[];
}): RuntimeNodeSnapSample => {
  if (!scene || scene.isDestroyed() || nodes.length === 0) {
    return {
      coordinate,
      linkedNodeGroupId: null,
      snappedNodeId: null,
    };
  }

  const excludedNodeIdSet = new Set(excludedNodeIds.filter(Boolean));
  const candidateNodes =
    excludedNodeIdSet.size === 0
      ? nodes
      : nodes.filter((node) => !excludedNodeIdSet.has(node.id));
  if (candidateNodes.length === 0) {
    return {
      coordinate,
      linkedNodeGroupId: null,
      snappedNodeId: null,
    };
  }

  const forcedSnappedNode = findNodeById(candidateNodes, forcedSnappedNodeId);
  if (forcedSnappedNode) {
    return {
      coordinate: forcedSnappedNode.coordinate,
      linkedNodeGroupId: resolveNodeLinkIdForNodeId(
        linkedNodeGroups,
        forcedSnappedNode.id
      ),
      snappedNodeId: forcedSnappedNode.id,
    };
  }

  if (!screenPosition) {
    return {
      coordinate,
      linkedNodeGroupId: null,
      snappedNodeId: null,
    };
  }

  const lockedNode = findNodeById(candidateNodes, lockedNodeId);
  if (lockedNode) {
    const lockedDistanceSquared = resolveScreenDistanceSquaredToNode({
      scene,
      node: lockedNode,
      screenPosition,
    });
    if (
      lockedDistanceSquared !== null &&
      lockedDistanceSquared <= NODE_SNAP_RELEASE_DISTANCE_THRESHOLD_PX ** 2
    ) {
      return {
        coordinate: lockedNode.coordinate,
        linkedNodeGroupId: resolveNodeLinkIdForNodeId(
          linkedNodeGroups,
          lockedNode.id
        ),
        snappedNodeId: lockedNode.id,
      };
    }
  }

  const snappedNode = resolveSnappedNode({
    scene,
    nodes: candidateNodes,
    screenPosition,
  });

  return {
    coordinate: snappedNode?.coordinate ?? coordinate,
    linkedNodeGroupId: snappedNode
      ? resolveNodeLinkIdForNodeId(linkedNodeGroups, snappedNode.id)
      : null,
    snappedNodeId: snappedNode?.id ?? null,
  };
};
