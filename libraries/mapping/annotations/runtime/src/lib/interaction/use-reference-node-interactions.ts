import { useCallback, type MutableRefObject } from "react";
import { Vector3 } from "three";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import type {
  AnnotationGeographicCoordinate,
  AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";

import type { AnnotationNode } from "../store";
import type { AnnotationNodeEditRule } from "./annotation-node-edit-rules";
import {
  createReferenceLineAxisOverride,
  type MoveGizmoAxisOverride,
} from "./reference-line-axis-override";
import type { DraftCoordinatePreviewOptions } from "./use-scoped-node-move";

/**
 * Clicking or hovering another node while a node is edited copies that node's
 * height; clicking an edge offers its axes to the gizmo.
 */
export const useReferenceNodeInteractions = ({
  activeEditedNodeId,
  activeNodeEditRule,
  nodesById,
  areReferenceInteractionsSuppressed,
  setDraftCoordinateForScopedMove,
  setAxisOverride,
  draftBaseCoordinateRef,
  draftBaseScreenPositionRef,
  hoveredReferenceNodeIdRef,
  nodes,
}: {
  activeEditedNodeId: string | null;
  activeNodeEditRule: AnnotationNodeEditRule;
  nodesById: ReadonlyMap<string, AnnotationNode>;
  areReferenceInteractionsSuppressed: () => boolean;
  setDraftCoordinateForScopedMove: (
    nodeId: string,
    coordinate: AnnotationGeographicCoordinate,
    options?: DraftCoordinatePreviewOptions
  ) => void;
  setAxisOverride: (axisOverride: MoveGizmoAxisOverride | null) => void;
  draftBaseCoordinateRef: MutableRefObject<AnnotationGeographicCoordinate | null>;
  draftBaseScreenPositionRef: MutableRefObject<AnnotationScreenPosition | null>;
  hoveredReferenceNodeIdRef: MutableRefObject<string | null>;
  nodes: readonly AnnotationNode[];
}) => {
  const resolveDraftBaseCoordinate = useCallback(
    (nodeId: string) =>
      draftBaseCoordinateRef.current ??
      nodes.find((node) => node.id === nodeId)?.coordinate ??
      null,
    [draftBaseCoordinateRef, nodes]
  );

  const handleReferenceNodeClick = useCallback(
    (referenceNodeId: string) => {
      if (!activeEditedNodeId || areReferenceInteractionsSuppressed()) {
        return false;
      }

      const activeNode = nodesById.get(activeEditedNodeId);
      const referenceNode = nodesById.get(referenceNodeId);
      if (!activeNode || !referenceNode) {
        return false;
      }

      if (activeNode.id !== referenceNode.id) {
        const nextCoordinate = {
          ...activeNode.coordinate,
          altitude: referenceNode.coordinate.altitude,
        };
        hoveredReferenceNodeIdRef.current = null;
        draftBaseCoordinateRef.current = nextCoordinate;
        setDraftCoordinateForScopedMove(activeNode.id, nextCoordinate, {
          disableSnap: true,
        });
      }

      return true;
    },
    [
      activeEditedNodeId,
      areReferenceInteractionsSuppressed,
      draftBaseCoordinateRef,
      hoveredReferenceNodeIdRef,
      nodesById,
      setDraftCoordinateForScopedMove,
    ]
  );

  const handleReferenceNodeHover = useCallback(
    (referenceNodeId: string, hovered: boolean) => {
      if (!activeEditedNodeId || areReferenceInteractionsSuppressed()) {
        return;
      }

      const baseCoordinate = resolveDraftBaseCoordinate(activeEditedNodeId);
      const referenceNode = nodesById.get(referenceNodeId);
      if (!baseCoordinate) {
        return;
      }

      if (hovered) {
        hoveredReferenceNodeIdRef.current = referenceNodeId;
        setDraftCoordinateForScopedMove(
          activeEditedNodeId,
          {
            ...baseCoordinate,
            altitude:
              referenceNode?.coordinate.altitude ?? baseCoordinate.altitude,
          },
          { disableSnap: true }
        );
        return;
      }

      if (hoveredReferenceNodeIdRef.current !== referenceNodeId) {
        return;
      }

      hoveredReferenceNodeIdRef.current = null;
      setDraftCoordinateForScopedMove(activeEditedNodeId, baseCoordinate, {
        screenPosition: draftBaseScreenPositionRef.current ?? undefined,
        disableSnap: true,
      });
    },
    [
      activeEditedNodeId,
      areReferenceInteractionsSuppressed,
      draftBaseScreenPositionRef,
      hoveredReferenceNodeIdRef,
      nodesById,
      resolveDraftBaseCoordinate,
      setDraftCoordinateForScopedMove,
    ]
  );

  const handleReferenceEdgeClick = useCallback(
    (startNodeId: string, endNodeId: string) => {
      if (
        !activeEditedNodeId ||
        !activeNodeEditRule.axes ||
        areReferenceInteractionsSuppressed()
      ) {
        return false;
      }

      const startNode = nodesById.get(startNodeId);
      const endNode = nodesById.get(endNodeId);
      if (!startNode || !endNode) {
        return false;
      }

      const axisOverrideFromLine = createReferenceLineAxisOverride(
        new Vector3().subVectors(
          ecefFromGeographicCoordinate(endNode.coordinate),
          ecefFromGeographicCoordinate(startNode.coordinate)
        )
      );
      if (!axisOverrideFromLine) {
        return false;
      }

      setAxisOverride(axisOverrideFromLine);
      return true;
    },
    [
      activeEditedNodeId,
      activeNodeEditRule,
      areReferenceInteractionsSuppressed,
      nodesById,
      setAxisOverride,
    ]
  );

  return {
    handleReferenceNodeClick,
    handleReferenceNodeHover,
    handleReferenceEdgeClick,
  };
};
