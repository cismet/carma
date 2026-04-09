import { useCallback, useEffect, useRef } from "react";
import { projectGeographicCoordinateToScreen } from "@carma-mapping/engines/cesium/core";

import type { RuntimeCoordinate, RuntimeNode } from "../../store";
import type {
  AnnotationToolPlugin,
  AnnotationToolSessionContext,
} from "../../tools/annotationToolPlugin.types";
import type { RuntimeScene } from "../../types/runtimeScene.types";
import type { RuntimeToolId } from "../../types/runtimeTool.types";
import type { AnnotationModeSessionMap } from "./annotationModeSession.types";
type UsePointQueryToolRoutingParams = {
  scene: RuntimeScene | null;
  nodes: readonly RuntimeNode[];
  activeToolType: RuntimeToolId;
  toolSessions: AnnotationModeSessionMap;
  getToolPlugin: (toolType: RuntimeToolId) => AnnotationToolPlugin | null;
  sessionContext: AnnotationToolSessionContext;
};

const SNAP_DISTANCE_THRESHOLD_PX = 14;
const SNAP_RELEASE_DISTANCE_THRESHOLD_PX = 18;

const findNodeById = (nodes: readonly RuntimeNode[], nodeId: string | null) =>
  nodeId ? nodes.find((node) => node.id === nodeId) ?? null : null;

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
  coordinate,
  screenPosition,
}: {
  scene: RuntimeScene | null;
  nodes: readonly RuntimeNode[];
  coordinate: RuntimeCoordinate;
  screenPosition?: { x: number; y: number };
}): RuntimeNode | null => {
  if (!screenPosition || !scene || scene.isDestroyed() || nodes.length === 0) {
    return null;
  }

  const thresholdSquared = SNAP_DISTANCE_THRESHOLD_PX ** 2;
  let bestSquaredDistance = thresholdSquared;
  let snappedNode: RuntimeNode | null = null;

  for (const node of nodes) {
    const nodeScreenPosition = projectGeographicCoordinateToScreen(
      scene,
      node.coordinate
    );
    if (!nodeScreenPosition) {
      continue;
    }

    const dx = nodeScreenPosition.x - screenPosition.x;
    const dy = nodeScreenPosition.y - screenPosition.y;
    const squaredDistance = dx * dx + dy * dy;
    if (squaredDistance > bestSquaredDistance) {
      continue;
    }

    bestSquaredDistance = squaredDistance;
    snappedNode = node;
  }

  return snappedNode;
};

export const usePointQueryToolRouting = ({
  scene,
  nodes,
  activeToolType,
  toolSessions,
  getToolPlugin,
  sessionContext,
}: UsePointQueryToolRoutingParams) => {
  const activeToolSession = toolSessions[activeToolType] ?? null;
  const activePlugin = getToolPlugin(activeToolType);
  const snappedNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!findNodeById(nodes, snappedNodeIdRef.current)) {
      snappedNodeIdRef.current = null;
    }
  }, [nodes]);

  const resolvePointQueryCoordinate = useCallback(
    (
      coordinate: RuntimeCoordinate,
      screenPosition?: { x: number; y: number }
    ) => {
      if (
        !screenPosition ||
        !scene ||
        scene.isDestroyed() ||
        nodes.length === 0
      ) {
        snappedNodeIdRef.current = null;
        return coordinate;
      }

      const lockedNode = findNodeById(nodes, snappedNodeIdRef.current);
      if (lockedNode) {
        const lockedDistanceSquared = resolveScreenDistanceSquaredToNode({
          scene,
          node: lockedNode,
          screenPosition,
        });
        if (
          lockedDistanceSquared !== null &&
          lockedDistanceSquared <= SNAP_RELEASE_DISTANCE_THRESHOLD_PX ** 2
        ) {
          return lockedNode.coordinate;
        }
      }

      const snappedNode = resolveSnappedNode({
        scene,
        nodes,
        coordinate,
        screenPosition,
      });
      snappedNodeIdRef.current = snappedNode?.id ?? null;
      return snappedNode?.coordinate ?? coordinate;
    },
    [nodes, scene]
  );

  const handlePointQueryPointCreated = useCallback(
    (
      coordinate: RuntimeCoordinate,
      screenPosition?: { x: number; y: number }
    ) => {
      const resolvedCoordinate = resolvePointQueryCoordinate(
        coordinate,
        screenPosition
      );
      const nodeCreatedHandler = activeToolSession?.onNodeCreated;
      if (nodeCreatedHandler) {
        nodeCreatedHandler(resolvedCoordinate);
        return;
      }

      activePlugin?.pointQuery?.onPointCreated({
        coordinate: resolvedCoordinate,
        activeToolType,
        activeToolSession,
        toolSessions,
        sessionContext,
      });
    },
    [
      activePlugin,
      activeToolSession,
      activeToolType,
      resolvePointQueryCoordinate,
      sessionContext,
      toolSessions,
    ]
  );

  return {
    handlePointQueryPointCreated,
    resolvePointQueryCoordinate,
    activeToolSession,
  };
};
