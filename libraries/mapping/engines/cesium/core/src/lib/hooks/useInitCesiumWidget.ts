import { useEffect, useRef } from "react";
import {
  Camera,
  Cartesian3,
  Cartographic,
  CesiumWidget,
  HeadingPitchRange,
  Math as CesiumMath,
  Rectangle,
} from "cesium";
import { useCesiumContext } from "../context";
import { CtxEvent } from "../context/cesiumContextEventMap";
import { configureCesiumErrorHandling } from "../environment/errorHandling";

const DEFAULT_HPR = new HeadingPitchRange(
  CesiumMath.toRadians(0),
  CesiumMath.toRadians(-45),
  700
);

export const useInitCesiumWidget = (
  containerRef?: React.RefObject<HTMLDivElement>,
  options?: ConstructorParameters<typeof CesiumWidget>[1]
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
      const rect = new Rectangle(
        longitude - 0.001,
        latitude - 0.001,
        longitude + 0.001,
        latitude + 0.001
      );
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
      console.debug("[CESIUM|INIT] options", options);
      const widget = new CesiumWidget(containerRef.current, options);
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

      // Set initial camera view to home position
      const home = homePositionRef.current;
      if (home) {
        const homePos = new Cartesian3(home.x, home.y, home.z);
        widget.scene.camera.setView({
          destination: homePos,
          orientation: DEFAULT_HPR,
        });
        console.debug("[CESIUM|INIT] Camera positioned at home", home);
      }

      // CRITICAL: Request initial render since we use requestRenderMode
      // Without this, nothing will display!
      widget.scene.requestRender();
      console.debug("[CESIUM|INIT] Initial render requested");
    } catch (error) {
      console.error("[CESIUM|INIT] Error:", error);
    }

    return () => {};
  }, [
    containerRef,
    options,
    widgetRef,
    sceneRef,
    isSuspendedRef,
    emit,
    homePositionRef,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const sscc = scene.screenSpaceCameraController;
    const minZoom = minZoomDistanceRef.current;
    const maxZoom = maxZoomDistanceRef.current;
    const enableCollision = enableCollisionDetectionRef.current;

    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.translucency.enabled = false;

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
