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
} from "../render/measurement-render-models";
import { resolveSceneSelectionTarget } from "./scene-selection-target";

type SceneSelectionHostProps = {
  scene: Scene | null;
  enabled: boolean;
  baseEdges: readonly RuntimeEdgeRenderModel[];
  overlayEdges: readonly RuntimeEdgeRenderModel[];
  basePolygonFills: readonly RuntimePolygonFillRenderModel[];
  overlayPolygonFills: readonly RuntimePolygonFillRenderModel[];
  onMeasurementSelect: (annotationId: string | null) => void;
};

export const SceneSelectionHost = ({
  scene,
  enabled,
  baseEdges,
  overlayEdges,
  basePolygonFills,
  overlayPolygonFills,
  onMeasurementSelect,
}: SceneSelectionHostProps) => {
  const edgeMeasurementIdsById = useMemo(
    () =>
      new Map(
        [...baseEdges, ...overlayEdges].map(
          (edge) => [edge.id, edge.measurementId ?? null] as const
        )
      ),
    [baseEdges, overlayEdges]
  );
  const polygonFillMeasurementIdsById = useMemo(
    () =>
      new Map(
        [...basePolygonFills, ...overlayPolygonFills].map(
          (polygonFill) =>
            [polygonFill.id, polygonFill.measurementId ?? null] as const
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
        edgeMeasurementIdsById,
        polygonFillMeasurementIdsById,
      });
      if (selectionTarget.isRuntimeTarget) {
        onMeasurementSelect(selectionTarget.measurementId);
        scene.requestRender();
        return;
      }

      onMeasurementSelect(null);
      scene.requestRender();
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [
    edgeMeasurementIdsById,
    enabled,
    onMeasurementSelect,
    polygonFillMeasurementIdsById,
    scene,
  ]);

  return null;
};
