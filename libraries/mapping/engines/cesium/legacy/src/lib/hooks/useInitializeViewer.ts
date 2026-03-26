import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";

// legacy viewer dependency should be widget only
// eslint-disable-next-line carma/no-direct-cesium
import { Viewer } from "cesium";

import {
  Camera,
  Cartesian3,
  Cartographic,
  CesiumMath,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  Rectangle,
  ScreenSpaceCameraController,
  colorFromConstructorArgs,
  Color,
  Globe,
  Ellipsoid,
  getPointsFromCartographicAndHeadingPitchRange,
  waitForRenderFrames,
} from "@carma/cesium";

import type { Scene } from "@carma/cesium";
import {
  writePerspectiveFrustumLongerEdgeFov,
  writePerspectiveFrustumVerticalFov,
} from "@carma-mapping/engines/cesium/api";

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

import type { InitialCameraView } from "../CustomViewer";

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
const VIEWPORT_SETTLE_DELAY_MS = 120;

const postRenderHandlerMap: WeakMap<Viewer, () => void> = new WeakMap();
const cameraChangedHandlerMap: WeakMap<Viewer, () => void> = new WeakMap();
const initialViewSetMap: WeakMap<Viewer, boolean> = new WeakMap();

const DEFAULT_INITIAL_CAMERA_FOV_RAD = CesiumMath.PI_OVER_THREE;
const CANONICAL_MAPLIBRE_TILE_SIZE_PX = 512;
const MIN_INITIAL_CAMERA_RANGE_M = 0.01;
const MIN_TAN_HALF_FOV = 1e-6;
const INITIAL_VIEW_STABLE_REQUIRED_FRAMES = 6;
const INITIAL_VIEW_STABLE_MAX_FRAMES = 120;
const INITIAL_VIEW_POSITION_EPSILON_M = 0.02;
const INITIAL_VIEW_ANGLE_EPSILON_RAD = 1e-4;

const readLongerEdgeFovFromVerticalFov = ({
  verticalFovRad,
  viewportWidthPx,
  viewportHeightPx,
}: {
  verticalFovRad: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
}): number | null => {
  if (
    !Number.isFinite(verticalFovRad) ||
    verticalFovRad <= 0 ||
    !Number.isFinite(viewportWidthPx) ||
    viewportWidthPx <= 0 ||
    !Number.isFinite(viewportHeightPx) ||
    viewportHeightPx <= 0
  ) {
    return null;
  }

  return viewportWidthPx > viewportHeightPx
    ? Math.atan(
        Math.tan(verticalFovRad * 0.5) * (viewportWidthPx / viewportHeightPx)
      ) * 2
    : verticalFovRad;
};

const readRangeFromCanonicalMapZoom = ({
  zoom,
  latitudeRad,
  longerEdgeFovRad,
  viewportWidthPx,
  viewportHeightPx,
}: {
  zoom: number;
  latitudeRad: number;
  longerEdgeFovRad: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
}): number | null => {
  if (
    !Number.isFinite(zoom) ||
    !Number.isFinite(latitudeRad) ||
    !Number.isFinite(longerEdgeFovRad) ||
    longerEdgeFovRad <= 0 ||
    !Number.isFinite(viewportWidthPx) ||
    viewportWidthPx <= 0 ||
    !Number.isFinite(viewportHeightPx) ||
    viewportHeightPx <= 0
  ) {
    return null;
  }

  const projectionCenterRadiusPx =
    Math.max(viewportWidthPx, viewportHeightPx) * 0.5;
  const tanHalfFov = Math.tan(longerEdgeFovRad * 0.5);
  if (!Number.isFinite(tanHalfFov) || Math.abs(tanHalfFov) < MIN_TAN_HALF_FOV) {
    return null;
  }

  const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latitudeRad as Parameters<
      typeof getPixelResolutionFromZoomAtLatitudeRad
    >[1],
    { tileSize: CANONICAL_MAPLIBRE_TILE_SIZE_PX }
  );
  if (!Number.isFinite(metersPerCssPixel) || metersPerCssPixel <= 0) {
    return null;
  }

  const rangeM =
    (metersPerCssPixel * projectionCenterRadiusPx) / Math.abs(tanHalfFov);
  return Number.isFinite(rangeM) && rangeM >= MIN_INITIAL_CAMERA_RANGE_M
    ? rangeM
    : null;
};

const readCameraDestinationFromAnchorAndZoom = ({
  anchor,
  zoom,
  headingRad,
  pitchRad,
  longerEdgeFovRad,
  viewportWidthPx,
  viewportHeightPx,
}: {
  anchor: Cartographic;
  zoom: number;
  headingRad: number;
  pitchRad: number;
  longerEdgeFovRad: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
}): Cartesian3 | null => {
  const rangeM = readRangeFromCanonicalMapZoom({
    zoom,
    latitudeRad: anchor.latitude,
    longerEdgeFovRad,
    viewportWidthPx,
    viewportHeightPx,
  });
  if (!Number.isFinite(rangeM)) {
    return null;
  }

  const points = getPointsFromCartographicAndHeadingPitchRange({
    cartographic: anchor,
    headingPitchRange: new HeadingPitchRange(
      headingRad,
      pitchRad,
      Math.max(MIN_INITIAL_CAMERA_RANGE_M, rangeM)
    ),
  });

  return points?.cameraPositionECEF ?? null;
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

export const useInitializeViewer = (
  containerRef?: React.RefObject<HTMLDivElement>,
  options?: Viewer.ConstructorOptions,
  initialCameraView?: InitialCameraView | null,
  homeValidationCenter?: Cartesian3 | null
) => {
  const {
    viewerRef,
    isValidViewer,
    isViewerReady,
    setIsViewerReady,
    initialViewApplied,
    setInitialViewApplied,
    providersReady,
    shouldSuspendCameraLimitersRef,
    withScene,
    withCamera,
    withViewer,
    getTerrainProvider,
    getSurfaceProvider,
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
  const [containerViewport, setContainerViewport] = useState<ContainerViewport>(
    {
      width: 0,
      height: 0,
    }
  );
  const [settledContainerViewport, setSettledContainerViewport] =
    useState<ContainerViewport>({
      width: 0,
      height: 0,
    });

  // Store camera position and orientation vectors
  const lastGoodCameraState = useRef<CameraState | null>(null);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) {
      return;
    }

    const syncContainerViewport = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;

      setContainerViewport((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height }
      );

      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      viewer.canvas.width = width;
      viewer.canvas.height = height;
      viewer.canvas.style.width = "100%";
      viewer.canvas.style.height = "100%";
    };

    syncContainerViewport();

    const resizeObserver = new ResizeObserver(() => {
      syncContainerViewport();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef, viewerRef]);

  useEffect(() => {
    if (containerViewport.width <= 0 || containerViewport.height <= 0) {
      setSettledContainerViewport({ width: 0, height: 0 });
      return;
    }

    const timerId = window.setTimeout(() => {
      setSettledContainerViewport((previous) =>
        previous.width === containerViewport.width &&
        previous.height === containerViewport.height
          ? previous
          : {
              width: containerViewport.width,
              height: containerViewport.height,
            }
      );
    }, VIEWPORT_SETTLE_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [containerViewport.height, containerViewport.width]);

  // override cesium default home
  useEffect(() => {
    // align Cesium Default fallback with local home
    if (homeValidationCenter) {
      const { longitude, latitude } = Cartographic.fromCartesian(
        homeValidationCenter
      );
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
    const containerEl = containerRef?.current;
    const hasSettledContainerViewport =
      settledContainerViewport.width > 0 && settledContainerViewport.height > 0;

    // Wait for providers to be ready before creating viewer
    if (!providersReady) {
      console.debug(
        "[CESIUM] HOOK: [CESIUM|INIT] Waiting for providers to be ready..."
      );
      return;
    }

    if (!hasSettledContainerViewport) {
      console.debug(
        "[CESIUM] HOOK: [CESIUM|INIT] Waiting for settled container dimensions..."
      );
      return;
    }

    if (containerEl) {
      try {
        // Reuse existing viewer if it exists and isn't destroyed
        if (isValidViewer()) {
          console.debug(
            "[CESIUM] HOOK: [CESIUM|INIT] Reusing existing viewer instance - no recreation needed"
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

        // Merge initial configuration into viewer options
        const viewerOptions: Viewer.ConstructorOptions = {
          ...options,
          terrainProvider: terrainProvider || undefined,
          globe: globe,
          // baseLayer is set to false in defaults to prevent default imagery
        };

        const backgroundColor =
          colorFromConstructorArgs(styleToUse?.backgroundColor) ??
          new Color(0, 0, 0, 0.01);

        console.info(
          "[CESIUM|INIT] Creating viewer with pre-configured globe",
          currentSceneStyle,
          "terrain:",
          isSecondary ? "SURFACE" : "TERRAIN",
          "globeBaseColor:",
          globeBaseColor,
          "translucency:",
          !isSecondary
        );

        const viewer = new Viewer(containerEl, viewerOptions);

        // Set scene background color immediately after creation
        if (viewer.scene) {
          viewer.scene.backgroundColor = backgroundColor;
          console.info(
            "[CESIUM|INIT] Scene backgroundColor set:",
            backgroundColor
          );
        }

        // Add imagery layer with correct initial visibility
        if (imageryLayer) {
          viewer.imageryLayers.add(imageryLayer);
          imageryLayer.show = isSecondary; // Show only for secondary style
          console.info(
            "[CESIUM|INIT] Initial imagery layer added, show:",
            isSecondary
          );
        }

        console.info("[CESIUM|INIT] Viewer instance created", Date.now());

        viewerRef.current = viewer;

        // Configure centralized error handling: suppress Cesium panel, don't crash ErrorBoundary by default, log warn
        configureCesiumErrorHandling(viewer, {
          suppressErrorPanel: true,
          suppressErrorBoundaryForwarding: true,
          logLevel: "warn",
        });
        // Initial state: not started determining yet

        const handlePostRender = () => {
          withScene((scene, viewer) => {
            if (viewer.canvas.width > 0 && viewer.canvas.height > 0) {
              setIsViewerReady(true);
              scene.postRender.removeEventListener(handlePostRender);
              postRenderHandlerMap.delete(viewer);
            }
          });
        };

        const handleValidCameraPosition = () => {
          //console.debug("[CESIUM] v", viewerRef.current?.scene.requestRenderMode);
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

        withScene((scene, viewer) => {
          console.debug(
            "[CESIUM] [CESIUM|INIT|CAMERA] add listener for camera limiter"
          );
          viewer.camera.changed.addEventListener(handleValidCameraPosition);
          cameraChangedHandlerMap.set(viewer, handleValidCameraPosition);

          scene.postRender.addEventListener(handlePostRender);
          postRenderHandlerMap.set(viewer, handlePostRender);
        });
      } catch (error) {
        console.error("[CESIUM] Error initializing viewer:", error);
      }
    }
  }, [
    options,
    containerRef,
    settledContainerViewport.height,
    settledContainerViewport.width,
    initialCameraView,
    providersReady,
    viewerRef,
    homeValidationCenter,
    maxZoom,
    shouldSuspendCameraLimitersRef,
    isValidViewer,
    isViewerReady,
    withScene,
    setIsViewerReady,
    withCamera,
    withViewer,
    currentSceneStyle,
    primaryStyle,
    secondaryStyle,
    getTerrainProvider,
    getSurfaceProvider,
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

      sscc.enableCollisionDetection = enableCollisionDetection;
      sscc.minimumZoomDistance = minZoom ?? 1;
      sscc.maximumZoomDistance = maxZoom ?? Infinity;
    });
  }, [withScene, isSecondaryStyle, maxZoom, minZoom, enableCollisionDetection]);

  useEffect(() => {
    if (!isViewerReady) return;
    if (
      settledContainerViewport.width <= 0 ||
      settledContainerViewport.height <= 0
    ) {
      return;
    }

    let alreadySet = false;
    withViewer((viewer) => {
      alreadySet = initialViewSetMap.has(viewer);
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
      const { position, anchor, zoom, heading, pitch, fov, fovLongerEdge } =
        initialCameraView;
      let destination: Cartesian3 | null = null;

      withViewer(() => {
        const viewportWidthPx = settledContainerViewport.width;
        const viewportHeightPx = settledContainerViewport.height;
        const resolvedLongerEdgeFov = Number.isFinite(fovLongerEdge)
          ? fovLongerEdge
          : Number.isFinite(fov)
          ? readLongerEdgeFovFromVerticalFov({
              verticalFovRad: fov,
              viewportWidthPx,
              viewportHeightPx,
            })
          : DEFAULT_INITIAL_CAMERA_FOV_RAD;

        if (
          anchor &&
          Number.isFinite(zoom) &&
          Number.isFinite(resolvedLongerEdgeFov)
        ) {
          destination = readCameraDestinationFromAnchorAndZoom({
            anchor,
            zoom,
            headingRad: heading ?? 0,
            pitchRad: pitch ?? -CesiumMath.PI_OVER_TWO,
            longerEdgeFovRad: resolvedLongerEdgeFov,
            viewportWidthPx,
            viewportHeightPx,
          });
        }
      });

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
              orientation: {
                heading: heading ?? 0,
                pitch: pitch ?? -CesiumMath.PI_OVER_TWO,
              },
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
            withViewer((viewer) => viewer.scene.requestRender());
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
      console.info("[CESIUM] Cesium Viewer initialized without initial view");
    }
    withViewer((viewer) => initialViewSetMap.set(viewer, true));

    (async () => {
      let sceneRef: Scene | null = null;
      let cameraRef: Camera | null = null;
      withScene((scene, viewer) => {
        sceneRef = scene;
        cameraRef = viewer.camera;
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
    isViewerReady,
    initialCameraView,
    homeValidationCenter,
    maxZoom,
    settledContainerViewport.height,
    settledContainerViewport.width,
    setInitialViewApplied,
    initialViewApplied,
    withViewer,
    withCamera,
    withScene,
    shouldSuspendCameraLimitersRef,
  ]);
};

export default useInitializeViewer;
