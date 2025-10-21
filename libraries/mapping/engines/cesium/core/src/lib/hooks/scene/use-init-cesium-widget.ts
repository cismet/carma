import { useEffect, useRef } from "react";
import type { CesiumWidget } from "@carma/cesium";
import { useCesiumContext } from "../../context";
import { CtxEvent } from "../../context/cesium-context-event-map";
import { configureCesiumErrorHandling } from "../../scene/environment/error-handling";
import {
  validateCesiumWorkers,
  isCesiumBaseUrlConfigured,
} from "../../utils/cesium-asset-validation";

// Default HPR values (will be created with actual imports)
const DEFAULT_HPR_VALUES = {
  heading: 0, // degrees
  pitch: -45, // degrees
  range: 700,
};

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
    emit,
    subscribe,
    config,
    activationCount,
  } = useCesiumContext();

  const isInitializedRef = useRef(false);
  const validationAttemptedRef = useRef(false);

  // Setup default camera view when Cesium loads
  const setupDefaultCameraView = async (home: { target?: any }) => {
    if (!home?.target) return;

    const { Camera, Cartographic, Rectangle, HeadingPitchRange, CesiumMath } =
      await import("@carma/cesium");
    const { longitude, latitude } = Cartographic.fromCartesian(home.target);
    const rect = new Rectangle(
      longitude - 0.001,
      latitude - 0.001,
      longitude + 0.001,
      latitude + 0.001
    );
    Camera.DEFAULT_VIEW_RECTANGLE = rect;
    Camera.DEFAULT_OFFSET = new HeadingPitchRange(
      CesiumMath.toRadians(DEFAULT_HPR_VALUES.heading),
      CesiumMath.toRadians(DEFAULT_HPR_VALUES.pitch),
      DEFAULT_HPR_VALUES.range
    );
  };

  useEffect(() => {
    const container = containerRef?.current;
    const hasValidDimensions =
      container && container.clientWidth > 0 && container.clientHeight > 0;

    console.log(
      `[CESIUM|INIT] useEffect triggered - Container: ${
        container
          ? `${container.clientWidth}x${container.clientHeight}`
          : "null"
      }, Initialized: ${
        isInitializedRef.current
      }, ActivationCount: ${activationCount}`
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

    // LAZY INIT: Only create widget when activated (3D mode requested)
    // Use activationCount instead of isSuspendedRef to avoid race condition
    // isSuspendedRef is set by subscription which may not have run yet
    if (activationCount === 0) {
      console.debug(
        "[CESIUM|INIT] Skipping widget creation - not yet activated (2D mode)"
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
        const {
          CesiumWidget,
          HeadingPitchRange,
          CesiumMath,
          flyToTarget: flyToTargetFn,
        } = await import("@carma/cesium");
        console.debug("[CESIUM|INIT] Cesium bundle loaded, creating widget");

        // Setup default camera view
        await setupDefaultCameraView(homeRef.current);

        console.debug("[CESIUM|INIT] options", options);
        const widget = new CesiumWidget(containerRef.current, options);
        widgetRef.current = widget;
        sceneRef.current = widget.scene;
        isInitializedRef.current = true;

        console.log(
          `[CESIUM|INIT] Widget created - Container: ${containerRef.current.clientWidth}x${containerRef.current.clientHeight}, Canvas: ${widget.canvas.width}x${widget.canvas.height}, Style: ${widget.canvas.style.width}x${widget.canvas.style.height}, ResScale: ${widget.resolutionScale}`
        );

        // CRITICAL: Explicitly size canvas to container
        // CesiumWidget doesn't automatically resize canvas to container dimensions
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        widget.canvas.width = containerWidth;
        widget.canvas.height = containerHeight;
        widget.canvas.style.width = "100%";
        widget.canvas.style.height = "100%";

        console.log(
          `[CESIUM|INIT] Canvas resized - Container: ${containerWidth}x${containerHeight}, Canvas: ${widget.canvas.width}x${widget.canvas.height}, Style: ${widget.canvas.style.width}x${widget.canvas.style.height}`
        );

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
            emit(CtxEvent.SceneReady, undefined);
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

        // Set initial camera view to home position (instant, no animation)
        const home = homeRef.current;
        if (home) {
          const { target, orientation } = home;

          if (orientation) {
            // Use flyToTarget with 0 duration for instant positioning
            flyToTargetFn(widget.scene.camera, target, orientation, 0);
            console.debug(
              "[CESIUM|INIT] Camera positioned with HPR (instant)",
              home
            );
          } else {
            // Fallback: Use default orientation if not provided
            const defaultHPR = new HeadingPitchRange(
              CesiumMath.toRadians(DEFAULT_HPR_VALUES.heading),
              CesiumMath.toRadians(DEFAULT_HPR_VALUES.pitch),
              DEFAULT_HPR_VALUES.range
            );
            flyToTargetFn(widget.scene.camera, target, defaultHPR, 0);
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
    options,
    widgetRef,
    sceneRef,
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
};

export default useInitCesiumWidget;
