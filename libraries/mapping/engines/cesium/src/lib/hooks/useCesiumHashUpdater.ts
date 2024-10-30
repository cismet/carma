import { useEffect } from "react";
import { useSelector } from "react-redux";

import { cameraToCartographicDegrees } from "../utils/cesiumHelpers";
import { encodeScene } from "../utils/hashHelpers";

import {
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
} from "../slices/cesium";

import { useCesiumViewer } from "./useCesiumViewer";
import { EncodedSceneParams } from "../..";

export const useCesiumHashUpdater = (
  onSceneChange?: (p: EncodedSceneParams) => void
) => {
  const viewer = useCesiumViewer();
  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);
  const isMode2d = useSelector(selectViewerIsMode2d);
  // todo move requested location updates to an external hook/state
  // todo handle style change explicitly not via tileset

  console.debug("HOOKINIT [CESIUM|HASH] useCesiumHashUpdater");

  useEffect(() => {
    if (viewer && !isMode2d) {
      console.debug(
        "HOOK: update Hash, route or style changed",
        isSecondaryStyle
      );

      const encodedScene = encodeScene(viewer, { isSecondaryStyle, isMode2d });

      if (onSceneChange) {
        onSceneChange(encodedScene);
      } else {
        console.info("HOOK: [NOOP]no onSceneChange callback");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, isMode2d, isSecondaryStyle]);

  useEffect(() => {
    // update hash hook
    if (viewer) {
      console.debug(
        "HOOK: [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to update hash"
      );
      const moveEndListener = async () => {
        // let TopicMap/leaflet handle the view change in 2d Mode
        if (viewer && viewer.camera.position && !isMode2d) {
          const camDeg = cameraToCartographicDegrees(viewer.camera);
          console.debug(
            "LISTENER: Cesium moveEndListener encode viewer to hash",
            isSecondaryStyle,
            camDeg
          );
          const encodedScene = encodeScene(viewer, {
            isSecondaryStyle,
            isMode2d,
          });
          if (onSceneChange) {
            onSceneChange(encodedScene);
          } else {
            console.info("HOOK: [NOOP] no onSceneChange callback");
          }
        }
      };
      viewer.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        viewer && viewer.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [viewer, isSecondaryStyle, isMode2d]);
};
