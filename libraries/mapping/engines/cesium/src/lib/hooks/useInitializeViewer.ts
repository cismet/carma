import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import {
  BoundingSphere,
  Cartesian3,
  Math as CesiumMath,
  PerspectiveFrustum,
  Scene,
  ScreenSpaceCameraController,
  Viewer,
} from "cesium";
import type { Map as LeafletMap } from "leaflet";

import {
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
  setShowPrimaryTileset,
  setShowSecondaryTileset,
} from "../slices/cesium";
import { decodeSceneFromLocation } from "../utils/hashHelpers";
import { setupSecondaryStyle } from "../utils/sceneStyles";

import { useCesiumContext } from "./useCesiumContext";
import { useCesiumViewer } from "./useCesiumViewer";

export const useInitializeViewer = ({
  containerRef,
  home,
  homeOffset,
  leaflet,
}: {
  containerRef?: React.RefObject<HTMLDivElement>;
  home: Cartesian3 | null;
  homeOffset: Cartesian3 | null;
  leaflet?: LeafletMap | null;
}) => {
  const [hash, setHash] = useState<string | null>(null); // effectively hook should run only once

  const previousIsMode2d = useRef<boolean | null>(null);
  const previousIsSecondaryStyle = useRef<boolean | null>(null);

  const dispatch = useDispatch();
  const location = useLocation();
  const ctx = useCesiumContext();
  const viewer = useCesiumViewer();
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
    if (viewer) {
      console.debug("HOOK: enable terrain collision detection");
      const scene: Scene = viewer.scene;
      scene.requestRenderMode = true;
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
  }, [viewer, isSecondaryStyle, maxZoom, minZoom, enableCollisionDetection]);

  useEffect(() => {
    if (viewer && hash === null) {
      const locationHash = window.location.hash ?? "";
      setHash(locationHash);
      console.debug("HOOK: set initialHash", locationHash);

      const hashParams = locationHash.split("?")[1];
      const sceneFromHashParams = decodeSceneFromLocation(hashParams);
      const { camera, isSecondaryStyle } = sceneFromHashParams;
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
        if (isSecondaryStyle) {
          console.debug("HOOK: set secondary style from hash");
          setupSecondaryStyle(ctx);
          dispatch(setShowPrimaryTileset(false));
          dispatch(setShowSecondaryTileset(true));
        }

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

          /*
          (async () => {
            replaceHashRoutedHistory(
              await encodeScene({ viewer, isSecondaryStyle }),
              location.pathname
            );
          })();
          */
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
  }, [viewer, home, homeOffset, location.pathname, hash, isMode2d]);

  useEffect(() => {
    if (viewer && containerRef?.current) {
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
  }, [viewer, containerRef, isMode2d]);

  useEffect(() => {
    // init hook
    if (viewer) {
      if (
        isMode2d !== previousIsMode2d.current ||
        isSecondaryStyle !== previousIsSecondaryStyle.current
      ) {
        previousIsMode2d.current = isMode2d;
        previousIsSecondaryStyle.current = isSecondaryStyle;
      }
    }
  }, [viewer, isSecondaryStyle, isMode2d]);
};

export default useInitializeViewer;
