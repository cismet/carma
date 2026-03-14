import { useCallback } from "react";

import { projectGeographicCoordinateToScreen } from "@carma-mapping/engines/cesium/api";

import type { RuntimeCoordinate, RuntimeNode } from "../../store";
import type { AnnotationModeSessionMap } from "./annotationModeSession.types";
import type {
  AnnotationToolPlugin,
  AnnotationToolSessionContext,
} from "../../tools/annotationToolPlugin.types";
import type { RuntimeToolId } from "../../types/runtimeTool.types";
import type { RuntimeScene } from "../../types/runtimeScene.types";

type UsePointQueryToolRoutingParams = {
  scene: RuntimeScene | null;
  nodes: readonly RuntimeNode[];
  activeToolType: RuntimeToolId;
  toolSessions: AnnotationModeSessionMap;
  getToolPlugin: (toolType: RuntimeToolId) => AnnotationToolPlugin | null;
  sessionContext: AnnotationToolSessionContext;
};

const SNAP_DISTANCE_THRESHOLD_PX = 14;

const resolveSnappedNodeCoordinate = ({
  scene,
  nodes,
  coordinate,
  screenPosition,
}: {
  scene: RuntimeScene | null;
  nodes: readonly RuntimeNode[];
  coordinate: RuntimeCoordinate;
  screenPosition?: { x: number; y: number };
}): RuntimeCoordinate => {
  if (!screenPosition || !scene || scene.isDestroyed() || nodes.length === 0) {
    return coordinate;
  }

  const thresholdSquared = SNAP_DISTANCE_THRESHOLD_PX ** 2;
  let bestSquaredDistance = thresholdSquared;
  let snappedCoordinate: RuntimeCoordinate | null = null;

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
    snappedCoordinate = node.coordinate;
  }

  return snappedCoordinate ?? coordinate;
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

  const resolvePointQueryCoordinate = useCallback(
    (coordinate: RuntimeCoordinate, screenPosition?: { x: number; y: number }) =>
      resolveSnappedNodeCoordinate({
        scene,
        nodes,
        coordinate,
        screenPosition,
      }),
    [nodes, scene]
  );

  const handlePointQueryPointCreated = useCallback(
    (coordinate: RuntimeCoordinate, screenPosition?: { x: number; y: number }) => {
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
