import { useEffect } from "react";

import { Camera, CesiumMath, PerspectiveFrustum } from "@carma-cesium";

import type { CesiumRuntime } from "../CesiumContext";
import { CESIUM_RUNTIME_STATE_KEYS } from "../runtime-state-keys";
import { useCesiumContext } from "./useCesiumContext";
type HashParamEncoder = {
  key: string;
  encode: (value: number) => string;
};

export type StringifiedCameraState = { key: string; value: string }[];

const DEGREE_DIGITS = 7;
const CAMERA_DEGREE_DIGITS = 2;

const formatRadians = (value: number, fixed = DEGREE_DIGITS): string =>
  parseFloat(CesiumMath.toDegrees(value).toFixed(fixed)).toString();

const cameraHashParamEncoders: Record<string, HashParamEncoder> = {
  longitude: {
    key: "lng",
    encode: (value: number) => formatRadians(value),
  },
  latitude: {
    key: "lat",
    encode: (value: number) => formatRadians(value),
  },
  height: {
    key: "h",
    encode: (value: number) => parseFloat(value.toFixed(2)).toString(),
  },
  heading: {
    key: "heading",
    encode: (value: number) =>
      formatRadians(CesiumMath.zeroToTwoPi(value), CAMERA_DEGREE_DIGITS),
  },
  pitch: {
    key: "pitch",
    encode: (value: number) =>
      formatRadians(CesiumMath.zeroToTwoPi(value), CAMERA_DEGREE_DIGITS),
  },
  fov: {
    key: "fov",
    encode: (value: number) => formatRadians(value, CAMERA_DEGREE_DIGITS),
  },
};

const isNumber = (value: unknown): value is number =>
  value !== undefined &&
  value !== null &&
  !isNaN(Number(value)) &&
  isFinite(Number(value));

const encodeCesiumCamera = (camera: Camera): StringifiedCameraState => {
  const { positionCartographic, pitch, heading, frustum } = camera;
  const { longitude, latitude, height } = positionCartographic;
  const fov = frustum instanceof PerspectiveFrustum ? frustum.fov : undefined;

  const orderedParams: [number | undefined, HashParamEncoder][] = [
    [longitude, cameraHashParamEncoders.longitude],
    [latitude, cameraHashParamEncoders.latitude],
    [height, cameraHashParamEncoders.height],
    [heading, cameraHashParamEncoders.heading],
    [pitch, cameraHashParamEncoders.pitch],
    [fov, cameraHashParamEncoders.fov],
  ];

  return orderedParams
    .filter(([numberValue]) => isNumber(numberValue))
    .map(([numberValue, codec]) => ({
      key: codec.key,
      value: codec.encode(numberValue as number),
    }));
};

const toHashParams = (
  cesiumCameraState: StringifiedCameraState,
  args: { currentSceneStyle?: string; isCesiumActive: boolean }
) => {
  const runtimeState: Record<string, string> = {
    [CESIUM_RUNTIME_STATE_KEYS.is3d]: args.isCesiumActive ? "1" : "0",
  };

  if (args.currentSceneStyle) {
    runtimeState[CESIUM_RUNTIME_STATE_KEYS.mapStyle] = args.currentSceneStyle;
  }

  const hashParams = cesiumCameraState.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, runtimeState);

  return hashParams;
};

export const useOnSceneChange = (
  onSceneChange?: (
    e: { hashParams: Record<string, string> },
    runtime?: CesiumRuntime,
    cesiumCameraState?: StringifiedCameraState | null
  ) => void,
  isCesiumActive: boolean = true
) => {
  const ctx = useCesiumContext();
  const { currentSceneStyle, isTransitioning } = ctx;

  // todo consider declaring changed part of state in the callback, not full state only

  useEffect(() => {
    // on changes to mode or style
    if (!onSceneChange || isTransitioning) {
      return;
    }
    if (ctx.isValidRuntime() && isCesiumActive) {
      console.debug(
        "HOOK: update Hash, route or style changed",
        currentSceneStyle
      );
      let cameraState: StringifiedCameraState | null = null;
      ctx.withCamera((camera) => {
        cameraState = encodeCesiumCamera(camera);
      });
      if (cameraState === null) {
        return;
      }
      const hashParams = toHashParams(cameraState, {
        currentSceneStyle,
        isCesiumActive,
      });
      hashParams.zoom = "";
      onSceneChange({ hashParams });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, isCesiumActive, currentSceneStyle, isTransitioning]);

  useEffect(() => {
    // update hash hook
    if (!onSceneChange || isTransitioning) {
      return;
    }

    if (ctx.isValidRuntime()) {
      console.debug(
        "HOOK: [2D3D|CESIUM] runtime changed add new Cesium MoveEnd Listener to update hash"
      );
      const moveEndListener = async () => {
        // let TopicMap/leaflet handle the view change in 2d Mode
        let camera: Camera | null = null;
        ctx.withCamera((c) => {
          camera = c;
        });

        if (camera && isCesiumActive) {
          console.debug(
            "LISTENER: Cesium moveEndListener encode runtime to hash",
            currentSceneStyle
          );

          let cameraState: StringifiedCameraState | null = null;
          cameraState = encodeCesiumCamera(camera);
          if (cameraState === null) {
            return;
          }
          const hashParams = toHashParams(cameraState, {
            currentSceneStyle,
            isCesiumActive,
          });
          onSceneChange({ hashParams });
        }
      };
      ctx.withCamera((camera) => {
        camera.moveEnd.addEventListener(moveEndListener);
      });
      return () => {
        // clear hash on unmount
        // onSceneChange?.({ hashParams: clearCesiumOnlyHashParams });
        ctx.withCamera((camera) => {
          camera.moveEnd.removeEventListener(moveEndListener);
        });
      };
    }
  }, [ctx, currentSceneStyle, isCesiumActive, onSceneChange, isTransitioning]);
};

export default useOnSceneChange;
