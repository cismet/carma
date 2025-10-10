import { useEffect } from "react";
import { type Viewer } from "cesium";

import type { LatLng } from "@carma/types";

import { useCesiumContext } from "./useCesiumContext";

import { cameraToCartographicDegrees } from "../utils/cesiumHelpers";

// Helper function to check if in transition state
const isTransitionState = (state: unknown): boolean => {
  const transitionStates = [
    "preTransitionTo2d",
    "transitionTo2d",
    "postTransitionTo2d",
    "preTransitionTo3d",
    "transitionTo3d",
    "postTransitionTo3d",
  ];
  return transitionStates.includes(String(state));
};
import {
  encodeCesiumCamera,
  type StringifiedCameraState,
} from "../utils/cesiumHashParamsCodec";

import { VIEWERSTATE_KEYS, TILESET_IDS } from "../constants";

const toHashParams = (
  cesiumCameraState: StringifiedCameraState,
  args: { isSecondaryStyle: boolean; isSuspended: boolean }
) => {
  const viewerState = {
    [VIEWERSTATE_KEYS.mapStyle]: args.isSecondaryStyle ? "0" : "1",
    [VIEWERSTATE_KEYS.is3d]: args.isSuspended ? "0" : "1",
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
    isSuspended?: boolean
  ) => void
) => {
  const {
    isValidViewer,
    transitionStateRef,
    withCamera,
    isSuspendedRef,
    tilesetVisibilityRef,
  } = useCesiumContext();
  const isSecondaryStyle =
    tilesetVisibilityRef.current.get(TILESET_IDS.SECONDARY) ?? true;

  // todo handle style change explicitly not via tileset, is secondarystyle
  // todo consider declaring changed part of state in the callback, not full state only

  useEffect(() => {
    if (isTransitionState(transitionStateRef.current)) {
      return;
    }
    if (isValidViewer() && !isSuspendedRef.current && onSceneChange) {
      let cameraState: StringifiedCameraState | null = null;
      withCamera((camera) => {
        cameraState = encodeCesiumCamera(camera);
      });
      if (cameraState === null) {
        return;
      }
      const hashParams = toHashParams(cameraState, {
        isSecondaryStyle,
        isSuspended: isSuspendedRef.current,
      });
      hashParams.zoom = "";
      onSceneChange({ hashParams });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isSuspendedRef,
    withCamera,
    isSecondaryStyle,
    onSceneChange,
    transitionStateRef,
  ]);

  useEffect(() => {
    // update hash hook
    if (isTransitionState(transitionStateRef.current)) {
      return;
    }

    if (isValidViewer()) {
      console.debug(
        "HOOK: [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to update hash"
      );
      const moveEndListener = async () => {
        // let TopicMap/leaflet handle the view change in 2d Mode
        let proceed = false;
        let camDeg: Required<LatLng.deg> | undefined;
        withCamera((camera) => {
          proceed = Boolean(
            camera && camera.position && !isSuspendedRef.current
          );
          if (proceed) {
            camDeg = cameraToCartographicDegrees(camera);
          }
        });
        if (proceed && camDeg) {
          console.debug(
            "LISTENER: Cesium moveEndListener encode viewer to hash",
            isSecondaryStyle,
            camDeg
          );

          if (onSceneChange) {
            let cameraState: StringifiedCameraState | null = null;
            withCamera((camera) => {
              cameraState = encodeCesiumCamera(camera);
            });
            if (cameraState === null) {
              return;
            }
            const hashParams = toHashParams(cameraState, {
              isSecondaryStyle,
              isSuspended: isSuspendedRef.current,
            });
            onSceneChange({ hashParams });
          } else {
            console.info("HOOK: [NOOP] no onSceneChange callback");
          }
        }
      };
      withCamera((camera) => {
        camera.moveEnd.addEventListener(moveEndListener);
      });
      return () => {
        // clear hash on unmount
        // onSceneChange?.({ hashParams: clear3dOnlyHashParams });
        withCamera((camera) => {
          camera.moveEnd.removeEventListener(moveEndListener);
        });
      };
    }
    // transitionStateRef is intentionally not in deps - we check its value inside the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    withCamera,
    isValidViewer,
    isSecondaryStyle,
    isSuspendedRef,
    onSceneChange,
  ]);
};

export default useOnSceneChange;
