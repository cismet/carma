import { useCallback, useEffect, useRef } from "react";

import type {
  RuntimeCoordinate,
  RuntimeNodeLink,
  RuntimeNodeLinkId,
  RuntimeNode,
} from "../../store";
import type {
  AnnotationToolPlugin,
  AnnotationToolSessionContext,
} from "../../tools/annotation-tool-plugin.types";
import type { RuntimeScene } from "../../types/runtime-scene.types";
import type { RuntimeToolId } from "../../types/runtime-tool.types";
import type { AnnotationModeSessionMap } from "./annotation-mode-session.types";
import { resolveRuntimeNodeSnapSample } from "./node-snap.helpers";
type UsePointQueryToolRoutingParams = {
  scene: RuntimeScene | null;
  nodes: readonly RuntimeNode[];
  linkedNodeGroups: readonly RuntimeNodeLink[];
  activeToolType: RuntimeToolId;
  toolSessions: AnnotationModeSessionMap;
  getToolPlugin: (toolType: RuntimeToolId) => AnnotationToolPlugin | null;
  sessionContext: AnnotationToolSessionContext;
};

type PointQueryResolvedNodeSample = {
  coordinate: RuntimeCoordinate;
  linkedNodeGroupId: RuntimeNodeLinkId | null;
};

const findNodeById = (nodes: readonly RuntimeNode[], nodeId: string | null) =>
  nodeId ? nodes.find((node) => node.id === nodeId) ?? null : null;

export const usePointQueryToolRouting = ({
  scene,
  nodes,
  linkedNodeGroups,
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

  const resolvePointQuerySample = useCallback(
    (
      coordinate: RuntimeCoordinate,
      screenPosition?: { x: number; y: number },
      forcedSnappedNodeId: string | null = null
    ): PointQueryResolvedNodeSample => {
      const resolvedNodeSnapSample = resolveRuntimeNodeSnapSample({
        scene,
        nodes,
        linkedNodeGroups,
        coordinate,
        screenPosition,
        forcedSnappedNodeId,
        lockedNodeId: snappedNodeIdRef.current,
      });
      snappedNodeIdRef.current = resolvedNodeSnapSample.snappedNodeId;
      return {
        coordinate: resolvedNodeSnapSample.coordinate,
        linkedNodeGroupId: resolvedNodeSnapSample.linkedNodeGroupId,
      };
    },
    [linkedNodeGroups, nodes, scene]
  );

  const resolvePointQueryCoordinate = useCallback(
    (
      coordinate: RuntimeCoordinate,
      screenPosition?: { x: number; y: number }
    ) => resolvePointQuerySample(coordinate, screenPosition).coordinate,
    [resolvePointQuerySample]
  );

  const handlePointQueryPointCreated = useCallback(
    (
      coordinate: RuntimeCoordinate,
      screenPosition?: { x: number; y: number },
      options?: { forcedSnappedNodeId?: string | null }
    ) => {
      const resolvedPointQuerySample = resolvePointQuerySample(
        coordinate,
        screenPosition,
        options?.forcedSnappedNodeId ?? null
      );
      const nodeCreatedHandler = activeToolSession?.onNodeCreated;
      if (nodeCreatedHandler) {
        nodeCreatedHandler(
          resolvedPointQuerySample.coordinate,
          resolvedPointQuerySample.linkedNodeGroupId
        );
        return;
      }

      activePlugin?.pointQuery?.onPointCreated({
        coordinate: resolvedPointQuerySample.coordinate,
        linkedNodeGroupId: resolvedPointQuerySample.linkedNodeGroupId,
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
      resolvePointQuerySample,
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
