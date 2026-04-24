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
  const latestPolygonFillsRef = useRef(polygonFills);
  latestPolygonFillsRef.current = polygonFills;

  useEffect(() => {
    const polygonFillController =
      createMeasurementPolygonFillsController(scene);
    polygonFillControllerRef.current = polygonFillController;
    polygonFillController.setPolygonFills(latestPolygonFillsRef.current);

    return () => {
      polygonFillController.destroy();
      if (polygonFillControllerRef.current === polygonFillController) {
        polygonFillControllerRef.current = null;
      }
    };
  }, [scene]);

  useEffect(() => {
    polygonFillControllerRef.current?.setPolygonFills(polygonFills);
  }, [polygonFills]);
};
