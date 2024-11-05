import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import {
  BoundingSphere,
  Cartesian3,
  Math as CesiumMath,
  PerspectiveFrustum,
  Scene,
  ScreenSpaceCameraController,
  Viewer,
} from "cesium";

import {
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
  selectViewerHome,
  selectViewerHomeOffset,
} from "../slices/cesium";
import { decodeSceneFromLocation } from "../utils/hashHelpers";

import { useCesiumContext } from "./useCesiumContext";

export const useInitializeViewer = (
  containerRef?: React.RefObject<HTMLDivElement>,
  options?: Viewer.ConstructorOptions
) => {
  const { viewerRef } = useCesiumContext();
  const home = useSelector(selectViewerHome);
  const homeOffset = useSelector(selectViewerHomeOffset);

  // todo move initialization from hash to consuming component
  const hashRef = useRef<string | null>(null); // effectively hook should run only once

  const previousIsMode2d = useRef<boolean | null>(null);
  const previousIsSecondaryStyle = useRef<boolean | null>(null);

  //const location = useLocation();
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
        viewerRef.current = new Viewer(containerRef.current, options);
        /*
        // make cesium added containers transparent
        const container = viewerRef.current.container;
        const cesiumViewer = container.children[0] as HTMLElement;
        const cesiumViewerCesiumWidgetContainer = cesiumViewer
          .children[0] as HTMLElement;
        const cesiumWidget = cesiumViewerCesiumWidgetContainer
          .children[0] as HTMLElement;
        cesiumViewer.style.backgroundColor = "transparent";
        cesiumViewerCesiumWidgetContainer.style.backgroundColor = "transparent";
        cesiumWidget.style.backgroundColor = "transparent";
        */
      } catch (error) {
        console.error("Error initializing viewer:", error);
      }
    }
    return () => {
      if (viewerRef.current) {
        console.info("RENDER: [CESIUM] CustomViewer cleanup destroy viewer");
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [options, containerRef, viewerRef]);

  useEffect(() => {
    console.debug("HOOK: useInitializeViewer useEffect terrain");
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
    console.debug("HOOK: useInitializeViewer useEffect hash");
    if (viewerRef.current && hashRef.current === null) {
      const viewer = viewerRef.current;
      const locationHash = window.location.hash ?? "";
      hashRef.current = locationHash;
      console.debug("HOOK: set initialHash", locationHash);

      const hashParams = locationHash.split("?")[1];
      const sceneFromHashParams = decodeSceneFromLocation(hashParams);
      const { camera } = sceneFromHashParams;
      const { latitude, longitude, height, heading, pitch } = camera;

      if (viewer.camera.frustum instanceof PerspectiveFrustum) {
        viewer.camera.frustum.fov = Math.PI / 4;
      }

      // TODO enable 2D Mode if zoom value is present in hash on startup

      if (isMode2d) {
        console.debug(
          "HOOK: skipping cesium location setup with 2d mode active zoom"
        );
      } else {
        if (sceneFromHashParams && longitude && latitude) {
          console.debug(
            "HOOK [2D3D|CESIUM|CAMERA] init Viewer set camera from hash zoom",
            height
          );
          viewer.camera.setView({
            destination: Cartesian3.fromRadians(
              longitude,
              latitude,
              height ?? 1000 // restore height if missing
            ),
            orientation: {
              heading: heading ?? 0,
              pitch: pitch ?? -CesiumMath.PI_OVER_TWO,
            },
          });
        } else if (home && homeOffset) {
          console.debug(
            "HOOK: [2D3D|CESIUM|CAMERA] initViewer no hash, using home zoom",
            home
          );
          viewer.camera.lookAt(home, homeOffset);
          viewer.camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
            duration: 2,
          });
          // triggers url hash update on moveend
        } else {
          console.debug("HOOK: initViewer no hash, no home, no zoom");
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRef, home, homeOffset, location.pathname, isMode2d]);

  useEffect(() => {
    console.debug("HOOK: useInitializeViewer useEffect resize");
    if (viewerRef.current && containerRef?.current) {
      const viewer = viewerRef.current;
      const resizeObserver = new ResizeObserver(() => {
        console.debug("HOOK: resize cesium container");
        if (viewer && containerRef?.current) {
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
