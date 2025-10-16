import { useEffect, useRef } from "react";
import {
  Camera,
  Cartesian3,
  Cartographic,
  HeadingPitchRange,
  Math as CesiumMath,
  Rectangle,
  Viewer,
} from "cesium";

import { useCesiumContext } from "./useCesiumContext";
import { CtxEvent } from "../cesiumContextEventMap";
import { configureCesiumErrorHandling } from "../utils/cesiumErrorHandling";

const DEFAULT_HPR = new HeadingPitchRange(
  CesiumMath.toRadians(0),
  CesiumMath.toRadians(-45),
  700
);

export const useInitCesiumWidget = (
  containerRef?: React.RefObject<HTMLDivElement>,
  options?: Viewer.ConstructorOptions
) => {
  const {
    widgetRef,
    sceneRef,
    homePositionRef,
    minZoomDistanceRef,
    maxZoomDistanceRef,
    enableCollisionDetectionRef,
    isSuspendedRef,
    emit,
  } = useCesiumContext();

  const isInitializedRef = useRef(false);

  useEffect(() => {
    const home = homePositionRef.current;
    if (home) {
      const homePos = new Cartesian3(home.x, home.y, home.z);
      const { longitude, latitude } = Cartographic.fromCartesian(homePos);
      const rect = new Rectangle(longitude, latitude, longitude, latitude);
      Camera.DEFAULT_VIEW_RECTANGLE = rect;
      Camera.DEFAULT_OFFSET = DEFAULT_HPR;
    }
  }, [homePositionRef]);

  useEffect(() => {
    if (!containerRef?.current) return;
    if (isInitializedRef.current) return;

    // LAZY INIT: Only create Viewer when not suspended (3D mode active)
    if (isSuspendedRef.current) {
      console.debug(
        "[CESIUM|INIT] Skipping viewer creation - suspended (2D mode)"
      );
      return;
    }

    try {
      if (widgetRef.current && !widgetRef.current.isDestroyed()) {
        isInitializedRef.current = true;
        return;
      }

      console.debug("[CESIUM|INIT] Creating Cesium Viewer (lazy init)");
      const widget = new Viewer(containerRef.current, options);
      widgetRef.current = widget;
      sceneRef.current = widget.scene;
      isInitializedRef.current = true;

      configureCesiumErrorHandling(widget, {
        suppressErrorPanel: true,
        suppressErrorBoundaryForwarding: true,
        logLevel: "warn",
      });

      const handlePostRender = () => {
        const scene = sceneRef.current;
        const widget = widgetRef.current;

        if (!scene || !widget) {
          scene?.postRender.removeEventListener(handlePostRender);
          return;
        }

        if (widget.canvas.width > 0 && widget.canvas.height > 0) {
          emit(CtxEvent.SceneReady, undefined);
          scene.postRender.removeEventListener(handlePostRender);
        }
      };

      widget.scene.postRender.addEventListener(handlePostRender);
    } catch (error) {
      console.error("[CESIUM|INIT] Error:", error);
    }

    return () => {};
  }, [containerRef, options, widgetRef, sceneRef, isSuspendedRef, emit]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const sscc = scene.screenSpaceCameraController;
    const minZoom = minZoomDistanceRef.current;
    const maxZoom = maxZoomDistanceRef.current;
    const enableCollision = enableCollisionDetectionRef.current;

    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.translucency.enabled = true;
    scene.globe.translucency.frontFaceAlpha = 1.0;
    scene.globe.translucency.backFaceAlpha = 1.0;

    sscc.enableCollisionDetection = enableCollision;
    sscc.minimumZoomDistance = minZoom ?? 1;
    sscc.maximumZoomDistance = maxZoom ?? Infinity;
  }, [
    sceneRef,
    minZoomDistanceRef,
    maxZoomDistanceRef,
    enableCollisionDetectionRef,
  ]);

  useEffect(() => {
    const widget = widgetRef.current;
    const container = containerRef?.current;

    if (!widget || !container) return;

    const resizeObserver = new ResizeObserver(() => {
      if (widget && !widget.isDestroyed() && containerRef?.current) {
        widget.canvas.width = containerRef.current.clientWidth;
        widget.canvas.height = containerRef.current.clientHeight;
        widget.canvas.style.width = "100%";
        widget.canvas.style.height = "100%";
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [widgetRef, containerRef]);
};

export default useInitCesiumWidget;
