import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import {
  readLongerEdgeFovFromIntrinsics,
  readRangeFromMetersPerCssPixel,
} from "@carma-commons/camera/model";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma-geo/utils";
import {
  Camera,
  Cartesian3,
  Cartographic,
  CesiumWidget,
  Matrix4,
  PerspectiveFrustum,
  Rectangle,
  ScreenSpaceCameraController,
  Color,
  Globe,
  Ellipsoid,
  type Scene,
  CesiumMath,
} from "@carma-cesium";
import {
  createMinimalCesiumWidget,
  colorFromConstructorArgs,
  waitForRenderFrames,
  writePerspectiveFrustumLongerEdgeFov,
  writePerspectiveFrustumVerticalFov,
} from "@carma-mapping/engines/cesium/core";

import { useCesiumContext } from "./useCesiumContext";

import {
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectShowSecondaryTileset,
  selectCurrentSceneStyle,
  selectSceneStylePrimary,
  selectSceneStyleSecondary,
} from "../slices/cesium";

import { configureCesiumErrorHandling } from "../utils/cesiumErrorHandling";
import { validateWorldCoordinate } from "../utils/positions";

import type { InitialCameraView } from "../CesiumHost";
import type { CesiumWidgetConstructorOptions } from "../cesiumWidgetDefaults";

// Type for storing position and orientation
interface CameraState {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  postionCartographic?: Cartographic;
}

type ContainerViewport = {
  width: number;
  height: number;
};

const readContainerViewport = (
  container: HTMLDivElement | null | undefined
): ContainerViewport | null => {
  if (!container) {
    return null;
  }

  const rect = container.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { width, height };
};

const postRenderHandlerMap: WeakMap<CesiumWidget, () => void> = new WeakMap();
const cameraChangedHandlerMap: WeakMap<CesiumWidget, () => void> =
  new WeakMap();
const initialViewSetMap: WeakMap<CesiumWidget, boolean> = new WeakMap();

const DEFAULT_INITIAL_CAMERA_FOV_RAD = CesiumMath.PI_OVER_THREE;
const CANONICAL_MAPLIBRE_TILE_SIZE_PX = 512;
const MIN_INITIAL_CAMERA_RANGE_M = 0.01;
const INITIAL_VIEW_STABLE_REQUIRED_FRAMES = 6;
const INITIAL_VIEW_STABLE_MAX_FRAMES = 120;
const INITIAL_VIEW_POSITION_EPSILON_M = 0.02;
const INITIAL_VIEW_ANGLE_EPSILON_RAD = 1e-4;

const readCameraDestinationFromAnchorAndZoom = ({
  anchor,
  zoom,
  direction,
  longerEdgeFovRad,
  viewportWidthPx,
  viewportHeightPx,
}: {
  anchor: Cartographic;
  zoom: number;
  direction: Cartesian3;
  longerEdgeFovRad: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
}): Cartesian3 | null => {
  const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    anchor.latitude as Parameters<
      typeof getPixelResolutionFromZoomAtLatitudeRad
    >[1],
    { tileSize: CANONICAL_MAPLIBRE_TILE_SIZE_PX }
  );
  const rangeM = readRangeFromMetersPerCssPixel({
    metersPerCssPixel,
    fovRad: longerEdgeFovRad,
    minRangeM: MIN_INITIAL_CAMERA_RANGE_M,
    viewportWidthPx,
    viewportHeightPx,
  });
  if (!Number.isFinite(rangeM)) {
    return null;
  }

  const anchorCartesian = Cartographic.toCartesian(anchor);
  if (!anchorCartesian) {
    return null;
  }

  const directionMagnitude = Cartesian3.magnitudeSquared(direction);
  if (!Number.isFinite(directionMagnitude) || directionMagnitude <= 1e-12) {
    return null;
  }

  const normalizedDirection = Cartesian3.normalize(direction, new Cartesian3());
  const offset = Cartesian3.multiplyByScalar(
    normalizedDirection,
    -Math.max(MIN_INITIAL_CAMERA_RANGE_M, rangeM),
    new Cartesian3()
  );

  return Cartesian3.add(anchorCartesian, offset, new Cartesian3());
};

type CameraViewportStabilitySnapshot = {
  positionX: number;
  positionY: number;
  positionZ: number;
  heading: number;
  pitch: number;
  roll: number;
  viewportWidth: number;
  viewportHeight: number;
};

const readCameraViewportStabilitySnapshot = (
  scene: Scene,
  camera: Camera
): CameraViewportStabilitySnapshot | null => {
  const position = camera.positionWC;
  const heading = camera.heading;
  const pitch = camera.pitch;
  const roll = camera.roll;
  const viewportWidth = scene.canvas?.clientWidth ?? 0;
  const viewportHeight = scene.canvas?.clientHeight ?? 0;

  if (
    !Number.isFinite(position?.x) ||
    !Number.isFinite(position?.y) ||
    !Number.isFinite(position?.z) ||
    !Number.isFinite(heading) ||
    !Number.isFinite(pitch) ||
    !Number.isFinite(roll) ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }

  return {
    positionX: position.x,
    positionY: position.y,
    positionZ: position.z,
    heading,
    pitch,
    roll,
    viewportWidth,
    viewportHeight,
  };
};

const isStableSnapshot = (
  previous: CameraViewportStabilitySnapshot,
  current: CameraViewportStabilitySnapshot
): boolean => {
  const positionDelta = Math.hypot(
    current.positionX - previous.positionX,
    current.positionY - previous.positionY,
    current.positionZ - previous.positionZ
  );

  return (
    positionDelta <= INITIAL_VIEW_POSITION_EPSILON_M &&
    Math.abs(current.heading - previous.heading) <=
      INITIAL_VIEW_ANGLE_EPSILON_RAD &&
    Math.abs(current.pitch - previous.pitch) <=
      INITIAL_VIEW_ANGLE_EPSILON_RAD &&
    Math.abs(current.roll - previous.roll) <= INITIAL_VIEW_ANGLE_EPSILON_RAD &&
    current.viewportWidth === previous.viewportWidth &&
    current.viewportHeight === previous.viewportHeight
  );
};

const waitForStableCameraAndViewport = async ({
  scene,
  camera,
  requiredStableFrames = INITIAL_VIEW_STABLE_REQUIRED_FRAMES,
  maxFrames = INITIAL_VIEW_STABLE_MAX_FRAMES,
}: {
  scene: Scene;
  camera: Camera;
  requiredStableFrames?: number;
  maxFrames?: number;
}): Promise<void> => {
  let previous: CameraViewportStabilitySnapshot | null = null;
  let stableFrames = 0;

  for (let frame = 0; frame < maxFrames; frame += 1) {
    await waitForRenderFrames(scene, 1);
    const current = readCameraViewportStabilitySnapshot(scene, camera);
    if (!current) {
      previous = null;
      stableFrames = 0;
      continue;
    }

    if (previous && isStableSnapshot(previous, current)) {
      stableFrames += 1;
      if (stableFrames >= requiredStableFrames) {
        return;
      }
    } else {
      stableFrames = 0;
    }

    previous = current;
  }
};

export const useInitializeCesiumWidget = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  options?: CesiumWidgetConstructorOptions,
  initialCameraView?: InitialCameraView | null,
  homeValidationCenter?: Cartesian3 | null,
  hostContainerSize?: { width: number; height: number } | null
) => {
  const {
    runtimeRef,
    isValidRuntime,
    isRuntimeReady,
    setIsRuntimeReady,
    initialViewApplied,
    setInitialViewApplied,
    providersReady,
    shouldSuspendCameraLimitersRef,
    withScene,
    withCamera,
    withRuntime,
    getTerrainProvider,
    getImageryLayer,
  } = useCesiumContext();

  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);
  const currentSceneStyle = useSelector(selectCurrentSceneStyle);
  const primaryStyle = useSelector(selectSceneStylePrimary);
  const secondaryStyle = useSelector(selectSceneStyleSecondary);
  const minZoom = useSelector(
    selectScreenSpaceCameraControllerMinimumZoomDistance
  );
  const maxZoom = useSelector(
    selectScreenSpaceCameraControllerMaximumZoomDistance
  );
  const enableCollisionDetection = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );
  // Store camera position and orientation vectors
  const lastGoodCameraState = useRef<CameraState | null>(null);

  useEffect(
    () => () => {
      const widget = runtimeRef.current;
      if (!widget || widget.isDestroyed()) {
        return;
      }

      const postRenderHandler = postRenderHandlerMap.get(widget);
      if (postRenderHandler) {
        widget.scene.postRender.removeEventListener(postRenderHandler);
        postRenderHandlerMap.delete(widget);
      }

      const cameraChangedHandler = cameraChangedHandlerMap.get(widget);
      if (cameraChangedHandler) {
        widget.camera.changed.removeEventListener(cameraChangedHandler);
        cameraChangedHandlerMap.delete(widget);
      }

      initialViewSetMap.delete(widget);
      widget.destroy();
      runtimeRef.current = null;
      setIsRuntimeReady(false);
      setInitialViewApplied(false);
    },
    [setInitialViewApplied, setIsRuntimeReady, runtimeRef]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hostContainerSize) {
      return;
    }

    const syncContainerViewport = () => {
      const viewport = readContainerViewport(container);
      if (!viewport) {
        return;
      }

      const runtime = runtimeRef.current;
      if (!runtime || runtime.isDestroyed()) {
        return;
      }

      runtime.canvas.width = viewport.width;
      runtime.canvas.height = viewport.height;
      runtime.canvas.style.width = "100%";
      runtime.canvas.style.height = "100%";
    };

    syncContainerViewport();

    const resizeObserver = new ResizeObserver(() => {
      syncContainerViewport();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    containerRef,
    hostContainerSize?.height,
    hostContainerSize?.width,
    runtimeRef,
  ]);

  // override cesium default home
  useEffect(() => {
    // align Cesium Default fallback with local home
    if (homeValidationCenter) {
      const { longitude, latitude } =
        Cartographic.fromCartesian(homeValidationCenter);
      const rect = new Rectangle(
        longitude - 0.001,
        latitude - 0.001,
        longitude + 0.001,
        latitude + 0.001
      );

      console.debug(
        "[CESIUM] HOOK: [CESIUM|INIT] override default cesium with configured home",
        homeValidationCenter
      );
      Camera.DEFAULT_VIEW_RECTANGLE = rect;
    }
  }, [homeValidationCenter]);

  useEffect(() => {
    const containerEl = containerRef.current;
    const containerViewport =
      containerEl && hostContainerSize ? hostContainerSize : null;

    // Wait for providers to be ready before creating the Cesium runtime.
    if (!providersReady) {
      console.debug(
        "[CESIUM] HOOK: [CESIUM|INIT] Waiting for providers to be ready..."
      );
      return;
    }

    if (!containerViewport) {
      console.debug(
        "[CESIUM] HOOK: [CESIUM|INIT] Waiting for container dimensions..."
      );
      return;
    }

    try {
      // Reuse existing widget if it exists and isn't destroyed.
      if (isValidRuntime()) {
        console.debug(
          "[CESIUM] HOOK: [CESIUM|INIT] Reusing existing Cesium widget - no recreation needed"
        );
        return;
      }

      // Prepare initial configuration based on scene style
      const isSecondary = currentSceneStyle === "secondary";
      const styleToUse = isSecondary ? secondaryStyle : primaryStyle;

      const terrainProvider = getTerrainProvider();

      // Get imagery layer (will set visibility after creation)
      const imageryLayer = getImageryLayer();

      // Create and configure Globe with initial style settings
      const globe = new Globe(Ellipsoid.WGS84);

      // Set globe baseColor based on style
      const globeBaseColor =
        colorFromConstructorArgs(styleToUse?.globe?.baseColor) ??
        (isSecondary ? Color.WHITE : Color.LIGHTGREY);
      globe.baseColor = globeBaseColor;

      // For primary style, enable translucency to make globe transparent
      if (!isSecondary) {
        globe.translucency.enabled = true;
        globe.translucency.frontFaceAlpha = 0.0;
        globe.translucency.backFaceAlpha = 0.0;
      }

      // Merge initial configuration into widget options.
      const widgetOptions: CesiumWidgetConstructorOptions = {
        ...options,
        terrainProvider: terrainProvider || undefined,
        globe: globe,
        // baseLayer is set to false in defaults to prevent default imagery
      };

      const backgroundColor =
        colorFromConstructorArgs(styleToUse?.backgroundColor) ??
        new Color(0, 0, 0, 0.01);

      console.info(
        "[CESIUM|INIT] Creating Cesium widget with pre-configured globe",
        currentSceneStyle,
        "terrain:",
        isSecondary ? "SURFACE" : "TERRAIN",
        "globeBaseColor:",
        globeBaseColor,
        "translucency:",
        !isSecondary
      );

      const widget = createMinimalCesiumWidget(containerEl, {
        ...(widgetOptions || {}),
      });

      // Set scene background color immediately after creation
      if (widget.scene) {
        widget.scene.backgroundColor = backgroundColor;
        console.info(
          "[CESIUM|INIT] Scene backgroundColor set:",
          backgroundColor
        );
      }

      // Add imagery layer with correct initial visibility
      if (imageryLayer) {
        widget.imageryLayers.add(imageryLayer);
        imageryLayer.show = isSecondary; // Show only for secondary style
        console.info(
          "[CESIUM|INIT] Initial imagery layer added, show:",
          isSecondary
        );
      }

      console.info("[CESIUM|INIT] Cesium widget created", Date.now());

      runtimeRef.current = widget;

      // Configure centralized error handling: suppress Cesium panel, don't crash ErrorBoundary by default, log warn
      configureCesiumErrorHandling(widget, {
        suppressErrorPanel: true,
        suppressErrorBoundaryForwarding: true,
        logLevel: "warn",
      });
      // Initial state: not started determining yet

      const handlePostRender = () => {
        withScene((scene, widget) => {
          if (widget.canvas.width > 0 && widget.canvas.height > 0) {
            setIsRuntimeReady(true);
            scene.postRender.removeEventListener(handlePostRender);
            postRenderHandlerMap.delete(widget);
          }
        });
      };

      const handleValidCameraPosition = () => {
        //console.debug("[CESIUM] v", runtimeRef.current?.scene.requestRenderMode);
        if (shouldSuspendCameraLimitersRef?.current) return;
        if (!homeValidationCenter) return;
        withCamera((camera) => {
          const isValidWorldCoordinate = validateWorldCoordinate(
            camera,
            homeValidationCenter,
            maxZoom
          );
          if (isValidWorldCoordinate) {
            // Save the camera position and orientation vectors
            lastGoodCameraState.current = {
              position: camera.positionWC.clone(),
              direction: camera.directionWC.clone(),
              up: camera.upWC.clone(),
              postionCartographic: camera.positionCartographic.clone(),
            };
          } else if (lastGoodCameraState.current) {
            console.warn(
              "[CESIUM] HOOK: [2D3D|CESIUM|CAMERA] invalid camera position, restoring last good state",
              isValidWorldCoordinate,
              camera.position,
              camera.positionCartographic,
              lastGoodCameraState.current
            );
            // Restore camera position and orientation vectors
            camera.lookAtTransform(Matrix4.IDENTITY);
            camera.setView({
              destination: lastGoodCameraState.current.position,
              orientation: {
                direction: lastGoodCameraState.current.direction,
                up: lastGoodCameraState.current.up,
              },
            });
          }
        });
      };

      withScene((scene, widget) => {
        console.debug(
          "[CESIUM] [CESIUM|INIT|CAMERA] add listener for camera limiter"
        );
        widget.camera.changed.addEventListener(handleValidCameraPosition);
        cameraChangedHandlerMap.set(widget, handleValidCameraPosition);

        scene.postRender.addEventListener(handlePostRender);
        postRenderHandlerMap.set(widget, handlePostRender);
      });
    } catch (error) {
      console.error("[CESIUM] Error initializing Cesium widget:", error);
    }
  }, [
    options,
    containerRef,
    hostContainerSize?.height,
    hostContainerSize?.width,
    providersReady,
    runtimeRef,
    homeValidationCenter,
    maxZoom,
    shouldSuspendCameraLimitersRef,
    isValidRuntime,
    withScene,
    setIsRuntimeReady,
    withCamera,
    currentSceneStyle,
    primaryStyle,
    secondaryStyle,
    getTerrainProvider,
    getImageryLayer,
  ]);

  useEffect(() => {
    withScene((scene) => {
      const sscc: ScreenSpaceCameraController =
        scene.screenSpaceCameraController;

      // Guard: scene.globe might not be initialized yet during early setup
      if (scene.globe) {
        scene.globe.depthTestAgainstTerrain = true;
        // Terrain would show up as opaques surface over mesh if not set transparent
        scene.globe.translucency.enabled = true;
        scene.globe.translucency.frontFaceAlpha = isSecondaryStyle ? 1.0 : 0.0;
        scene.globe.translucency.backFaceAlpha = isSecondaryStyle ? 1.0 : 0.0;
      }

      sscc.enableCollisionDetection = shouldSuspendCameraLimitersRef.current
        ? false
        : enableCollisionDetection;
      sscc.minimumZoomDistance = shouldSuspendCameraLimitersRef.current
        ? 1
        : minZoom ?? 1;
      sscc.maximumZoomDistance = shouldSuspendCameraLimitersRef.current
        ? Infinity
        : maxZoom ?? Infinity;
    });
  }, [
    withScene,
    isSecondaryStyle,
    maxZoom,
    minZoom,
    enableCollisionDetection,
    shouldSuspendCameraLimitersRef,
  ]);

  useEffect(() => {
    if (!isRuntimeReady) return;
    const containerViewport =
      containerRef.current && hostContainerSize ? hostContainerSize : null;
    if (!containerViewport) {
      return;
    }

    let alreadySet = false;
    withRuntime((runtime) => {
      alreadySet = initialViewSetMap.has(runtime);
    });
    if (alreadySet) {
      console.debug(
        "[CESIUM] HOOK: [CESIUM|CAMERA] Initial view already set, skipping."
      );

      // Edge case: effect can re-run during startup; ensure the flag is eventually set.
      if (!initialViewApplied) {
        let cancelled = false;
        (async () => {
          let sceneRef: Scene | null = null;
          let cameraRef: Camera | null = null;
          withScene((scene) => {
            sceneRef = scene;
          });
          withCamera((camera) => {
            cameraRef = camera;
          });
          if (!sceneRef || !cameraRef) return;
          await waitForStableCameraAndViewport({
            scene: sceneRef,
            camera: cameraRef,
          });
          if (!cancelled) {
            setInitialViewApplied(true);
            if (shouldSuspendCameraLimitersRef) {
              shouldSuspendCameraLimitersRef.current = false;
            }
          }
        })();

        return () => {
          cancelled = true;
          if (shouldSuspendCameraLimitersRef) {
            shouldSuspendCameraLimitersRef.current = false;
          }
        };
      }

      return;
    }

    let cancelled = false;
    let usedInitial = false;
    // suspend camera limiters during the initial apply to avoid unintended corrections
    if (shouldSuspendCameraLimitersRef) {
      shouldSuspendCameraLimitersRef.current = true;
    }
    if (initialCameraView) {
      const { position, anchor, zoom, direction, up, fov, fovLongerEdge } =
        initialCameraView;
      let destination: Cartesian3 | null = null;

      const viewportWidthPx = containerViewport.width;
      const viewportHeightPx = containerViewport.height;
      const resolvedLongerEdgeFov = Number.isFinite(fovLongerEdge)
        ? fovLongerEdge
        : Number.isFinite(fov)
        ? readLongerEdgeFovFromIntrinsics(
            {
              fov: fov as Parameters<
                typeof readLongerEdgeFovFromIntrinsics
              >[0]["fov"],
              fovHorizontal: undefined,
            },
            {
              viewportWidthPx,
              viewportHeightPx,
            }
          )
        : DEFAULT_INITIAL_CAMERA_FOV_RAD;

      if (
        anchor &&
        Number.isFinite(zoom) &&
        direction &&
        Number.isFinite(resolvedLongerEdgeFov)
      ) {
        destination = readCameraDestinationFromAnchorAndZoom({
          anchor,
          zoom,
          direction,
          longerEdgeFovRad: resolvedLongerEdgeFov,
          viewportWidthPx,
          viewportHeightPx,
        });
      }

      if (!destination && position) {
        const restoredHeight = Math.max(position.height || 1000, 0);
        position.height = restoredHeight;
        destination = Cartographic.toCartesian(position);
      }

      if (destination) {
        const isValidDestination = homeValidationCenter
          ? validateWorldCoordinate(
              destination,
              homeValidationCenter,
              maxZoom,
              0
            )
          : true;
        withCamera((camera) => {
          if (isValidDestination) {
            // clear any non-identity transform to avoid offsets
            camera.lookAtTransform(Matrix4.IDENTITY);
            camera.setView({
              destination,
              ...(direction && up
                ? {
                    orientation: {
                      direction,
                      up,
                    },
                  }
                : {}),
            });
            if (camera.frustum instanceof PerspectiveFrustum) {
              if (Number.isFinite(fovLongerEdge)) {
                writePerspectiveFrustumLongerEdgeFov(
                  camera.frustum,
                  fovLongerEdge
                );
              } else if (Number.isFinite(fov)) {
                writePerspectiveFrustumVerticalFov(camera.frustum, fov);
              } else {
                writePerspectiveFrustumLongerEdgeFov(
                  camera.frustum,
                  DEFAULT_INITIAL_CAMERA_FOV_RAD
                );
              }
            }
            usedInitial = true;
            withScene((scene) => scene.requestRender());
          } else {
            console.warn(
              "[CESIUM] invalid initial camera position restored; skipping initial apply",
              destination,
              homeValidationCenter
            );
          }
        });
      }
    } else {
      console.debug(
        "[CESIUM] HOOK: skipping cesium location setup with 2d mode active zoom"
      );
    }

    if (!usedInitial) {
      console.info("[CESIUM] Cesium widget initialized without initial view");
    }
    withRuntime((runtime) => initialViewSetMap.set(runtime, true));

    (async () => {
      let sceneRef: Scene | null = null;
      let cameraRef: Camera | null = null;
      withScene((scene) => {
        sceneRef = scene;
        cameraRef = scene.camera;
      });

      if (!sceneRef || !cameraRef) return;

      await waitForStableCameraAndViewport({
        scene: sceneRef,
        camera: cameraRef,
      });

      if (!cancelled) {
        setInitialViewApplied(true);
        if (shouldSuspendCameraLimitersRef) {
          shouldSuspendCameraLimitersRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (shouldSuspendCameraLimitersRef) {
        shouldSuspendCameraLimitersRef.current = false;
      }
    };
  }, [
    isRuntimeReady,
    initialCameraView,
    homeValidationCenter,
    maxZoom,
    containerRef,
    hostContainerSize?.height,
    hostContainerSize?.width,
    setInitialViewApplied,
    initialViewApplied,
    withRuntime,
    withCamera,
    withScene,
    shouldSuspendCameraLimitersRef,
  ]);
};

export default useInitializeCesiumWidget;
