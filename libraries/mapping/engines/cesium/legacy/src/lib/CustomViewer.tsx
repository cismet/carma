import { type RefObject, useMemo } from "react";
import { Color, Viewer, Rectangle, Cartographic } from "cesium";
import { merge } from "lodash";

import {
  CesiumErrorHandler,
  type CesiumErrorHandlerOptions,
} from "./CesiumErrorHandler";

import useCameraRollSoftLimiter from "./hooks/useCameraRollSoftLimiter";
import useCameraPitchEasingLimiter from "./hooks/useCameraPitchEasingLimiter";
import useCameraPitchSoftLimiter from "./hooks/useCameraPitchSoftLimiter";
import useDisableSSCC from "./hooks/useDisableSSCC";
import { useCesiumGlobe } from "./hooks/useCesiumGlobe";
import { useInitializeViewer } from "./hooks/useInitializeViewer";
import { useOnSceneChange } from "./hooks/useOnSceneChange";
import useTransitionTimeout from "./hooks/useTransitionTimeout";
import { useTilesets } from "./hooks/useTilesets";
import { useSceneStyles } from "./hooks/useSceneStyles";
import { StringifiedCameraState } from "./utils/cesiumHashParamsCodec";
import { DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS } from "./viewerDefaults";

export type GlobeOptions = {
  // https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
  baseColor?: Color;
  cartographicLimitRectangle?: Rectangle;
  showGroundAtmosphere?: boolean;
  showSkirts?: boolean;
};

export type CameraLimiterOptions = {
  pitchLimiter?: boolean;
  minPitch?: number;
  minPitchRange?: number;
};

export type InitialCameraView = {
  position?: Cartographic;
  heading?: number;
  pitch?: number;
  fov?: number;
};

export type CustomViewerProps = {
  containerRef: RefObject<HTMLDivElement>;
  cameraLimiterOptions?: CameraLimiterOptions;
  initialCameraView?: InitialCameraView;
  constructorOptions?: Viewer.ConstructorOptions;
  globeOptions?: GlobeOptions;
  // callbacks
  onSceneChange?: (
    e: { hashParams: Record<string, string> },
    viewer?: Viewer,
    cesiumCameraState?: StringifiedCameraState | null,
    isSecondaryStyle?: boolean
  ) => void;
  postInit?: () => void;
  enableSceneStyles?: boolean;
  // debug/error handling wiring
  errorHandlerOptions?: CesiumErrorHandlerOptions;
};

const CustomViewerComponent = (props: CustomViewerProps) => {
  const {
    globeOptions = {
      baseColor: Color.TRANSPARENT,
      cartographicLimitRectangle: undefined,
      showGroundAtmosphere: false,
      showSkirts: false,
    },
    cameraLimiterOptions,
    initialCameraView,
    constructorOptions,
    containerRef,
    onSceneChange,
    enableSceneStyles = true,
  } = props;

  const options: Viewer.ConstructorOptions = useMemo(
    () => merge({}, DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS, constructorOptions),
    [constructorOptions]
  );

  useInitializeViewer(containerRef, options, initialCameraView);
  useCesiumGlobe(globeOptions);

  useTransitionTimeout();

  // camera enhancements
  useDisableSSCC();
  useCameraRollSoftLimiter(cameraLimiterOptions);
  useCameraPitchSoftLimiter(cameraLimiterOptions);
  useCameraPitchEasingLimiter(cameraLimiterOptions);

  // useCesiumWhenHidden hook removed - Cesium is always active now

  useTilesets();
  useSceneStyles(enableSceneStyles);

  // callback
  useOnSceneChange(onSceneChange);

  return (
    <>
      <CesiumErrorHandler {...(props.errorHandlerOptions || {})} />
    </>
  );
};

export const CustomViewer = CustomViewerComponent;

export default CustomViewer;
