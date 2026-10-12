import { useMemo } from "react";

import { useLineVisualizers } from "@carma-providers/label-overlay";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import {
  resolveAnnotationLineLabelOptions,
  type PartialAnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import type { AnnotationEngine } from "../engine";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";
import type { RuntimeEdgeRenderModel } from "./annotation-render-models";
import { buildEdgeOverlayLines } from "./edges/build-edge-overlay-lines";
import { buildEdgeSceneLines } from "./edges/build-edge-scene-lines";
import { buildEdgeSegments } from "./edges/edge-models";
import { useEdgeLabelOverlays } from "./edges/use-edge-label-overlays";
import { useEdgeMidpointHandles } from "./edges/use-edge-midpoint-handles";
import { useEdgeSceneLines } from "./edges/use-edge-scene-lines";

type UseRuntimeAnnotationEdgesControllerArgs = {
  edges: readonly RuntimeEdgeRenderModel[];
  formatOptions: AnnotationsRuntimeFormatOptions;
  lineLabelOptions?: PartialAnnotationLineLabelOptions;
  surfaceKey?: string;
  activeEditedNodeId: string | null;
  blockEdgeInteractions: boolean;
  onAnnotationSelect?: (annotationId: string) => void;
  onEdgeClick?: (startNodeId: string, endNodeId: string) => boolean;
  insertNodeTargetAnnotationIds?: readonly string[];
  onInsertNodeTargetClick?: (
    annotationId: string,
    startNodeId: string,
    endNodeId: string
  ) => boolean;
  onDistanceTriangleCornerClick?: (annotationId: string) => void;
  liveAnchors: LiveAnnotationAnchors;
};

export const useAnnotationEdgesController = (
  engine: AnnotationEngine | null,
  {
    edges,
    formatOptions,
    lineLabelOptions,
    surfaceKey = "committed",
    activeEditedNodeId,
    blockEdgeInteractions,
    onAnnotationSelect,
    onEdgeClick,
    insertNodeTargetAnnotationIds = [],
    onInsertNodeTargetClick,
    onDistanceTriangleCornerClick,
    liveAnchors,
  }: UseRuntimeAnnotationEdgesControllerArgs
) => {
  const resolvedAnnotationLineLabelOptions = useMemo(
    () => resolveAnnotationLineLabelOptions(lineLabelOptions),
    [lineLabelOptions]
  );
  const insertNodeTargetAnnotationIdSet = useMemo(
    () => new Set(insertNodeTargetAnnotationIds),
    [insertNodeTargetAnnotationIds]
  );

  const edgeSegments = useMemo(() => buildEdgeSegments(edges), [edges]);

  const insertNodeTargetSegments = useMemo(
    () =>
      edgeSegments.filter(
        (edge) =>
          edge.annotationId !== undefined &&
          insertNodeTargetAnnotationIdSet.has(edge.annotationId) &&
          edge.startNodeId !== undefined &&
          edge.endNodeId !== undefined
      ),
    [edgeSegments, insertNodeTargetAnnotationIdSet]
  );

  // An engine that draws the depth-occluded part of its scene lines itself
  // makes the SVG overlay trace of those edges redundant.
  const occludedLinesInScene =
    engine?.capabilities.occludedLinesInScene === true;

  const sceneLines = useMemo(
    () =>
      buildEdgeSceneLines({
        edgeSegments,
        engine,
        formatOptions,
        liveAnchors,
        occludedLinesInScene,
      }),
    [edgeSegments, engine, formatOptions, liveAnchors, occludedLinesInScene]
  );

  const overlayLines = useMemo(
    () =>
      buildEdgeOverlayLines({
        edgeSegments,
        engine,
        formatOptions,
        liveAnchors,
        occludedLinesInScene,
        surfaceKey,
        activeEditedNodeId,
        blockEdgeInteractions,
        onEdgeClick,
        onAnnotationSelect,
      }),
    [
      activeEditedNodeId,
      blockEdgeInteractions,
      edgeSegments,
      engine,
      formatOptions,
      liveAnchors,
      occludedLinesInScene,
      onEdgeClick,
      onAnnotationSelect,
      surfaceKey,
    ]
  );

  useLineVisualizers([...overlayLines], overlayLines.length > 0);

  useEdgeSceneLines(engine, sceneLines, activeEditedNodeId, liveAnchors);

  useEdgeMidpointHandles(engine, {
    insertNodeTargetSegments,
    surfaceKey,
    activeEditedNodeId,
    blockEdgeInteractions,
    liveAnchors,
    onInsertNodeTargetClick,
  });

  useEdgeLabelOverlays(engine, {
    edgeSegments,
    formatOptions,
    lineLabelOptions: resolvedAnnotationLineLabelOptions,
    surfaceKey,
    activeEditedNodeId,
    blockEdgeInteractions,
    liveAnchors,
    onDistanceTriangleCornerClick,
  });
};
