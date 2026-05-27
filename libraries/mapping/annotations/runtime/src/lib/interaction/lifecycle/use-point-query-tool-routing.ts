import { useCallback, useEffect, useRef } from "react";

import type {
  CesiumGeographicCoordinate,
  AnnotationNodeLink,
  AnnotationNodeLinkId,
  AnnotationNode,
} from "../../store";
import type {
  AnnotationToolPlugin,
  AnnotationToolSessionContext,
} from "../../registry";
import type { Scene } from "@carma-cesium";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type { AnnotationModeSessionMap } from "./annotation-mode-session.types";
import { resolveNodeSnapSample } from "./node-snap.helpers";
type UsePointQueryToolRoutingParams = {
  scene: Scene | null;
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  activeToolType: AnnotationToolId;
  toolSessions: AnnotationModeSessionMap;
  getToolPlugin: (toolId: AnnotationToolId) => AnnotationToolPlugin | null;
  sessionContext: AnnotationToolSessionContext;
};

type PointQueryResolvedNodeSample = {
  coordinate: CesiumGeographicCoordinate;
  linkedNodeGroupId: AnnotationNodeLinkId | null;
};

const findNodeById = (
  nodes: readonly AnnotationNode[],
  nodeId: string | null
) => (nodeId ? nodes.find((node) => node.id === nodeId) ?? null : null);

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
      coordinate: CesiumGeographicCoordinate,
      screenPosition?: { x: number; y: number },
      forcedSnappedNodeId: string | null = null
    ): PointQueryResolvedNodeSample => {
      const resolvedNodeSnapSample = resolveNodeSnapSample({
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
      coordinate: CesiumGeographicCoordinate,
      screenPosition?: { x: number; y: number }
    ) => resolvePointQuerySample(coordinate, screenPosition).coordinate,
    [resolvePointQuerySample]
  );

  const handlePointQueryPointCreated = useCallback(
    (
      coordinate: CesiumGeographicCoordinate,
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
