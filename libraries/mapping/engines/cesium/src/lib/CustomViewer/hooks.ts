import { useCallback, useEffect, useState } from "react";
import {
  Viewer,
  BoundingSphere,
  Cartesian3,
  PerspectiveFrustum,
  Math as CeMath,
} from "cesium";
import { useDispatch } from "react-redux";
import {
  setIsAnimating,
  setShowPrimaryTileset,
  setShowSecondaryTileset,
  useViewerHome,
} from "../CustomViewerContextProvider/slices/cesium";
import { decodeSceneFromLocation } from "./utils";
import { setupSecondaryStyle } from "./components/baseTileset.hook";
import { useLocation } from "react-router-dom";
import { useCesiumCustomViewer } from "../CustomViewerContextProvider";

const useInitializeViewer = (
  viewer: Viewer | null,
  home: Cartesian3 | null,
  homeOffset: Cartesian3 | null,
) => {
  const [hash, setHash] = useState<string | null>(null); // effectively hook should run only once
  const dispatch = useDispatch();
  const location = useLocation();
  const viewerContext = useCesiumCustomViewer();

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
        console.log("HOOK: init Viewer set camera from hash");
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
      } else if (home && homeOffset) {
        console.log("HOOK: initViewer no hash, using home");
        viewer.camera.lookAt(home, homeOffset);
        viewer.camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
          duration: 2,
        });
        // triggers url hash update on moveend
      } else {
        console.info("HOOK: initViewer no hash, no home");
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

export default useInitializeViewer;
