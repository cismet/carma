import { useEffect } from "react";
import { useSelector } from "react-redux";

import { cameraToCartographicDegrees } from "../utils/cesiumHelpers";
import { encodeScene } from "../utils/hashHelpers";

import {
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
} from "../slices/cesium";

import { EncodedSceneParams } from "../..";
import { useCesiumContext } from "./useCesiumContext";

export const useOnSceneChange = (
  onSceneChange?: (p: EncodedSceneParams) => void
) => {
  const { viewerRef } = useCesiumContext();
  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);
  const isMode2d = useSelector(selectViewerIsMode2d);

  // todo handle style change explicitly not via tileset, is secondarystyle
  // todo consider declaring changed part of state in the callback, not full state only

  console.debug("HOOKINIT [CESIUM|HASH] useCesiumHashUpdater");

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer && viewer.scene && !isMode2d) {
      console.debug(
        "HOOK: update Hash, route or style changed",
        isSecondaryStyle
      );

      const encodedScene = encodeScene(viewer.scene, { isSecondaryStyle, isMode2d });

      if (onSceneChange) {
        onSceneChange(encodedScene);
      } else {
        console.info("HOOK: [NOOP] no onSceneChange callback");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRef, isMode2d, isSecondaryStyle]);

  useEffect(() => {
    // update hash hook
    const viewer = viewerRef.current;
    if (viewer && viewer.scene) {
      console.debug(
        "HOOK: [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to update hash"
      );
      const moveEndListener = async () => {
        // let TopicMap/leaflet handle the view change in 2d Mode
        if (viewer.scene && viewer.camera.position && !isMode2d) {
          const camDeg = cameraToCartographicDegrees(viewer.camera);
          console.debug(
            "LISTENER: Cesium moveEndListener encode viewer to hash",
            isSecondaryStyle,
            camDeg
          );
          const encodedScene = viewer.scene && encodeScene(viewer.scene, {
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
      viewer.scene.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        viewer && viewer.scene && viewer.scene.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [viewerRef, isSecondaryStyle, isMode2d, onSceneChange]);
};

export default useOnSceneChange;
