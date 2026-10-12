import { useCallback, type MutableRefObject } from "react";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import type {
  AnnotationGeographicCoordinate,
  PlanarPolygonPlane,
  AnnotationEngine,
  AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";

import {
  resolveAnnotationNodeMoveScope,
  type AnnotationNode,
  type AnnotationNodeLink,
  type AnnotationsStore,
} from "../store";
import type { NodeCoordinateOverrides } from "../utils/node-coordinate-overrides";
import { resolveNodeSnapSample } from "./lifecycle/node-snap.helpers";
import type { LiveAnnotationAnchors } from "./live-annotation-anchors";
import {
  isCoordinateOffPlane,
  projectCoordinateOntoPlane,
} from "./measurement-edit-plane";

export type DraftCoordinatePreviewOptions = {
  screenPosition?: AnnotationScreenPosition;
  forcedSnappedNodeId?: string | null;
  rememberBaseCoordinate?: boolean;
  disableSnap?: boolean;
};

/**
 * Moves a node, and the nodes linked to it within the selected measurements,
 * to a coordinate as a draft. The measurement's plane holds the coordinate,
 * and a node near it may snap to that node and join its link.
 */
export const useScopedNodeMove = ({
  engine,
  nodes,
  linkedNodeGroups,
  annotationsStore,
  selectedAnnotationIds,
  measurementEditPlane,
  liveAnchors,
  updateDraftPreviewState,
  snappedNodeIdRef,
  draftBaseCoordinateRef,
  draftBaseScreenPositionRef,
  hoveredReferenceNodeIdRef,
}: {
  engine: AnnotationEngine | null;
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotationsStore: AnnotationsStore;
  selectedAnnotationIds: readonly string[];
  measurementEditPlane: PlanarPolygonPlane | null;
  liveAnchors: LiveAnnotationAnchors;
  updateDraftPreviewState: (args: {
    nextDraftNodeCoordinateOverrides: NodeCoordinateOverrides;
    nextDraftLinkToNodeId: string | null;
  }) => void;
  snappedNodeIdRef: MutableRefObject<string | null>;
  draftBaseCoordinateRef: MutableRefObject<AnnotationGeographicCoordinate | null>;
  draftBaseScreenPositionRef: MutableRefObject<AnnotationScreenPosition | null>;
  hoveredReferenceNodeIdRef: MutableRefObject<string | null>;
}) =>
  useCallback(
    (
      nodeId: string,
      coordinate: AnnotationGeographicCoordinate,
      {
        screenPosition,
        forcedSnappedNodeId,
        rememberBaseCoordinate = false,
        disableSnap = false,
      }: DraftCoordinatePreviewOptions = {}
    ) => {
      const constrainedCoordinate = measurementEditPlane
        ? projectCoordinateOntoPlane(coordinate, measurementEditPlane)
        : coordinate;
      const { movedNodeIds } = resolveAnnotationNodeMoveScope({
        nodeId,
        nodes,
        linkedNodeGroups,
        annotationEntries: annotationsStore.getState().annotationEntries,
        selectedAnnotationIds,
      });

      if (movedNodeIds.length === 0) {
        return;
      }

      if (rememberBaseCoordinate) {
        draftBaseCoordinateRef.current = constrainedCoordinate;
        draftBaseScreenPositionRef.current = screenPosition ?? null;
      }

      // The measurement visualizers patch their geometry from the live-anchor
      // registry this frame, in lockstep with the gizmo disc, ahead of the
      // draft-state round-trip.
      const applyDraft = (
        draftCoordinate: AnnotationGeographicCoordinate,
        linkToNodeId: string | null
      ) => {
        const liveAnchorECEF = ecefFromGeographicCoordinate(draftCoordinate);
        movedNodeIds.forEach((movedNodeId) => {
          liveAnchors.set(movedNodeId, liveAnchorECEF);
        });
        updateDraftPreviewState({
          nextDraftNodeCoordinateOverrides: Object.fromEntries(
            movedNodeIds.map((movedNodeId) => [movedNodeId, draftCoordinate])
          ),
          nextDraftLinkToNodeId: linkToNodeId,
        });
      };

      if (disableSnap) {
        snappedNodeIdRef.current = null;
        applyDraft(constrainedCoordinate, null);
        return;
      }

      const projectedScreenPosition =
        engine && !engine.isDestroyed()
          ? engine.worldToScreen(
              ecefFromGeographicCoordinate(constrainedCoordinate)
            ) ?? undefined
          : undefined;
      let snapSample = resolveNodeSnapSample({
        engine,
        nodes,
        linkedNodeGroups,
        coordinate: constrainedCoordinate,
        screenPosition:
          screenPosition ??
          draftBaseScreenPositionRef.current ??
          projectedScreenPosition,
        forcedSnappedNodeId:
          forcedSnappedNodeId ?? hoveredReferenceNodeIdRef.current,
        lockedNodeId: snappedNodeIdRef.current,
        excludedNodeIds: movedNodeIds,
      });
      // A node off the measurement's plane cannot be joined: the link would
      // pull this corner out of its roof or wall again.
      if (
        measurementEditPlane &&
        snapSample.snappedNodeId !== null &&
        isCoordinateOffPlane(snapSample.coordinate, measurementEditPlane)
      ) {
        snapSample = {
          ...snapSample,
          coordinate: constrainedCoordinate,
          snappedNodeId: null,
        };
      }
      snappedNodeIdRef.current = snapSample.snappedNodeId;
      applyDraft(snapSample.coordinate, snapSample.snappedNodeId);
    },
    [
      measurementEditPlane,
      annotationsStore,
      linkedNodeGroups,
      liveAnchors,
      nodes,
      engine,
      selectedAnnotationIds,
      updateDraftPreviewState,
      snappedNodeIdRef,
      draftBaseCoordinateRef,
      draftBaseScreenPositionRef,
      hoveredReferenceNodeIdRef,
    ]
  );
