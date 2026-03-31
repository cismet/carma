import { type RefObject, useMemo } from "react";

import {
  Color,
  Viewer,
  Rectangle,
  Cartesian3,
  type Cartographic,
} from "cesium";
import { merge } from "lodash";

import {
  CesiumErrorHandler,
  type CesiumErrorHandlerOptions,
} from "./CesiumErrorHandler";
import useCameraPitchEasingLimiter from "./hooks/useCameraPitchEasingLimiter";
import useCameraPitchSoftLimiter from "./hooks/useCameraPitchSoftLimiter";
import useCameraRollSoftLimiter from "./hooks/useCameraRollSoftLimiter";
import { useCesiumGlobe } from "./hooks/useCesiumGlobe";
import useDisableSSCC from "./hooks/useDisableSSCC";
import { useInitializeViewer } from "./hooks/useInitializeViewer";
import {
  useOnSceneChange,
  type StringifiedCameraState,
} from "./hooks/useOnSceneChange";
import { useSceneStyles } from "./hooks/useSceneStyles";
import { useTilesets } from "./hooks/useTilesets";
import useTransitionTimeout from "./hooks/useTransitionTimeout";
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
  anchor?: Cartographic;
  zoom?: number;
  direction?: Cartesian3;
  up?: Cartesian3;
  fov?: number | null;
  fovLongerEdge?: number | null;
};

export type CustomViewerProps = {
  containerRef: RefObject<HTMLDivElement>;
  cameraLimiterOptions?: CameraLimiterOptions;
  initialCameraView?: InitialCameraView | null;
  homeValidationCenter?: Cartesian3 | null;
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
    homeValidationCenter,
    constructorOptions,
    containerRef,
    onSceneChange,
    enableSceneStyles = true,
  } = props;

  const options: Viewer.ConstructorOptions = useMemo(
    () => merge({}, DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS, constructorOptions),
    [constructorOptions]
  );

  useInitializeViewer(
    containerRef,
    options,
    initialCameraView,
    homeValidationCenter
  );
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
