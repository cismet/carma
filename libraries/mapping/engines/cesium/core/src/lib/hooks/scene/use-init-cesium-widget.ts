import { useEffect, useRef } from "react";
import type { CesiumWidget } from "@carma/cesium";
import { useCesiumContext } from "../../context";
import { configureCesiumErrorHandling } from "../../scene/environment/error-handling";
import {
  validateCesiumWorkers,
  isCesiumBaseUrlConfigured,
} from "../../utils/cesium-asset-validation";

export const useInitCesiumWidget = (
  containerRef?: React.RefObject<HTMLDivElement>,
  isActive?: boolean,
  options?: ConstructorParameters<typeof CesiumWidget>[1]
) => {
  const {
    widgetRef,
    sceneRef,
    minZoomDistanceRef,
    maxZoomDistanceRef,
    enableCollisionDetectionRef,
    sceneStyleReadyCallbackRef,
    config,
  } = useCesiumContext();

  const isInitializedRef = useRef(false);
  const validationAttemptedRef = useRef(false);
  const resizeCalledRef = useRef(false);

  useEffect(() => {
    const container = containerRef?.current;
    const hasValidDimensions =
      container && container.clientWidth > 0 && container.clientHeight > 0;

    console.log(
      `[CESIUM|INIT] useEffect triggered - Container: ${
        container
          ? `${container.clientWidth}x${container.clientHeight}`
          : "null"
      }, Initialized: ${isInitializedRef.current}, isActive: ${isActive}`
    );

    if (!container) {
      console.log("[CESIUM|INIT] No container ref, skipping");
      return;
    }

    if (!hasValidDimensions) {
      console.warn(
        `[CESIUM|INIT] Container has zero dimensions, waiting for layout: ${container.clientWidth}x${container.clientHeight}`
      );
      return;
    }

    if (isInitializedRef.current) {
      console.log("[CESIUM|INIT] Already initialized, skipping");
      return;
    }

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

    // LAZY INIT: Only create widget when isActive prop is true
    if (!isActive) {
      console.debug(
        "[CESIUM|INIT] Skipping widget creation - not active (2D mode)"
      );
      return;
    }

    // Dynamic import: Load Cesium bundle only when activating 3D mode
    (async () => {
      try {
        if (widgetRef.current && !widgetRef.current.isDestroyed()) {
          isInitializedRef.current = true;
          return;
        }

        console.debug("[CESIUM|INIT] Loading Cesium bundle...");
        const { CesiumWidget } = await import("@carma/cesium");
        console.debug("[CESIUM|INIT] Cesium bundle loaded, creating widget");

        // Initialize lazy validators now that Cesium is loaded
        const { initializeLazyValidators } = await import(
          "../../utils/lazy-validators"
        );
        await initializeLazyValidators();

        console.debug("[CESIUM|INIT] options", options);
        const container = containerRef.current;
        if (!container) throw new Error("Container ref is null");

        // Ensure container has valid dimensions before creating widget
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        console.debug(
          `[CESIUM|INIT] Container dimensions before widget creation: ${containerWidth}x${containerHeight}`
        );

        if (containerWidth === 0 || containerHeight === 0) {
          throw new Error(
            `Container has invalid dimensions: ${containerWidth}x${containerHeight}`
          );
        }

        const widget = new CesiumWidget(container, options);
        widgetRef.current = widget;
        sceneRef.current = widget.scene;
        isInitializedRef.current = true;

        console.log(
          `[CESIUM|INIT] Widget created - Container: ${containerWidth}x${containerHeight}, Canvas: ${widget.canvas.width}x${widget.canvas.height}, Style: ${widget.canvas.style.width}x${widget.canvas.style.height}, ResScale: ${widget.resolutionScale}`
        );

        // CesiumWidget creates canvas with default 600x300 size
        // Manually set canvas dimensions (widget.resize() incorrectly applies DPR)
        if (
          !resizeCalledRef.current &&
          (widget.canvas.width !== containerWidth ||
            widget.canvas.height !== containerHeight)
        ) {
          console.log(
            `[CESIUM|INIT] Canvas size mismatch, manually resizing canvas`
          );
          resizeCalledRef.current = true;

          // Set canvas pixel dimensions
          widget.canvas.width = containerWidth;
          widget.canvas.height = containerHeight;

          // Set canvas CSS dimensions
          widget.canvas.style.width = "100%";
          widget.canvas.style.height = "100%";

          // Update camera frustum aspect ratio (only for PerspectiveFrustum)
          const camera = widget.scene.camera;
          if (camera.frustum && "aspectRatio" in camera.frustum) {
            camera.frustum.aspectRatio = containerWidth / containerHeight;
            console.log(
              `[CESIUM|INIT] After manual resize - Canvas: ${widget.canvas.width}x${widget.canvas.height}, AspectRatio: ${camera.frustum.aspectRatio}`
            );
          }
        }

        // Apply screenSpaceCameraController settings from config
        const sscc = widget.scene.screenSpaceCameraController;
        if (config?.screenSpaceCameraController) {
          const ssccConfig = config.screenSpaceCameraController;
          if (ssccConfig.enableCollisionDetection !== undefined) {
            sscc.enableCollisionDetection = ssccConfig.enableCollisionDetection;
          }
          if (ssccConfig.minimumZoomDistance !== undefined) {
            sscc.minimumZoomDistance = ssccConfig.minimumZoomDistance;
          }
          if (ssccConfig.maximumZoomDistance !== undefined) {
            sscc.maximumZoomDistance = ssccConfig.maximumZoomDistance;
          }
          console.debug(
            "[CESIUM|INIT] ScreenSpaceCameraController configured",
            {
              enableCollisionDetection: sscc.enableCollisionDetection,
              minimumZoomDistance: sscc.minimumZoomDistance,
              maximumZoomDistance: sscc.maximumZoomDistance,
            }
          );
        }

        const handlePostRender = () => {
          const scene = sceneRef.current;
          const widget = widgetRef.current;

          if (!scene || !widget) {
            scene?.postRender.removeEventListener(handlePostRender);
            return;
          }

          if (widget.canvas.width > 0 && widget.canvas.height > 0) {
            // Direct callback instead of event emission
            sceneStyleReadyCallbackRef.current?.(true, "scene-ready");
            scene.postRender.removeEventListener(handlePostRender);

            // Configure error handling to suppress panels but allow recovery
            configureCesiumErrorHandling(widget, {
              suppressErrorPanel: true,
              suppressErrorBoundaryForwarding: true,
              logLevel: "warn",
            });
            console.debug(
              "[CESIUM|INIT] Initialization complete with error recovery enabled"
            );
          }
        };

        widget.scene.postRender.addEventListener(handlePostRender);

        // Camera positioning is handled by use-context-setup-subscriptions
        // which listens to the SceneReady event and positions the camera
        console.debug(
          "[CESIUM|INIT] Widget initialized, camera will be positioned by context"
        );

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
    })();

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
    isActive, // Re-run when isActive changes
    options,
    widgetRef,
    sceneRef,
    sceneStyleReadyCallbackRef,
    config.baseUrl,
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

    const resizeObserver = new ResizeObserver(() => {
      resizeCount++;

      if (widget && !widget.isDestroyed() && containerRef?.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;

        // Log every resize with plain dimensions
        console.log(
          `[CESIUM|RESIZE] Event #${resizeCount} - Container: ${newWidth}x${newHeight}, Canvas: ${widget.canvas.width}x${widget.canvas.height}, Style: ${widget.canvas.style.width}x${widget.canvas.style.height}, ResScale: ${widget.resolutionScale}`
        );

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
          const beforeWidth = widget.canvas.width;
          const beforeHeight = widget.canvas.height;

          widget.canvas.width = clampedWidth;
          widget.canvas.height = clampedHeight;
          widget.canvas.style.width = "100%";
          widget.canvas.style.height = "100%";

          console.log(
            `[CESIUM|RESIZE] Applied #${resizeCount} - Before: ${beforeWidth}x${beforeHeight}, After: ${widget.canvas.width}x${widget.canvas.height}, Container: ${clampedWidth}x${clampedHeight}`
          );

          // Request render after resize
          widget.scene.requestRender();
        }
      }
    });

    console.log(
      `[CESIUM|RESIZE] Setting up ResizeObserver - Container: ${container.clientWidth}x${container.clientHeight} (${container.className})`
    );

    resizeObserver.observe(container);

    return () => {
      console.log(`[CESIUM|RESIZE] Disconnecting after ${resizeCount} events`);
      resizeObserver.disconnect();
    };
  }, [widgetRef, containerRef]);

  return { widgetRef, sceneRef };
};

export default useInitCesiumWidget;
