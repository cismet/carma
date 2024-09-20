import { useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";
import {
  Viewer,
  BoundingSphere,
  Cartesian3,
  PerspectiveFrustum,
  Math as CeMath,
  ScreenSpaceCameraController,
  Scene,
} from "cesium";
import type { Map as LeafletMap } from "leaflet";

import { useCesiumCustomViewer } from "../CustomViewerContextProvider";
import {
  setIsAnimating,
  setShowPrimaryTileset,
  setShowSecondaryTileset,
  useScreenSpaceCameraControllerMinimumZoomDistance,
  useScreenSpaceCameraControllerMaximumZoomDistance,
  useShowSecondaryTileset,
  useViewerHome,
  useScreenSpaceCameraControllerEnableCollisionDetection,
} from "../CustomViewerContextProvider/slices/cesium";
import { decodeSceneFromLocation } from "./utils";
import { setupSecondaryStyle } from "./components/baseTileset.hook";
import { leafletToCesiumCamera } from "../utils";

const useInitializeViewer = (
  viewer: Viewer | null,
  home: Cartesian3 | null,
  homeOffset: Cartesian3 | null,
  leaflet?: LeafletMap | null,
) => {
  const [hash, setHash] = useState<string | null>(null); // effectively hook should run only once
  const dispatch = useDispatch();
  const location = useLocation();
  const viewerContext = useCesiumCustomViewer();
  const isSecondaryStyle = useShowSecondaryTileset();
  const minZoom = useScreenSpaceCameraControllerMinimumZoomDistance();
  const maxZoom = useScreenSpaceCameraControllerMaximumZoomDistance();
  const enableCollisionDetection = useScreenSpaceCameraControllerEnableCollisionDetection();

  useEffect(() => {
    if (viewer) {
      console.log("HOOK: enable terrain collision detection");
      const scene: Scene = viewer.scene;
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
      console.log("HOOK: set initialHash", locationHash);

      const hashParams = locationHash.split("?")[1];
      const sceneFromHashParams = decodeSceneFromLocation(hashParams);
      const { camera, isSecondaryStyle } = sceneFromHashParams;
      const { latitude, longitude, height, heading, pitch } = camera;

      if (viewer.camera.frustum instanceof PerspectiveFrustum) {
        viewer.camera.frustum.fov = Math.PI / 4;
      }

      // TODO enable 2D Mode if zoom value is present in hash on startup

      if (isSecondaryStyle) {
        console.log("HOOK: set secondary style from hash");
        setupSecondaryStyle(viewerContext);
        dispatch(setShowPrimaryTileset(false));
        dispatch(setShowSecondaryTileset(true));
      }

      if (sceneFromHashParams && longitude && latitude) {
        console.log("HOOK: init Viewer set camera from hash zoom", height);
        viewer.camera.setView({
          destination: Cartesian3.fromRadians(
            longitude,
            latitude,
            height ?? 1000, // restore height if missing
          ),
          orientation: {
            heading: heading ?? 0,
            pitch: pitch ?? -CeMath.PI_OVER_TWO,
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
      } else if (leaflet) {
        const { lat, lng } = leaflet.getCenter();
        const zoom = leaflet.getZoom();
        console.log("HOOK: initViewer from leaflet zoom", zoom);
        leafletToCesiumCamera(viewer, { lat, lng, zoom });

        // triggers url hash update on moveend
      } else if (home && homeOffset) {
        console.log("HOOK: initViewer no hash, using home zoom", home);
        viewer.camera.lookAt(home, homeOffset);
        viewer.camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
          duration: 2,
        });
        // triggers url hash update on moveend
      } else {
        console.info("HOOK: initViewer no hash, no home, no zoom");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, home, homeOffset, location.pathname, hash]);
};

export const useHomeControl = () => {
  const dispatch = useDispatch();
  const { viewer } = useCesiumCustomViewer();
  const homePosition = useViewerHome();
  const [homePos, setHomePos] = useState<Cartesian3 | null>(null);

  useEffect(() => {
    viewer &&
      homePosition &&
      setHomePos(
        new Cartesian3(homePosition.x, homePosition.y, homePosition.z),
      );
  }, [viewer, homePosition]);

  const handleHomeClick = useCallback(() => {
    console.log("homePos click", homePos, viewer);
    if (viewer && homePos) {
      dispatch(setIsAnimating(false));
      const boundingSphere = new BoundingSphere(homePos, 400);
      viewer.camera.flyToBoundingSphere(boundingSphere);
    }
  }, [viewer, homePos, dispatch]);

  return handleHomeClick;
};

const MOVERATE_FACTOR = 0.33;

export function useZoomControls(moveRateFactor: number = MOVERATE_FACTOR) {
  const { viewer } = useCesiumCustomViewer();

  const handleZoomIn = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (!viewer) return;
      const scene = viewer.scene;
      const camera = viewer.camera;
      const ellipsoid = scene.globe.ellipsoid;

      const cameraHeight = ellipsoid.cartesianToCartographic(
        camera.position,
      ).height;
      const moveRate = cameraHeight * moveRateFactor;
      camera.moveForward(moveRate);
    },
    [viewer, moveRateFactor],
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (!viewer) return;
      const scene = viewer.scene;
      const camera = viewer.camera;
      const ellipsoid = scene.globe.ellipsoid;

      const cameraHeight = ellipsoid.cartesianToCartographic(
        camera.position,
      ).height;
      const moveRate = cameraHeight * moveRateFactor;
      camera.moveBackward(moveRate);
    },
    [viewer, moveRateFactor],
  );

  return { handleZoomIn, handleZoomOut };
}

export default useInitializeViewer;
