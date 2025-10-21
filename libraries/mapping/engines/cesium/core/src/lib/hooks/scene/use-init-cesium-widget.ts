import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Cartographic,
  CesiumWidget,
  HeadingPitchRange,
  CesiumMath,
  Rectangle,
  flyToTarget,
} from "@carma/cesium";
import { useCesiumContext } from "../../context";
import { CtxEvent } from "../../context/cesium-context-event-map";
import { configureCesiumErrorHandling } from "../../scene/environment/error-handling";
import {
  validateCesiumWorkers,
  isCesiumBaseUrlConfigured,
} from "../../utils/cesium-asset-validation";

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
    homeRef,
    minZoomDistanceRef,
    maxZoomDistanceRef,
    enableCollisionDetectionRef,
    isSuspendedRef,
    emit,
    subscribe,
    config,
    activationCount,
  } = useCesiumContext();

  const isInitializedRef = useRef(false);
  const validationAttemptedRef = useRef(false);

  useEffect(() => {
    const home = homeRef.current;
    if (home?.target) {
      const { longitude, latitude } = Cartographic.fromCartesian(home.target);
      const rect = new Rectangle(
        longitude - 0.001,
        latitude - 0.001,
        longitude + 0.001,
        latitude + 0.001
      );
      Camera.DEFAULT_VIEW_RECTANGLE = rect;
      Camera.DEFAULT_OFFSET = DEFAULT_HPR;
    }
  }, [homeRef]);

  useEffect(() => {
    if (!containerRef?.current) return;
    if (isInitializedRef.current) return;

    // Validate Cesium assets before attempting to initialize
    if (!validationAttemptedRef.current) {
      validationAttemptedRef.current = true;
      const baseUrl = config.baseUrl;

      if (!isCesiumBaseUrlConfigured(baseUrl)) {
        console.error(
          "[CESIUM|INIT] Cesium baseUrl is not configured. " +
            "Add baseUrl to your CesiumConfig and ensure cesium assets are copied via vite-plugin-static-copy."
        );
        return;
      }

      // Async validation
      validateCesiumWorkers(baseUrl).then((result) => {
        if (!result.available) {
          console.error(
            "[CESIUM|INIT] Cesium asset validation failed:",
            result.error,
            "\n\nEnsure your vite.config includes:\n" +
              `viteStaticCopy({ targets: [{ src: 'node_modules/cesium/Build/Cesium/*', dest: '${baseUrl?.replace(
                /^\//,
                ""
              )}' }] })`
          );
        }
      });
    }

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

          // TODO: Error handling temporarily disabled to debug rendering
          // configureCesiumErrorHandling(widget, {
          //   suppressErrorPanel: true,
          //   suppressErrorBoundaryForwarding: true,
          //   logLevel: "warn",
          // });
          console.debug(
            "[CESIUM|INIT] Initialization complete (error handling disabled for debugging)"
          );
        }
      };

      widget.scene.postRender.addEventListener(handlePostRender);

      // Set initial camera view to home position (instant, no animation)
      const home = homeRef.current;
      if (home) {
        const { target, orientation } = home;

        if (orientation) {
          // Use flyToTarget with 0 duration for instant positioning
          flyToTarget(widget.scene.camera, target, orientation, 0);
          console.debug(
            "[CESIUM|INIT] Camera positioned with HPR (instant)",
            home
          );
        } else {
          // Fallback to default HPR
          widget.scene.camera.setView({
            destination: target,
            orientation: DEFAULT_HPR,
          });
          console.debug(
            "[CESIUM|INIT] Camera positioned at target (no orientation)",
            home
          );
        }
      }

      // CRITICAL: Request initial render since we use requestRenderMode
      // Without this, nothing will display!
      // BUT: Only if canvas has valid dimensions
      if (widget.canvas.width > 0 && widget.canvas.height > 0) {
        widget.scene.requestRender();
        console.debug("[CESIUM|INIT] Initial render requested");
      } else {
        console.warn(
          "[CESIUM|INIT] Skipping initial render - canvas has zero size",
          {
            width: widget.canvas.width,
            height: widget.canvas.height,
          }
        );
      }
    } catch (error) {
      console.error("[CESIUM|INIT] Error:", error);
    }

    return () => {
      // Cleanup: destroy widget ONLY on actual unmount, not on re-renders
      // Check if widget is still valid - if so, this is just a re-render, not unmount
      const widget = widgetRef.current;

      try {
        if (widget && !widget.isDestroyed()) {
          // If scene is valid, this is likely a re-render with new options
          // Don't destroy the widget as this breaks mid-transition
          const scene = sceneRef.current;
          if (scene && !scene.isDestroyed()) {
            console.debug(
              "[CESIUM|CLEANUP] Skipping widget destruction (scene still valid)"
            );
            return;
          }

          console.debug("[CESIUM|CLEANUP] Destroying widget");
          widget.destroy();
          widgetRef.current = null;
          sceneRef.current = null;
        }
      } catch (error) {
        console.warn("[CESIUM|CLEANUP] Error during widget cleanup:", error);
      }
    };
  }, [
    containerRef,
    options,
    widgetRef,
    sceneRef,
    isSuspendedRef,
    emit,
    homeRef,
    config.baseUrl,
    activationCount, // Re-run when Activate event fires
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

    let resizeCount = 0;
    const MAX_DIMENSION = 4000;

    const resizeObserver = new ResizeObserver((entries) => {
      resizeCount++;

      if (widget && !widget.isDestroyed() && containerRef?.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;

        // Log every resize with full details
        console.log(`[CESIUM|RESIZE] Event #${resizeCount}:`, {
          containerDimensions: { newWidth, newHeight },
          canvasDimensions: {
            width: widget.canvas.width,
            height: widget.canvas.height,
            styleWidth: widget.canvas.style.width,
            styleHeight: widget.canvas.style.height,
          },
          entries: entries.map((e) => ({
            contentRect: e.contentRect,
            target: e.target.className,
          })),
        });

        // Detect absurd dimensions - log with stack trace
        if (newWidth > MAX_DIMENSION || newHeight > MAX_DIMENSION) {
          console.error(
            `[CESIUM|RESIZE] ⚠️ ABSURD DIMENSIONS #${resizeCount}:`,
            {
              newWidth,
              newHeight,
              MAX_DIMENSION,
            }
          );
          console.trace("[CESIUM|RESIZE] Stack trace:");
        }

        // Clamp dimensions
        const clampedWidth = Math.min(newWidth, MAX_DIMENSION);
        const clampedHeight = Math.min(newHeight, MAX_DIMENSION);

        // Only resize if dimensions are reasonable and actually changed
        if (
          clampedWidth > 0 &&
          clampedHeight > 0 &&
          (widget.canvas.width !== clampedWidth ||
            widget.canvas.height !== clampedHeight)
        ) {
          console.log(`[CESIUM|RESIZE] Applying resize #${resizeCount}:`, {
            from: { width: widget.canvas.width, height: widget.canvas.height },
            to: { width: clampedWidth, height: clampedHeight },
          });

          widget.canvas.width = clampedWidth;
          widget.canvas.height = clampedHeight;
          widget.canvas.style.width = "100%";
          widget.canvas.style.height = "100%";

          // Request render after resize
          widget.scene.requestRender();
        }
      }
    });

    console.log("[CESIUM|RESIZE] Setting up ResizeObserver", {
      container: container.className,
      initialSize: {
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
      },
    });

    resizeObserver.observe(container);

    return () => {
      console.log(`[CESIUM|RESIZE] Disconnecting after ${resizeCount} events`);
      resizeObserver.disconnect();
    };
  }, [widgetRef, containerRef]);
};

export default useInitCesiumWidget;
