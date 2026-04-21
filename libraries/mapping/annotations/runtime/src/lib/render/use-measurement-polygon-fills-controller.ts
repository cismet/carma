import { useEffect, useRef } from "react";

import type { Scene } from "@carma-cesium";
import type { RuntimePolygonFillRenderModel } from "./measurement-render-models";
import {
  createMeasurementPolygonFillsController,
  type MeasurementPolygonFillsController,
} from "./measurement-polygon-fills-controller.shared";

export const useMeasurementPolygonFillsController = (
  scene: Scene | null,
  polygonFills: readonly RuntimePolygonFillRenderModel[]
) => {
  const polygonFillControllerRef =
    useRef<MeasurementPolygonFillsController | null>(null);

  useEffect(() => {
    polygonFillControllerRef.current?.destroy();
    polygonFillControllerRef.current =
      createMeasurementPolygonFillsController(scene);

    return () => {
      polygonFillControllerRef.current?.destroy();
      polygonFillControllerRef.current = null;
    };
  }, [scene]);

  useEffect(() => {
    polygonFillControllerRef.current?.setPolygonFills(polygonFills);
  }, [polygonFills]);
};
