import { useEffect, useMemo } from "react";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationScreenPosition,
} from "../engine";
import type {
  RuntimeEdgeRenderModel,
  RuntimePolygonFillRenderModel,
} from "../render/annotation-render-models";
import { resolveSceneSelectionTarget } from "./scene-selection-target";

type SceneSelectionHostProps = {
  engine: AnnotationEngine | null;
  enabled: boolean;
  baseEdges: readonly RuntimeEdgeRenderModel[];
  overlayEdges: readonly RuntimeEdgeRenderModel[];
  basePolygonFills: readonly RuntimePolygonFillRenderModel[];
  overlayPolygonFills: readonly RuntimePolygonFillRenderModel[];
  onAnnotationSelect: (annotationId: string | null) => void;
};

const resolveCanvasScreenPosition = (
  canvas: HTMLCanvasElement,
  event: MouseEvent
): AnnotationScreenPosition => {
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - canvasRect.left,
    y: event.clientY - canvasRect.top,
  };
};

export const SceneSelectionHost = ({
  engine,
  enabled,
  baseEdges,
  overlayEdges,
  basePolygonFills,
  overlayPolygonFills,
  onAnnotationSelect,
}: SceneSelectionHostProps) => {
  const edgeAnnotationIdsById = useMemo(
    () =>
      new Map(
        [...baseEdges, ...overlayEdges].map(
          (edge) => [edge.id, edge.annotationId ?? null] as const
        )
      ),
    [baseEdges, overlayEdges]
  );
  const polygonFillAnnotationIdsById = useMemo(
    () =>
      new Map(
        [...basePolygonFills, ...overlayPolygonFills].map(
          (polygonFill) =>
            [polygonFill.id, polygonFill.annotationId ?? null] as const
        )
      ),
    [basePolygonFills, overlayPolygonFills]
  );

  useEffect(() => {
    if (!isValidAnnotationEngine(engine) || !enabled) {
      return;
    }

    const { canvas } = engine;
    const handleClick = (event: MouseEvent) => {
      if (engine.isDestroyed()) {
        return;
      }

      const pickedIds = engine.pickAnnotationIdsAt(
        resolveCanvasScreenPosition(canvas, event)
      );
      const selectionTarget = resolveSceneSelectionTarget({
        pickedIds,
        edgeAnnotationIdsById,
        polygonFillAnnotationIdsById,
      });
      if (selectionTarget.isRuntimeTarget) {
        onAnnotationSelect(selectionTarget.annotationId);
        engine.requestRender();
        return;
      }

      onAnnotationSelect(null);
      engine.requestRender();
    };

    canvas.addEventListener("click", handleClick);

    return () => {
      canvas.removeEventListener("click", handleClick);
    };
  }, [
    edgeAnnotationIdsById,
    enabled,
    engine,
    onAnnotationSelect,
    polygonFillAnnotationIdsById,
  ]);

  return null;
};
