import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import {
  BoundingSphere,
  Camera,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  Rectangle,
  ScreenSpaceCameraController,
  Viewer,
} from "cesium";

import { useCesiumContext } from "./useCesiumContext";

import {
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
  selectViewerHome,
  selectViewerHomeOffset,
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
  700
);

export const useInitializeViewer = (
  containerRef?: React.RefObject<HTMLDivElement>,
  options?: Viewer.ConstructorOptions,
  initialCameraView?: InitialCameraView | null
) => {
  const {
    viewerRef,
    sceneRef,
    isValidViewer,
    isViewerReady,
    setIsViewerReady,
    shouldSuspendCameraLimitersRef,
    withScene,
    withCamera,
    withViewer,
    setInitialCameraSettled,
  } = useCesiumContext();

  const home = useSelector(selectViewerHome);
  const homeOffset = useSelector(selectViewerHomeOffset);
  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);
  const minZoom = useSelector(
    selectScreenSpaceCameraControllerMinimumZoomDistance
  );
  const maxZoom = useSelector(
    selectScreenSpaceCameraControllerMaximumZoomDistance
  );
  const enableCollisionDetection = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );

  const isMode2d = useSelector(selectViewerIsMode2d);

  // Store camera position and orientation vectors
  const lastGoodCameraState = useRef<CameraState | null>(null);

  console.debug("HOOK: useInitializeViewer");

  // override cesium default home
  useEffect(() => {
    // align Cesium Default fallback with local home
    if (home) {
      console.debug(
        "HOOK: [CESIUM|INIT] override default cesium with configured home",
        home
      );
      const { longitude, latitude } = Cartographic.fromCartesian(home);
      const rect = new Rectangle(longitude, latitude, longitude, latitude);

      Camera.DEFAULT_VIEW_RECTANGLE = rect;
      Camera.DEFAULT_OFFSET = DEFAULT_HPR;
    }
  }, [home]);

  useEffect(() => {
    console.debug("HOOK: [CESIUM|INIT] init CustomViewer");
    if (containerRef?.current) {
      try {
        // Reuse existing viewer if it exists and isn't destroyed
        if (isValidViewer()) {
          console.debug("HOOK: [CESIUM|INIT] Reusing existing viewer instance");
          return;
        }

        console.debug(
          "HOOK: [CESIUM|INIT] new init CustomViewer",
          containerRef,
          Date.now(),
          options,
          initialCameraView
        );
        const viewer = new Viewer(containerRef.current, options);
        viewerRef.current = viewer;
        sceneRef.current = viewer.scene;
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
          //console.debug("v", viewerRef.current?.scene.requestRenderMode);
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
                "HOOK: [2D3D|CESIUM|CAMERA] invalid camera position, restoring last good state",
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
          console.debug("[CESIUM|INIT|CAMERA] add listener for camera limiter");
          viewer.camera.changed.addEventListener(handleValidCameraPosition);
          cameraChangedHandlerMap.set(viewer, handleValidCameraPosition);

          scene.postRender.addEventListener(handlePostRender);
          postRenderHandlerMap.set(viewer, handlePostRender);
        });
      } catch (error) {
        console.error("Error initializing viewer:", error);
      }
    }
    return () => {
      // Only cleanup listeners, don't destroy viewer to allow reuse
      if (!isValidViewer()) {
        // cleanup listeners
        withViewer((viewer) => {
          const handlePostRender = postRenderHandlerMap.get(viewer);
          if (handlePostRender) {
            viewer.scene.postRender.removeEventListener(handlePostRender);
            postRenderHandlerMap.delete(viewer);
          }

          const handleCameraChanged = cameraChangedHandlerMap.get(viewer);
          if (handleCameraChanged) {
            viewer.camera.changed.removeEventListener(handleCameraChanged);
            cameraChangedHandlerMap.delete(viewer);
          }
        });
        console.info(
          "RENDER: [CESIUM|INIT] CustomViewer cleanup - preserving viewer instance"
        );
        // Don't destroy the viewer - keep it for reuse when returning to 3D
      }
    };
  }, [
    options,
    containerRef,
    initialCameraView,
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
  ]);

  useEffect(() => {
    withScene((scene) => {
      console.debug("HOOK:[CESIUM|INIT|SCENE] setup scene settings");

      const sscc: ScreenSpaceCameraController =
        scene.screenSpaceCameraController;

      scene.globe.depthTestAgainstTerrain = true;
      // Terrain would show up as opaques surface over mesh if not set transparent
      scene.globe.translucency.enabled = true;
      scene.globe.translucency.frontFaceAlpha = isSecondaryStyle ? 1.0 : 0.0;
      scene.globe.translucency.backFaceAlpha = isSecondaryStyle ? 1.0 : 0.0;

      sscc.enableCollisionDetection = enableCollisionDetection;
      sscc.minimumZoomDistance = minZoom ?? 1;
      sscc.maximumZoomDistance = maxZoom ?? Infinity;
    });
  }, [withScene, isSecondaryStyle, maxZoom, minZoom, enableCollisionDetection]);

  useEffect(() => {
    console.debug("HOOK: useInitializeViewer position", initialCameraView);
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
        "HOOK: [CESIUM|CAMERA] Initial view already set, skipping."
      );
      // Viewer already has an initial view applied — consider camera settled
      setInitialCameraSettled(true);
      console.info(
        "[CESIUM|INIT|SETTLE] reuse:true -> state:true (already applied)"
      );
      return;
    }

    const hasHome = !!home && !!homeOffset;
    if (!hasHome) {
      console.warn(
        "HOOK: [2D3D|CESIUM|CAMERA] initViewer has no home or homeOffset yet; applying hash camera without validation"
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
    if (!isMode2d && initialCameraView) {
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
              "invalid camera position restored, using default as fallback",
              destination,
              home
            );
          }
        });
      }
    } else {
      console.debug(
        "HOOK: skipping cesium location setup with 2d mode active zoom"
      );
    }

    if (!usedInitial && hasHome) {
      console.info(
        "Cesium Viewer initialized with default home position",
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
    isMode2d,
    maxZoom,
    withViewer,
    withCamera,
    withScene,
    setInitialCameraSettled,
    shouldSuspendCameraLimitersRef,
  ]);

  useEffect(() => {
    console.debug("HOOK: useInitializeViewer useEffect resize");
    if (viewerRef.current && containerRef?.current) {
      const viewer = viewerRef.current;
      const resizeObserver = new ResizeObserver(() => {
        console.debug("HOOK: resize cesium container");
        if (viewer && !viewer.isDestroyed() && containerRef?.current) {
          viewer.canvas.width = containerRef.current.clientWidth;
          viewer.canvas.height = containerRef.current.clientHeight;
          viewer.canvas.style.width = "100%";
          viewer.canvas.style.height = "100%";
        }
      });
      if (containerRef?.current) {
        resizeObserver.observe(containerRef.current);
      }
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [viewerRef, containerRef, isMode2d]);
};

export default useInitializeViewer;
