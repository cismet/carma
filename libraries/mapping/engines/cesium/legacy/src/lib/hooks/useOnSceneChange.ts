import { useEffect } from "react";
import { useSelector } from "react-redux";

import {
  Camera,
  Math as CesiumMath,
  PerspectiveFrustum,
  type Viewer,
} from "cesium";

import { VIEWERSTATE_KEYS } from "../constants";
import {
  selectShowSecondaryTileset,
  selectViewerIsTransitioning,
} from "../slices/cesium";
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
    if (!onSceneChange || isTransitioning) {
      return;
    }
    if (ctx.isValidViewer() && isCesiumActive) {
      console.debug(
        "HOOK: update Hash, route or style changed",
        isSecondaryStyle
      );
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, isCesiumActive, isSecondaryStyle, isTransitioning]);

  useEffect(() => {
    // update hash hook
    if (!onSceneChange || isTransitioning) {
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
