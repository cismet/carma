import { useEffect, useMemo } from "react";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";
import { getScreenPositionDistance } from "../engine/point-query-helpers";
import {
  CLICK_PIXEL_TOLERANCE,
  LEFT_POINTER_BUTTON,
  getCanvasScreenPosition,
} from "../engine/point-query-input";
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

const hasModifier = (event: MouseEvent) =>
  event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;

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
    let pressPosition: AnnotationScreenPosition | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      pressPosition =
        event.button === LEFT_POINTER_BUTTON
          ? getCanvasScreenPosition(canvas, event)
          : null;
    };
    // A plain left click only: a camera drag or a modifier click keeps the
    // selection.
    const handleClick = (event: MouseEvent) => {
      const press = pressPosition;
      pressPosition = null;
      if (engine.isDestroyed() || hasModifier(event) || !press) {
        return;
      }
      const position = getCanvasScreenPosition(canvas, event);
      if (getScreenPositionDistance(press, position) > CLICK_PIXEL_TOLERANCE) {
        return;
      }

      const pickedIds = engine.pickAnnotationIdsAt(position);
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

    canvas.addEventListener("pointerdown", handlePointerDown, {
      capture: true,
    });
    canvas.addEventListener("click", handleClick);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
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
