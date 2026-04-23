import { useEffect, useRef } from "react";

import type { Scene } from "@carma-cesium";
import type { RuntimePolygonFillRenderModel } from "./measurement-render-models";
import {
  createMeasurementOverlayPolygonFillsController,
  type MeasurementOverlayPolygonFillsController,
} from "./measurement-overlay-polygon-fills-controller.shared";

export const useMeasurementOverlayPolygonFillsController = (
  scene: Scene | null,
  polygonFills: readonly RuntimePolygonFillRenderModel[],
  surfaceKey: string
) => {
  const overlayPolygonFillControllerRef =
    useRef<MeasurementOverlayPolygonFillsController | null>(null);

  useEffect(() => {
    overlayPolygonFillControllerRef.current?.destroy();
    overlayPolygonFillControllerRef.current =
      createMeasurementOverlayPolygonFillsController(scene, surfaceKey);

    return () => {
      overlayPolygonFillControllerRef.current?.destroy();
      overlayPolygonFillControllerRef.current = null;
    };
  }, [scene, surfaceKey]);

  useEffect(() => {
    overlayPolygonFillControllerRef.current?.setPolygonFills(polygonFills);
  }, [polygonFills]);
};
