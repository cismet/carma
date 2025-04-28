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
  Scene,
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
const preUpdateHandlerMap: WeakMap<Viewer, () => void> = new WeakMap();
const initialViewSetMap: WeakMap<Viewer, boolean> = new WeakMap();

export const useInitializeViewer = (
  containerRef?: React.RefObject<HTMLDivElement>,
  options?: Viewer.ConstructorOptions,
  initialCameraView?: InitialCameraView | null
) => {
  const { viewerRef, isViewerReady, setIsViewerReady } = useCesiumContext();
  const home = useSelector(selectViewerHome);
  const homeOffset = useSelector(selectViewerHomeOffset);

  // aling Cesium Default fallback with local home
  if (home) {
    const { longitude, latitude } = Cartographic.fromCartesian(home);
    const rect = new Rectangle(longitude, latitude, longitude, latitude);

    Camera.DEFAULT_VIEW_RECTANGLE = rect;
  }
  Camera.DEFAULT_OFFSET = new HeadingPitchRange(
    CesiumMath.toRadians(0),
    CesiumMath.toRadians(-45),
    700
  );

  const previousIsMode2d = useRef<boolean | null>(null);
  const previousIsSecondaryStyle = useRef<boolean | null>(null);
  // Store camera position and orientation vectors
  const lastGoodCameraState = useRef<CameraState | null>(null);

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

  console.debug("HOOK: useInitializeViewer");

  useEffect(() => {
    console.debug("HOOK: [CESIUM] init CustomViewer");
    if (containerRef?.current) {
      try {
        console.debug(
          "HOOK: [CESIUM] new init CustomViewer",
          containerRef,
          Date.now(),
          options,
          initialCameraView
        );
        const viewer = new Viewer(containerRef.current, options);
        viewerRef.current = viewer;

        const handlePostRender = () => {
          if (
            viewerRef.current &&
            !viewerRef.current.isDestroyed() &&
            viewerRef.current.canvas.width > 0 &&
            viewerRef.current.canvas.height > 0
          ) {
            setIsViewerReady(true);
            viewer.scene.postRender.removeEventListener(handlePostRender);
            postRenderHandlerMap.delete(viewer);
          }
        };

        const handleValidCameraPosition = () => {
          if (viewerRef.current && viewerRef.current.camera && home) {
            const camera = viewerRef.current.camera;
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
            } else {
              if (lastGoodCameraState.current) {
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
            }
          }
        };

        viewer.scene.preUpdate.addEventListener(handleValidCameraPosition);
        preUpdateHandlerMap.set(viewer, handleValidCameraPosition);

        viewer.scene.postRender.addEventListener(handlePostRender);
        postRenderHandlerMap.set(viewer, handlePostRender);
      } catch (error) {
        console.error("Error initializing viewer:", error);
      }
    }
    return () => {
      if (viewerRef.current) {
        // cleanup listeners
        const handlePostRender = postRenderHandlerMap.get(viewerRef.current);
        if (handlePostRender && viewerRef.current.scene) {
          viewerRef.current.scene.postRender.removeEventListener(
            handlePostRender
          );
          postRenderHandlerMap.delete(viewerRef.current);
        }

        const handlePreUpdate = preUpdateHandlerMap.get(viewerRef.current);
        if (handlePreUpdate && viewerRef.current.scene) {
          viewerRef.current.scene.preUpdate.removeEventListener(
            handlePreUpdate
          );
          preUpdateHandlerMap.delete(viewerRef.current);
        }
        console.info("RENDER: [CESIUM] CustomViewer cleanup destroy viewer");
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [
    options,
    containerRef,
    initialCameraView,
    viewerRef,
    home,
    maxZoom,
    setIsViewerReady,
  ]);

  useEffect(() => {
    console.debug("HOOK: useInitializeViewer useEffect scene settings");
    if (viewerRef.current) {
      const scene: Scene = viewerRef.current.scene;
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
    }
  }, [viewerRef, isSecondaryStyle, maxZoom, minZoom, enableCollisionDetection]);

  useEffect(() => {
    console.debug("HOOK: useInitializeViewer position", initialCameraView);
    if (viewerRef.current && isViewerReady && initialCameraView !== null) {
      const viewer = viewerRef.current;

      if (!home || !homeOffset) {
        console.warn(
          "HOOK: [2D3D|CESIUM|CAMERA] initViewer has no home or homeOffset set, please provide them"
        );
        return;
      }

      if (initialViewSetMap.has(viewer)) {
        console.debug(
          "HOOK: [CESIUM|CAMERA] Initial view already set, skipping."
        );
        return;
      }

      const resetToHome = () => {
        viewer.camera.lookAt(home, homeOffset);
        viewer.camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
          duration: 2,
        });
      };

      if (isMode2d) {
        console.debug(
          "HOOK: skipping cesium location setup with 2d mode active zoom"
        );
      } else {
        const position = initialCameraView?.position;
        const heading = initialCameraView?.heading;
        const pitch = initialCameraView?.pitch;
        const fov = initialCameraView?.fov;

        if (position) {
          const restoredHeight = CesiumMath.clamp(
            position?.height || 1000,
            0,
            50000
          );
          position.height = restoredHeight;

          const destination = Cartographic.toCartesian(position);

          const isValidDestination = validateWorldCoordinate(
            destination,
            home,
            maxZoom,
            0
          );

          if (viewer.camera.frustum instanceof PerspectiveFrustum) {
            viewer.camera.frustum.fov = fov ?? Math.PI / 4;
          }

          if (isValidDestination) {
            console.debug(
              "HOOK [2D3D|CESIUM|CAMERA] init Viewer set camera from provided position",
              destination,
              position
            );
            viewer.camera.setView({
              destination,
              orientation: {
                heading: heading ?? 0,
                pitch: pitch ?? -CesiumMath.PI_OVER_TWO,
              },
            });
            return;
          } else {
            console.warn(
              "invalid camera position restored, using default as fallback",
              destination,
              home
            );
          }
        }
        console.info(
          "Cesium Viewer initialized with default home position",
          home
        );
        resetToHome();
      }
      initialViewSetMap.set(viewer, true);
    }
  }, [
    viewerRef,
    isViewerReady,
    home,
    homeOffset,
    initialCameraView,
    isMode2d,
    maxZoom,
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

  useEffect(() => {
    // init hook
    console.debug("HOOK: useInitializeViewer useEffect");
    if (viewerRef.current) {
      if (
        isMode2d !== previousIsMode2d.current ||
        isSecondaryStyle !== previousIsSecondaryStyle.current
      ) {
        previousIsMode2d.current = isMode2d;
        previousIsSecondaryStyle.current = isSecondaryStyle;
      }
    }
  }, [viewerRef, isSecondaryStyle, isMode2d]);
};

export default useInitializeViewer;
