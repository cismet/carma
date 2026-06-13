import { useEffect, useRef } from "react";

import type { Scene } from "@carma-cesium";
import type { RuntimePolygonFillRenderModel } from "./annotation-render-models";
import {
  createAnnotationPolygonFillsController,
  type AnnotationPolygonFillsController,
} from "./annotation-polygon-fills-controller.shared";

export const useAnnotationPolygonFillsController = (
  scene: Scene | null,
  polygonFills: readonly RuntimePolygonFillRenderModel[]
) => {
  const polygonFillControllerRef =
    useRef<AnnotationPolygonFillsController | null>(null);
  const latestPolygonFillsRef = useRef(polygonFills);
  latestPolygonFillsRef.current = polygonFills;

  useEffect(() => {
    const polygonFillController =
      createAnnotationPolygonFillsController(scene);
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
