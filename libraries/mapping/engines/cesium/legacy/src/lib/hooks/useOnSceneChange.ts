import { useEffect } from "react";
import { useSelector } from "react-redux";
import { Camera, type Viewer } from "cesium";

import {
  selectShowSecondaryTileset,
  selectViewerIsTransitioning,
} from "../slices/cesium";

import { useCesiumContext } from "./useCesiumContext";

import {
  encodeCesiumCamera,
  type StringifiedCameraState,
} from "../utils/cesiumHashParamsCodec";

import { VIEWERSTATE_KEYS } from "../constants";

const toHashParams = (
  cesiumCameraState: StringifiedCameraState,
  args: { isSecondaryStyle: boolean; isCesiumActive: boolean }
) => {
  const viewerState = {
    [VIEWERSTATE_KEYS.mapStyle]: args.isSecondaryStyle ? "0" : "1",
    [VIEWERSTATE_KEYS.is3d]: args.isCesiumActive ? "1" : "0",
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
    isSecondaryStyle?: boolean
  ) => void,
  isCesiumActive: boolean = true
) => {
  const ctx = useCesiumContext();
  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);
  const isTransitioning = useSelector(selectViewerIsTransitioning);

  // todo handle style change explicitly not via tileset, is secondarystyle
  // todo consider declaring changed part of state in the callback, not full state only

  useEffect(() => {
    // on changes to mode or style
    if (isTransitioning) {
      return;
    }
    if (ctx.isValidViewer() && isCesiumActive) {
      console.debug(
        "HOOK: update Hash, route or style changed",
        isSecondaryStyle
      );
      if (onSceneChange) {
        let cameraState: StringifiedCameraState | null = null;
        ctx.withCamera((camera) => {
          cameraState = encodeCesiumCamera(camera);
        });
        if (cameraState === null) {
          return;
        }
        const hashParams = toHashParams(cameraState, {
          isSecondaryStyle,
          isCesiumActive,
        });
        hashParams.zoom = "";
        onSceneChange({ hashParams });
      } else {
        console.info("HOOK: [NOOP] no onSceneChange callback");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, isCesiumActive, isSecondaryStyle, isTransitioning]);

  useEffect(() => {
    // update hash hook
    if (isTransitioning) {
      return;
    }

    if (ctx.isValidViewer()) {
      console.debug(
        "HOOK: [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to update hash"
      );
      const moveEndListener = async () => {
        // let TopicMap/leaflet handle the view change in 2d Mode
        let camera: Camera | null = null;
        ctx.withCamera((c) => {
          camera = c;
        });

        if (camera && isCesiumActive) {
          console.debug(
            "LISTENER: Cesium moveEndListener encode viewer to hash",
            isSecondaryStyle
          );

          if (onSceneChange) {
            let cameraState: StringifiedCameraState | null = null;
            cameraState = encodeCesiumCamera(camera);
            if (cameraState === null) {
              return;
            }
            const hashParams = toHashParams(cameraState, {
              isSecondaryStyle,
              isCesiumActive,
            });
            onSceneChange({ hashParams });
          } else {
            console.info("HOOK: [NOOP] no onSceneChange callback");
          }
        }
      };
      ctx.withCamera((camera) => {
        camera.moveEnd.addEventListener(moveEndListener);
      });
      return () => {
        // clear hash on unmount
        // onSceneChange?.({ hashParams: clearCesiumOnlyHashParams });
        ctx.withViewer((viewer) => {
          viewer.camera.moveEnd.removeEventListener(moveEndListener);
        });
      };
    }
  }, [ctx, isSecondaryStyle, isCesiumActive, onSceneChange, isTransitioning]);
};

export default useOnSceneChange;
