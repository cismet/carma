import { useEffect, useRef } from "react";
import { Vector3 } from "three";

import { PI_OVER_TWO } from "@carma-units";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import { ANNOTATION_OVERLAY_GROUP } from "../../interaction/annotation-overlay-mount";
import {
  createAnnotationOverlayLayers,
  destroyAnnotationOverlayLayer,
} from "../../interaction/authoring-overlay-layer";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import { resolveDistanceTriangleLabelLayerId } from "./edge-defaults";
import { resolveEdgePointECEF } from "./edge-geometry";
import { resolveOverlayZIndexBetweenWorldPositions } from "./edge-overlay-layout";
import { toCssPixelPosition } from "../../interaction/css-pixel-position";
import {
  applyEdgeMidpointHandleLayout,
  createEdgeMidpointHandle,
  destroyEdgeMidpointHandles,
  hideEdgeMidpointHandle,
  type EdgeMidpointHandle,
} from "./edge-midpoint-handle";
import type { EdgeSegment } from "./edge-models";

/** An insert-node handle at the midpoint of every edge of the targeted annotations. */
export const useEdgeMidpointHandles = (
  engine: AnnotationEngine | null,
  {
    insertNodeTargetSegments,
    surfaceKey,
    activeEditedNodeId,
    blockEdgeInteractions,
    liveAnchors,
    onInsertNodeTargetClick,
    hitAreaOnly = false,
    onHoverChange,
  }: {
    insertNodeTargetSegments: readonly EdgeSegment[];
    surfaceKey: string;
    activeEditedNodeId: string | null;
    blockEdgeInteractions: boolean;
    liveAnchors: LiveAnnotationAnchors;
    onInsertNodeTargetClick?: (
      annotationId: string,
      startNodeId: string,
      endNodeId: string
    ) => boolean;
    /** The engine draws the ticks (see `useEdgeHandleScene`). */
    hitAreaOnly?: boolean;
    onHoverChange?: (edgeId: string, hovered: boolean) => void;
  }
) => {
  const edgeMidpointHandleByIdRef = useRef<Map<string, EdgeMidpointHandle>>(
    new Map()
  );

  useEffect(() => {
    destroyEdgeMidpointHandles(edgeMidpointHandleByIdRef.current);

    if (
      !isValidAnnotationEngine(engine) ||
      blockEdgeInteractions ||
      activeEditedNodeId !== null ||
      insertNodeTargetSegments.length === 0
    ) {
      return;
    }

    const overlayLayer = createAnnotationOverlayLayers(engine, {
      [ANNOTATION_OVERLAY_GROUP.VISUALIZER]: `${resolveDistanceTriangleLabelLayerId(
        surfaceKey
      )}-midpoint-targets`,
    })[ANNOTATION_OVERLAY_GROUP.VISUALIZER];
    if (!overlayLayer) {
      return;
    }

    insertNodeTargetSegments.forEach((edge) => {
      edgeMidpointHandleByIdRef.current.set(
        edge.id,
        createEdgeMidpointHandle(overlayLayer, { hitAreaOnly })
      );
    });

    const updateEdgeMidpointHandles = () => {
      insertNodeTargetSegments.forEach((edge) => {
        const handle = edgeMidpointHandleByIdRef.current.get(edge.id);
        if (!handle) {
          return;
        }

        const startWorld = resolveEdgePointECEF(
          liveAnchors,
          edge.startNodeId,
          edge.startCoordinate
        );
        const endWorld = resolveEdgePointECEF(
          liveAnchors,
          edge.endNodeId,
          edge.endCoordinate
        );
        const startScreen = engine.worldToScreen(startWorld);
        const endScreen = engine.worldToScreen(endWorld);
        const midpointScreen = engine.worldToScreen(
          new Vector3().addVectors(startWorld, endWorld).multiplyScalar(0.5)
        );

        if (
          startScreen === null ||
          endScreen === null ||
          midpointScreen === null ||
          !edge.annotationId ||
          !edge.startNodeId ||
          !edge.endNodeId
        ) {
          hideEdgeMidpointHandle(handle);
          return;
        }

        applyEdgeMidpointHandleLayout({
          handle,
          center: toCssPixelPosition(midpointScreen),
          angleRad:
            Math.atan2(
              endScreen.y - startScreen.y,
              endScreen.x - startScreen.x
            ) + PI_OVER_TWO,
          zIndex: resolveOverlayZIndexBetweenWorldPositions(
            engine,
            startWorld,
            endWorld
          ),
          clickable: Boolean(onInsertNodeTargetClick),
          onClick: onInsertNodeTargetClick
            ? () =>
                onInsertNodeTargetClick(
                  edge.annotationId!,
                  edge.startNodeId!,
                  edge.endNodeId!
                )
            : undefined,
          onHoverChange: onHoverChange
            ? (hovered) => onHoverChange(edge.id, hovered)
            : undefined,
        });
      });
    };

    updateEdgeMidpointHandles();
    const removePostRenderListener = engine.subscribePostRender(() => {
      updateEdgeMidpointHandles();
    });
    engine.requestRender();

    return () => {
      removePostRenderListener();
      destroyEdgeMidpointHandles(edgeMidpointHandleByIdRef.current);
      destroyAnnotationOverlayLayer(overlayLayer);
      if (isValidAnnotationEngine(engine)) {
        engine.requestRender();
      }
    };
  }, [
    activeEditedNodeId,
    blockEdgeInteractions,
    engine,
    hitAreaOnly,
    insertNodeTargetSegments,
    liveAnchors,
    onHoverChange,
    onInsertNodeTargetClick,
    surfaceKey,
  ]);
};
