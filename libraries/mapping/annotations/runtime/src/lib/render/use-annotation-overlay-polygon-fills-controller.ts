import { useEffect, useRef } from "react";

import type { Scene } from "@carma-cesium";
import type { RuntimePolygonFillRenderModel } from "./annotation-render-models";
import {
  createAnnotationOverlayPolygonFillsController,
  type AnnotationOverlayPolygonFillsController,
} from "./create-annotation-overlay-polygon-fills-controller";

export const useAnnotationOverlayPolygonFillsController = (
  scene: Scene | null,
  polygonFills: readonly RuntimePolygonFillRenderModel[],
  surfaceKey: string
) => {
  const overlayPolygonFillControllerRef =
    useRef<AnnotationOverlayPolygonFillsController | null>(null);
  const latestPolygonFillsRef = useRef(polygonFills);
  latestPolygonFillsRef.current = polygonFills;

  useEffect(() => {
    const overlayPolygonFillController =
      createAnnotationOverlayPolygonFillsController(scene, surfaceKey);
    overlayPolygonFillControllerRef.current = overlayPolygonFillController;
    overlayPolygonFillController.setPolygonFills(latestPolygonFillsRef.current);

    return () => {
      overlayPolygonFillController.destroy();
      if (
        overlayPolygonFillControllerRef.current === overlayPolygonFillController
      ) {
        overlayPolygonFillControllerRef.current = null;
      }
    };
  }, [scene, surfaceKey]);

  useEffect(() => {
    overlayPolygonFillControllerRef.current?.setPolygonFills(polygonFills);
  }, [polygonFills]);
};
