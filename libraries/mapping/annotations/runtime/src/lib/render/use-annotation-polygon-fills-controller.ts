import { useEffect, useRef } from "react";

import type { AnnotationEngine } from "../engine";
import type { RuntimePolygonFillRenderModel } from "./annotation-render-models";
import {
  createAnnotationPolygonFillsController,
  type AnnotationPolygonFillsController,
} from "./create-annotation-polygon-fills-controller";

export const useAnnotationPolygonFillsController = (
  engine: AnnotationEngine | null,
  polygonFills: readonly RuntimePolygonFillRenderModel[]
) => {
  const polygonFillControllerRef =
    useRef<AnnotationPolygonFillsController | null>(null);
  const latestPolygonFillsRef = useRef(polygonFills);
  latestPolygonFillsRef.current = polygonFills;

  useEffect(() => {
    const polygonFillController =
      createAnnotationPolygonFillsController(engine);
    polygonFillControllerRef.current = polygonFillController;
    polygonFillController.setPolygonFills(latestPolygonFillsRef.current);

    return () => {
      polygonFillController.destroy();
      if (polygonFillControllerRef.current === polygonFillController) {
        polygonFillControllerRef.current = null;
      }
    };
  }, [engine]);

  useEffect(() => {
    polygonFillControllerRef.current?.setPolygonFills(polygonFills);
  }, [polygonFills]);
};
