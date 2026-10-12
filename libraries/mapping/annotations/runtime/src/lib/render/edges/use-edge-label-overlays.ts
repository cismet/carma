import { useEffect, useRef } from "react";

import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import type { AnnotationLineLabelOptions } from "../../config/annotation-line-label-options";
import {
  isValidAnnotationEngine,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_OVERLAY_GROUP,
  createAnnotationOverlayLayers,
  destroyAnnotationOverlayLayer,
} from "../../interaction/authoring-visual-runtime";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import {
  areOverlayVisibilitySceneSnapshotsEqual,
  captureOverlayVisibilitySceneSnapshot,
  type OverlayVisibilitySceneSnapshot,
} from "../overlay-visibility.shared";
import {
  reconcileSecondaryLineLabelVisibility,
  type SecondaryLineLabelConflictCandidate,
} from "../secondary-line-label-conflict-resolution";
import {
  createDistanceTriangleCornerHandle,
  destroyDistanceTriangleCornerHandle,
  destroyDistanceTriangleCornerHandles,
  type DistanceTriangleCornerHandle,
} from "./distance-triangle-corner-handle";
import { resolveDistanceTriangleLabelLayerId } from "./edge-defaults";
import { resolveVisiblePointLabelRects } from "./edge-geometry";
import {
  createDistanceTriangleLabelHandle,
  createEdgeSegmentLabelHandle,
  destroyDistanceTriangleLabelHandle,
  destroyDistanceTriangleLabelHandles,
  destroyEdgeSegmentLabelHandle,
  destroyEdgeSegmentLabelHandles,
  updateEdgeSegmentLabel,
  type DistanceTriangleLabelHandle,
  type EdgeSegmentLabelHandle,
} from "./edge-label-handles";
import type { EdgeSegment } from "./edge-models";
import { updateDistanceTriangleOverlay } from "./update-distance-triangle-overlay";

/** The length labels of distance triangles and chain segments, plus the triangles' corner handles. */
export const useEdgeLabelOverlays = (
  engine: AnnotationEngine | null,
  {
    edgeSegments,
    formatOptions,
    lineLabelOptions,
    surfaceKey,
    activeEditedNodeId,
    blockEdgeInteractions,
    liveAnchors,
    onDistanceTriangleCornerClick,
  }: {
    edgeSegments: readonly EdgeSegment[];
    formatOptions: AnnotationsRuntimeFormatOptions;
    lineLabelOptions: AnnotationLineLabelOptions;
    surfaceKey: string;
    activeEditedNodeId: string | null;
    blockEdgeInteractions: boolean;
    liveAnchors: LiveAnnotationAnchors;
    onDistanceTriangleCornerClick?: (annotationId: string) => void;
  }
) => {
  const distanceTriangleLabelHandleByIdRef = useRef<
    Map<string, DistanceTriangleLabelHandle>
  >(new Map());
  const edgeSegmentLabelHandleByIdRef = useRef<
    Map<string, EdgeSegmentLabelHandle>
  >(new Map());
  const distanceTriangleCornerHandleByIdRef = useRef<
    Map<string, DistanceTriangleCornerHandle>
  >(new Map());

  useEffect(() => {
    destroyDistanceTriangleLabelHandles(
      distanceTriangleLabelHandleByIdRef.current
    );
    destroyEdgeSegmentLabelHandles(edgeSegmentLabelHandleByIdRef.current);
    destroyDistanceTriangleCornerHandles(
      distanceTriangleCornerHandleByIdRef.current
    );

    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    const distanceTriangleEdges = edgeSegments.filter(
      (edge) => edge.distanceTriangleOverlay !== undefined
    );
    const edgeSegmentLabelEdges = edgeSegments.filter(
      (edge) => edge.showSegmentLengthLabels === true
    );
    if (
      distanceTriangleEdges.length === 0 &&
      edgeSegmentLabelEdges.length === 0
    ) {
      return;
    }

    const {
      [ANNOTATION_OVERLAY_GROUP.LABEL]: labelOverlayLayer,
      [ANNOTATION_OVERLAY_GROUP.VISUALIZER]: visualizerOverlayLayer,
    } = createAnnotationOverlayLayers(engine, {
      [ANNOTATION_OVERLAY_GROUP.LABEL]:
        resolveDistanceTriangleLabelLayerId(surfaceKey),
      [ANNOTATION_OVERLAY_GROUP.VISUALIZER]: `${resolveDistanceTriangleLabelLayerId(
        surfaceKey
      )}-visualizer`,
    });
    if (!labelOverlayLayer || !visualizerOverlayLayer) {
      return;
    }

    const reconcileLabelHandles = () => {
      const nextIds = new Set([
        ...distanceTriangleEdges.map((edge) => edge.id),
        ...edgeSegmentLabelEdges.map((edge) => edge.id),
      ]);

      distanceTriangleLabelHandleByIdRef.current.forEach((handle, id) => {
        if (nextIds.has(id)) {
          return;
        }

        destroyDistanceTriangleLabelHandle(handle);
        distanceTriangleLabelHandleByIdRef.current.delete(id);
        const cornerHandle =
          distanceTriangleCornerHandleByIdRef.current.get(id);
        if (cornerHandle) {
          destroyDistanceTriangleCornerHandle(cornerHandle);
          distanceTriangleCornerHandleByIdRef.current.delete(id);
        }
      });

      distanceTriangleEdges.forEach((edge) => {
        if (distanceTriangleLabelHandleByIdRef.current.has(edge.id)) {
          return;
        }

        distanceTriangleLabelHandleByIdRef.current.set(
          edge.id,
          createDistanceTriangleLabelHandle(labelOverlayLayer, lineLabelOptions)
        );
        distanceTriangleCornerHandleByIdRef.current.set(
          edge.id,
          createDistanceTriangleCornerHandle(visualizerOverlayLayer)
        );
      });
      edgeSegmentLabelHandleByIdRef.current.forEach((handle, id) => {
        if (nextIds.has(id)) {
          return;
        }

        destroyEdgeSegmentLabelHandle(handle);
        edgeSegmentLabelHandleByIdRef.current.delete(id);
      });
      edgeSegmentLabelEdges.forEach((edge) => {
        if (edgeSegmentLabelHandleByIdRef.current.has(edge.id)) {
          return;
        }

        edgeSegmentLabelHandleByIdRef.current.set(
          edge.id,
          createEdgeSegmentLabelHandle(labelOverlayLayer, lineLabelOptions)
        );
      });
    };

    let previousSceneSnapshot: OverlayVisibilitySceneSnapshot | null = null;

    const updateEdgeLabels = ({
      force = false,
    }: {
      force?: boolean;
    } = {}) => {
      const nextSceneSnapshot = captureOverlayVisibilitySceneSnapshot(engine);
      // A live drag moves nodes under a static camera: never skip then.
      if (
        !force &&
        liveAnchors.size === 0 &&
        areOverlayVisibilitySceneSnapshotsEqual(
          previousSceneSnapshot,
          nextSceneSnapshot
        )
      ) {
        return;
      }

      previousSceneSnapshot = nextSceneSnapshot;
      const occupiedPointLabelRects = resolveVisiblePointLabelRects(engine);
      const secondaryLineLabelCandidates: SecondaryLineLabelConflictCandidate[] =
        [];

      const cornerClickable =
        !blockEdgeInteractions &&
        activeEditedNodeId === null &&
        Boolean(onDistanceTriangleCornerClick);

      distanceTriangleEdges.forEach((edge) => {
        const labelHandle = distanceTriangleLabelHandleByIdRef.current.get(
          edge.id
        );
        if (!labelHandle) {
          return;
        }
        updateDistanceTriangleOverlay({
          engine,
          edge,
          labelHandle,
          cornerHandle: distanceTriangleCornerHandleByIdRef.current.get(
            edge.id
          ),
          formatOptions,
          liveAnchors,
          candidates: secondaryLineLabelCandidates,
          cornerClickable,
          onCornerClick: onDistanceTriangleCornerClick,
        });
      });

      edgeSegmentLabelEdges.forEach((edge) => {
        const labelHandle = edgeSegmentLabelHandleByIdRef.current.get(edge.id);
        if (!labelHandle) {
          return;
        }
        updateEdgeSegmentLabel({
          engine,
          edge,
          labelHandle,
          formatOptions,
          liveAnchors,
          candidates: secondaryLineLabelCandidates,
        });
      });

      reconcileSecondaryLineLabelVisibility({
        candidates: secondaryLineLabelCandidates,
        occupiedLabelRects: occupiedPointLabelRects,
        allowEarlyRemoval: lineLabelOptions.collision.allowEarlyRemoval,
        collisionResolutionStrategy:
          lineLabelOptions.collision.resolutionStrategy,
        anchorSlideStepRatio: lineLabelOptions.collision.anchorSlideStepRatio,
        maxAnchorSlideDeltaRatio:
          lineLabelOptions.collision.maxAnchorSlideDeltaRatio,
      });
    };

    reconcileLabelHandles();
    updateEdgeLabels({
      force: true,
    });
    const removePostRenderListener = engine.subscribePostRender(() => {
      updateEdgeLabels();
    });
    engine.requestRender();

    return () => {
      removePostRenderListener();
      destroyDistanceTriangleLabelHandles(
        distanceTriangleLabelHandleByIdRef.current
      );
      destroyEdgeSegmentLabelHandles(edgeSegmentLabelHandleByIdRef.current);
      destroyDistanceTriangleCornerHandles(
        distanceTriangleCornerHandleByIdRef.current
      );
      destroyAnnotationOverlayLayer(labelOverlayLayer);
      destroyAnnotationOverlayLayer(visualizerOverlayLayer);
      if (isValidAnnotationEngine(engine)) {
        engine.requestRender();
      }
    };
  }, [
    activeEditedNodeId,
    blockEdgeInteractions,
    edgeSegments,
    edgeSegmentLabelHandleByIdRef,
    engine,
    formatOptions,
    liveAnchors,
    onDistanceTriangleCornerClick,
    lineLabelOptions,
    surfaceKey,
  ]);
};
