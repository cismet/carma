import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import { cameraToCartographicDegrees } from "../utils/cesiumHelpers";
import { encodeScene, replaceHashRoutedHistory } from "../utils/hashHelpers";

import {
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
} from "../slices/cesium";

import { useCesiumViewer } from "./useCesiumViewer";

export const useCesiumHashUpdater = ({
  enableLocationHashUpdate,
}: {
  enableLocationHashUpdate: boolean;
}) => {
  const viewer = useCesiumViewer();
  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);
  const isMode2d = useSelector(selectViewerIsMode2d);
  // todo move requested location updates to an external hook/state
  // todo handle style change explicitly not via tileset
  const location = useLocation();

  useEffect(() => {
    if (viewer && enableLocationHashUpdate && !isMode2d) {
      console.log(
        "HOOK: update Hash, route or style changed",
        isSecondaryStyle
      );
      replaceHashRoutedHistory(
        encodeScene(viewer, { isSecondaryStyle, isMode2d }),
        location.pathname
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewer,
    isMode2d,
    enableLocationHashUpdate,
    location.pathname,
    isSecondaryStyle,
  ]);

  useEffect(() => {
    // update hash hook
    if (viewer) {
      console.debug(
        "HOOK: [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to update hash"
      );
      const moveEndListener = async () => {
        // let TopicMap/leaflet handle the view change in 2d Mode
        if (
          viewer &&
          viewer.camera.position &&
          !isMode2d &&
          enableLocationHashUpdate
        ) {
          const camDeg = cameraToCartographicDegrees(viewer.camera);
          console.log(
            "LISTENER: Cesium moveEndListener encode viewer to hash",
            isSecondaryStyle,
            camDeg
          );
          const encodedScene = encodeScene(viewer, {
            isSecondaryStyle,
            isMode2d,
          });
          replaceHashRoutedHistory(encodedScene, location.pathname);
        }
      };
      viewer.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        viewer && viewer.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [
    viewer,
    isSecondaryStyle,
    isMode2d,
    location.pathname,
    enableLocationHashUpdate,
  ]);
};
