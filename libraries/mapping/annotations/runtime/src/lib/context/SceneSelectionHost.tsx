import { useEffect, useMemo } from "react";
import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
  type Scene,
} from "@carma-cesium";

import type {
  RuntimeEdgeRenderModel,
  RuntimePolygonFillRenderModel,
} from "../render/annotation-render-models";
import { resolveSceneSelectionTarget } from "./scene-selection-target";

type SceneSelectionHostProps = {
  scene: Scene | null;
  enabled: boolean;
  baseEdges: readonly RuntimeEdgeRenderModel[];
  overlayEdges: readonly RuntimeEdgeRenderModel[];
  basePolygonFills: readonly RuntimePolygonFillRenderModel[];
  overlayPolygonFills: readonly RuntimePolygonFillRenderModel[];
  onAnnotationSelect: (annotationId: string | null) => void;
};

export const SceneSelectionHost = ({
  scene,
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
    if (!scene || scene.isDestroyed() || !enabled) {
      return;
    }

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const pickedObject = scene.pick(event.position);
      const selectionTarget = resolveSceneSelectionTarget({
        pickedObject,
        edgeAnnotationIdsById,
        polygonFillAnnotationIdsById,
      });
      if (selectionTarget.isRuntimeTarget) {
        onAnnotationSelect(selectionTarget.annotationId);
        scene.requestRender();
        return;
      }

      onAnnotationSelect(null);
      scene.requestRender();
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [
    edgeAnnotationIdsById,
    enabled,
    onAnnotationSelect,
    polygonFillAnnotationIdsById,
    scene,
  ]);

  return null;
};
