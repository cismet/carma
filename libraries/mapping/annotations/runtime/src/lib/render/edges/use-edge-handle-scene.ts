import { useCallback, useEffect, useMemo, useRef } from "react";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import { canDrawHandlesInScene } from "../scene-markers/scene-marker-models";
import { useSceneMarkers } from "../scene-markers/use-scene-markers";
import {
  buildDistanceCornerSceneModels,
  buildInsertTickSceneMarkers,
} from "./edge-handle-scene-models";
import type { EdgeSegment } from "./edge-models";
import { useEdgeSceneLines } from "./use-edge-scene-lines";

const NO_SEGMENTS: readonly EdgeSegment[] = [];

/**
 * Insert ticks and distance corner handles drawn by an engine that offers
 * scene markers; `handlesInScene` tells the overlay hooks to keep only the
 * hit areas, which report the tick hover through `onInsertTickHoverChange`.
 */
export const useEdgeHandleScene = (
  engine: AnnotationEngine | null,
  {
    edgeSegments,
    insertTickSegments,
    showInsertTicks,
    liveAnchors,
  }: {
    edgeSegments: readonly EdgeSegment[];
    insertTickSegments: readonly EdgeSegment[];
    /** The overlay shows insert targets now (no edit, no blocked edges). */
    showInsertTicks: boolean;
    liveAnchors: LiveAnnotationAnchors;
  }
) => {
  const handlesInScene = canDrawHandlesInScene(engine);
  const hoveredInsertTickIdsRef = useRef(new Set<string>());
  const visibleTickSegments = showInsertTicks
    ? insertTickSegments
    : NO_SEGMENTS;

  // A tick that goes away while hovered never sees its mouseleave.
  useEffect(() => {
    hoveredInsertTickIdsRef.current.clear();
  }, [visibleTickSegments]);

  const onInsertTickHoverChange = useCallback(
    (edgeId: string, hovered: boolean) => {
      if (hovered) hoveredInsertTickIdsRef.current.add(edgeId);
      else hoveredInsertTickIdsRef.current.delete(edgeId);
      engine?.requestRender();
    },
    [engine]
  );

  const models = useMemo(() => {
    if (!handlesInScene) return { lines: [], markers: [] };
    const corners = buildDistanceCornerSceneModels(
      engine,
      edgeSegments,
      liveAnchors
    );
    return {
      lines: corners.lines,
      markers: [
        ...buildInsertTickSceneMarkers(
          visibleTickSegments,
          liveAnchors,
          hoveredInsertTickIdsRef.current
        ),
        ...corners.markers,
      ],
    };
  }, [edgeSegments, engine, handlesInScene, liveAnchors, visibleTickSegments]);

  // Engines without scene handles get no (empty) line collections either.
  useEdgeSceneLines(
    handlesInScene ? engine : null,
    models.lines,
    null,
    liveAnchors
  );
  useSceneMarkers(engine, models.markers);

  return {
    handlesInScene,
    onInsertTickHoverChange: handlesInScene
      ? onInsertTickHoverChange
      : undefined,
  };
};
