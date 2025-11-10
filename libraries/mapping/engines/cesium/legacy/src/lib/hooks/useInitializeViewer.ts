import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

// legacy viewer dependency should be widget only
// eslint-disable-next-line carma/no-direct-cesium
import { Viewer } from "cesium";

import {
  BoundingSphere,
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
} from "@carma/cesium";

import { useCesiumContext } from "./useCesiumContext";

import {
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectShowSecondaryTileset,
  selectViewerHome,
  selectViewerHomeOffset,
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

const postRenderHandlerMap: WeakMap<Viewer, () => void> = new WeakMap();
const cameraChangedHandlerMap: WeakMap<Viewer, () => void> = new WeakMap();
const initialViewSetMap: WeakMap<Viewer, boolean> = new WeakMap();

const DEFAULT_HPR = new HeadingPitchRange(
  CesiumMath.toRadians(0),
  CesiumMath.toRadians(-45),
  1500
);

export const useInitializeViewer = (
  containerRef?: React.RefObject<HTMLDivElement>,
  options?: Viewer.ConstructorOptions,
  initialCameraView?: InitialCameraView | null
) => {
  const {
    viewerRef,
    isValidViewer,
    isViewerReady,
    setIsViewerReady,
    providersReady,
    shouldSuspendCameraLimitersRef,
    withScene,
    withCamera,
    withViewer,
    setInitialCameraSettled,
    getTerrainProvider,
    getSurfaceProvider,
    getImageryLayer,
  } = useCesiumContext();

  const home = useSelector(selectViewerHome);
  const homeOffset = useSelector(selectViewerHomeOffset);
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

  // override cesium default home
  useEffect(() => {
    // align Cesium Default fallback with local home
    if (home) {
      const { longitude, latitude } = Cartographic.fromCartesian(home);
      const rect = new Rectangle(
        longitude - 0.001,
        latitude - 0.001,
        longitude + 0.001,
        latitude + 0.001
      );

      console.debug(
        "[CESIUM] HOOK: [CESIUM|INIT] override default cesium with configured home",
        home
      );
      Camera.DEFAULT_VIEW_RECTANGLE = rect;
      Camera.DEFAULT_OFFSET = DEFAULT_HPR;
    }
  }, [home]);

  useEffect(() => {
    const containerEl = containerRef?.current;

    // Wait for providers to be ready before creating viewer
    if (!providersReady) {
      console.debug(
        "[CESIUM] HOOK: [CESIUM|INIT] Waiting for providers to be ready..."
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
        setInitialCameraSettled(null);
        console.info("[CESIUM|INIT|SETTLE] state:null (viewer created)");

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
          if (!home) return;
          withCamera((camera) => {
            const isValidWorldCoordinate = validateWorldCoordinate(
              camera,
              home,
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
    return () => {
      // Don't cleanup - viewer and listeners persist across 2D/3D transitions
      // This should only run during app shutdown or if effect dependencies change unexpectedly
      console.error(
        "[CESIUM] [CESIUM|INIT|CLEANUP] Viewer initialization effect cleanup triggered!",
        {
          hasViewer: !!viewerRef.current,
          isViewerValid: isValidViewer(),
          isViewerDestroyed: viewerRef.current?.isDestroyed(),
          reason:
            "Effect dependencies changed - investigating which dependency caused re-init",
        }
      );

      // Log which dependencies might have changed
      console.debug("[CESIUM] [CESIUM|INIT|CLEANUP] Effect dependency check:", {
        hasOptions: !!options,
        hasContainerEl: !!containerEl,
        hasInitialCameraView: !!initialCameraView,
        hasHome: !!home,
        maxZoom,
      });
    };
  }, [
    options,
    containerRef,
    initialCameraView,
    providersReady,
    viewerRef,
    home,
    maxZoom,
    shouldSuspendCameraLimitersRef,
    isValidViewer,
    isViewerReady,
    withScene,
    setIsViewerReady,
    withCamera,
    withViewer,
    setInitialCameraSettled,
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

    // Begin determining/applying initial camera (or home fallback if absent)
    setInitialCameraSettled(false);
    if (!initialCameraView) {
      console.info(
        "[CESIUM|INIT|SETTLE] initialCameraView:absent -> applying home fallback"
      );
    } else {
      console.info(
        "[CESIUM|INIT|SETTLE] applying:false (begin applying initial view)"
      );
    }

    let alreadySet = false;
    withViewer((viewer) => {
      alreadySet = initialViewSetMap.has(viewer);
    });
    if (alreadySet) {
      console.debug(
        "[CESIUM] HOOK: [CESIUM|CAMERA] Initial view already set, skipping."
      );
      // Viewer already has an initial view applied — consider camera settled
      setInitialCameraSettled(true);
      console.info(
        "[CESIUM] [CESIUM|INIT|SETTLE] reuse:true -> state:true (already applied)"
      );
      return;
    }

    const hasHome = !!home && !!homeOffset;
    if (!hasHome) {
      console.warn(
        "[CESIUM] HOOK: [2D3D|CESIUM|CAMERA] initViewer has no home or homeOffset yet; applying hash camera without validation"
      );
    }

    let willFlyHome = false;
    const resetToHome = () => {
      if (!hasHome) return;
      withCamera((camera) => {
        camera.lookAt(home, homeOffset);
        willFlyHome = true;
        camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
          duration: 2,
          complete: () => {
            setInitialCameraSettled(true);
            console.info("[CESIUM|INIT|SETTLE] flyHome:complete -> state:true");
          },
        });
      });
    };

    let usedInitial = false;
    // suspend camera limiters during the initial apply to avoid unintended corrections
    if (shouldSuspendCameraLimitersRef) {
      shouldSuspendCameraLimitersRef.current = true;
      withScene((scene) => {
        const enableLimitersNextFrame = () => {
          if (shouldSuspendCameraLimitersRef) {
            shouldSuspendCameraLimitersRef.current = false;
          }
          scene.postRender.removeEventListener(enableLimitersNextFrame);
        };
        scene.postRender.addEventListener(enableLimitersNextFrame);
      });
    }
    if (initialCameraView) {
      const { position, heading, pitch, fov } = initialCameraView;
      if (position) {
        const restoredHeight = CesiumMath.clamp(
          position?.height || 1000,
          0,
          50000
        );
        position.height = restoredHeight;
        const destination = Cartographic.toCartesian(position);
        const isValidDestination = hasHome
          ? validateWorldCoordinate(destination, home, maxZoom, 0)
          : true;
        withCamera((camera) => {
          if (camera.frustum instanceof PerspectiveFrustum) {
            camera.frustum.fov = fov ?? Math.PI / 4;
          }
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
            usedInitial = true;
            withViewer((viewer) => viewer.scene.requestRender());
          } else {
            console.warn(
              "[CESIUM] invalid camera position restored, using default as fallback",
              destination,
              home
            );
          }
        });
      }
    } else {
      console.debug(
        "[CESIUM] HOOK: skipping cesium location setup with 2d mode active zoom"
      );
    }

    if (!usedInitial && hasHome) {
      console.info(
        "[CESIUM] Cesium Viewer initialized with default home position",
        home
      );
      resetToHome();
    }
    // If we started a home flyTo, rely on its complete() to mark settled.
    // Otherwise, mark settled after the next postRender.
    if (!willFlyHome) {
      withScene((scene) => {
        const markSettled = () => {
          setInitialCameraSettled(true);
          console.info(
            "[CESIUM|INIT|SETTLE] postRender -> state:true (applied)"
          );
          scene.postRender.removeEventListener(markSettled);
        };
        scene.postRender.addEventListener(markSettled);
      });
    }
    withViewer((viewer) => initialViewSetMap.set(viewer, true));
  }, [
    isViewerReady,
    initialCameraView,
    home,
    homeOffset,
    maxZoom,
    withViewer,
    withCamera,
    withScene,
    setInitialCameraSettled,
    shouldSuspendCameraLimitersRef,
  ]);

  useEffect(() => {
    if (viewerRef.current && containerRef?.current) {
      const viewer = viewerRef.current;
      const container = containerRef.current;

      const resizeObserver = new ResizeObserver(() => {
        if (!viewer || viewer.isDestroyed() || !container) {
          return;
        }

        viewer.canvas.width = container.clientWidth;
        viewer.canvas.height = container.clientHeight;
        viewer.canvas.style.width = "100%";
        viewer.canvas.style.height = "100%";
      });

      if (container) {
        resizeObserver.observe(container);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [viewerRef, containerRef]);
};

export default useInitializeViewer;
