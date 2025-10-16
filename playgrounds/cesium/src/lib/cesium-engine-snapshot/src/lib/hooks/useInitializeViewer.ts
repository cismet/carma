import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import {
  BoundingSphere,
  Camera,
  Cartesian3,
  Math as CesiumMath,
  PerspectiveFrustum,
  Rectangle,
  Scene,
  ScreenSpaceCameraController,
  Viewer,
} from "cesium";
import { WUPPERTAL } from "@carma/resources";

// Override Cesium Camera defaults globally to prevent globe view
(Camera as any).DEFAULT_VIEW_RECTANGLE = Rectangle.fromDegrees(
  WUPPERTAL.position.longitude - 0.02,
  WUPPERTAL.position.latitude - 0.02,
  WUPPERTAL.position.longitude + 0.02,
  WUPPERTAL.position.latitude + 0.02
);
(Camera as any).DEFAULT_VIEW_FACTOR = 0;
console.log("GLOBAL: Camera defaults overridden to Wuppertal close view");

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
  const cameraInitializedRef = useRef(false);

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

  console.debug("HOOK: useInitializeViewer", { home, homeOffset, isMode2d });

  useEffect(() => {
    console.debug("HOOK: [CESIUM] init CustomViewer", {
      hasHome: !!home,
      hasHomeOffset: !!homeOffset,
      home,
      homeOffset,
    });
    if (containerRef?.current) {
      try {
        viewerRef.current = new Viewer(containerRef.current, options);

        console.debug(
          "HOOK: Viewer created, camera position:",
          viewerRef.current.camera.position
        );

        if (viewerRef.current && home && homeOffset) {
          console.debug(
            "HOOK: Flying to home position with 20km initial distance"
          );
          viewerRef.current.camera.lookAt(
            home,
            new Cartesian3(0, -20000, 20000)
          );
          viewerRef.current.camera.flyToBoundingSphere(
            new BoundingSphere(home, 500),
            {
              duration: 3,
            }
          );
          console.debug("HOOK: FlyTo home initiated");
        } else {
          console.warn(
            "HOOK: Cannot set camera - missing home or homeOffset!",
            { home, homeOffset }
          );
        }
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
    console.debug("HOOK: Camera set effect running", {
      hasViewer: !!viewerRef.current,
      hasHome: !!home,
      hasHomeOffset: !!homeOffset,
      alreadyInitialized: cameraInitializedRef.current,
    });
    if (
      viewerRef.current &&
      home &&
      homeOffset &&
      !cameraInitializedRef.current
    ) {
      console.debug("HOOK: Setting camera to home position in separate effect");
      viewerRef.current.camera.lookAt(home, homeOffset);
      cameraInitializedRef.current = true;
      console.debug(
        "HOOK: Camera position after separate effect:",
        viewerRef.current.camera.position
      );
    }
  }, [viewerRef, home, homeOffset]);

  useEffect(() => {
    console.debug("HOOK: useInitializeViewer useEffect terrain");
    if (viewerRef.current) {
      const scene: Scene = viewerRef.current.scene;
      const sscc: ScreenSpaceCameraController =
        scene.screenSpaceCameraController;

      scene.globe.depthTestAgainstTerrain = true;
      scene.globe.enableLighting = false;
      // Terrain would show up as opaques surface over mesh if not set transparent
      scene.globe.translucency.enabled = true;
      scene.globe.translucency.frontFaceAlpha = isSecondaryStyle ? 1.0 : 0.0;
      scene.globe.translucency.backFaceAlpha = isSecondaryStyle ? 1.0 : 0.0;

      console.debug(
        "HOOK: depthTestAgainstTerrain enabled, globe translucent for mesh draping"
      );

      sscc.enableCollisionDetection = false;
      sscc.minimumZoomDistance = minZoom ?? 1;
      sscc.maximumZoomDistance = maxZoom ?? Infinity;
    }
  }, [viewerRef, isSecondaryStyle, maxZoom, minZoom, enableCollisionDetection]);

  useEffect(() => {
    console.debug("HOOK: Old camera initialization effect", {
      hasViewer: !!viewerRef.current,
      hashRefValue: hashRef.current,
      isMode2d,
      hasHome: !!home,
      hasHomeOffset: !!homeOffset,
    });

    if (viewerRef.current && hashRef.current === null && !isMode2d) {
      console.debug("HOOK: Running old camera init code");
      hashRef.current = "initialized";
      const viewer = viewerRef.current;

      if (viewer.camera.frustum instanceof PerspectiveFrustum) {
        viewer.camera.frustum.fov = Math.PI / 4;
      }

      if (home && homeOffset) {
        console.debug(
          "HOOK: [2D3D|CESIUM|CAMERA] OLD initViewer using home position",
          home,
          homeOffset
        );
        console.debug(
          "HOOK: Camera BEFORE old lookAt:",
          viewer.camera.position
        );
        viewer.camera.lookAt(home, homeOffset);
        console.debug("HOOK: Camera AFTER old lookAt:", viewer.camera.position);
        viewer.camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
          duration: 2,
        });
        console.debug(
          "HOOK: Camera AFTER flyTo started:",
          viewer.camera.position
        );
      } else {
        console.warn("HOOK: initViewer no home position configured");
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
