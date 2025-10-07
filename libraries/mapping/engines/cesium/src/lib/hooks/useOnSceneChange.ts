import { useEffect } from "react";
import { useSelector } from "react-redux";
import { type Viewer } from "cesium";

import type { LatLng } from "@carma/types";

import {
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
  selectViewerIsTransitioning,
} from "../slices/cesium";

import { useCesiumContext } from "./useCesiumContext";

import { cameraToCartographicDegrees } from "../utils/cesiumHelpers";
import {
  encodeCesiumCamera,
  type StringifiedCameraState,
} from "../utils/cesiumHashParamsCodec";

import { VIEWERSTATE_KEYS } from "../constants";

const toHashParams = (
  cesiumCameraState: StringifiedCameraState,
  args: { isSecondaryStyle: boolean; isMode2d: boolean }
) => {
  const viewerState = {
    [VIEWERSTATE_KEYS.mapStyle]: args.isSecondaryStyle ? "0" : "1",
    [VIEWERSTATE_KEYS.is3d]: args.isMode2d ? "0" : "1",
  };

  const hashParams = cesiumCameraState.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, viewerState);

  return hashParams;
};

export const useOnSceneChange = (
  onSceneChange?: (
    e: { hashParams: Record<string, string> },
    viewer?: Viewer,
    cesiumCameraState?: StringifiedCameraState | null,
    isSecondaryStyle?: boolean,
    isMode2d?: boolean
  ) => void
) => {
  const { withViewer } = useCesiumContext();
  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);
  const isMode2d = useSelector(selectViewerIsMode2d);
  const isTransitioning = useSelector(selectViewerIsTransitioning);

  // todo handle style change explicitly not via tileset, is secondarystyle
  // todo consider declaring changed part of state in the callback, not full state only

  useEffect(() => {
    // on changes to mode or style
    if (isTransitioning || isMode2d) {
      return;
    }

    withViewer((viewer) => {
      console.debug(
        "HOOK: update Hash, route or style changed",
        isSecondaryStyle
      );
      const { scene } = viewer;
      const { camera } = scene;
      if (onSceneChange) {
        let cameraState: StringifiedCameraState | null = null;
        cameraState = encodeCesiumCamera(camera);
        if (cameraState === null) {
          return;
        }
        const hashParams = toHashParams(cameraState, {
          isSecondaryStyle,
          isMode2d,
        });
        hashParams.zoom = "";
        onSceneChange({ hashParams });
      } else {
        console.info("HOOK: [NOOP] no onSceneChange callback");
      }
    });
  }, [withViewer, onSceneChange, isMode2d, isSecondaryStyle, isTransitioning]);

  useEffect(() => {
    // update hash hook
    if (isTransitioning) {
      return;
    }

    withViewer((viewer) => {
      const camera = viewer.scene.camera;
      console.debug(
        "HOOK: [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to update hash"
      );
      const moveEndListener = async () => {
        // let TopicMap/leaflet handle the view change in 2d Mode
        let proceed = false;
        let camDeg: Required<LatLng.deg> | undefined;

        proceed = Boolean(camera && camera.position && !isMode2d);
        if (proceed) {
          try {
            camDeg = cameraToCartographicDegrees(camera);
          } catch (error) {
            console.warn("Error getting camera position", error);
          }
        }
      };
      if (proceed && camDeg) {
        console.debug(
          "LISTENER: Cesium moveEndListener encode viewer to hash",
          isSecondaryStyle,
          camDeg
        );

        if (onSceneChange) {
          let cameraState: StringifiedCameraState | null = null;
          cameraState = encodeCesiumCamera(camera);
          if (cameraState === null) {
            return;
          }
          const hashParams = toHashParams(cameraState, {
            isSecondaryStyle,
            isMode2d,
          });
          onSceneChange({ hashParams });
        } else {
          console.info("HOOK: [NOOP] no onSceneChange callback");
        }
      }
      if (isValidCamera(camera)) {
        camera.moveEnd.addEventListener(moveEndListener);
      }
      return () => {
        // clear hash on unmount
        // onSceneChange?.({ hashParams: clear3dOnlyHashParams });
        withViewer((viewer) => {
          if (!viewer.isDestroyed()) {
            viewer.scene.camera.moveEnd.removeEventListener(moveEndListener);
          }
        });
      };
    });
  }, [withViewer, isSecondaryStyle, isMode2d, onSceneChange, isTransitioning]);
};

export default useOnSceneChange;
