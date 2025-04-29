import { type RefObject, useMemo } from "react";
import { Color, Viewer, Rectangle, SceneMode, Cartographic } from "cesium";
import UAParser from "ua-parser-js";
import { merge } from "lodash";

import ElevationControl from "./components/controls/ElevationControl";
import { CesiumErrorToErrorBoundaryForwarder } from "./utils/CesiumErrorToErrorBoundaryForwarder";

import useCameraRollSoftLimiter from "./hooks/useCameraRollSoftLimiter";
import useCameraPitchEasingLimiter from "./hooks/useCameraPitchEasingLimiter";
import useCameraPitchSoftLimiter from "./hooks/useCameraPitchSoftLimiter";
import useDisableSSCC from "./hooks/useDisableSSCC";
import { useCesiumGlobe } from "./hooks/useCesiumGlobe";
import { useCesiumWhenHidden } from "./hooks/useCesiumWhenHidden";
import { useInitializeViewer } from "./hooks/useInitializeViewer";
import { useOnSceneChange } from "./hooks/useOnSceneChange";
import useTransitionTimeout from "./hooks/useTransitionTimeout";
import useTweakpane from "./hooks/useTweakpane";
import { useTilesets } from "./hooks/useTilesets";
import { useSceneStyles } from "./hooks/useSceneStyles";
import { StringifiedCameraState } from "./utils/cesiumHashParamsCodec";

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
    isSecondaryStyle?: boolean,
    isMode2d?: boolean
  ) => void;
  postInit?: () => void;
  enableSceneStyles?: boolean;
};

export const TRANSITION_DELAY = 1000;
const CESIUM_TARGET_FRAME_RATE = 120;
const isMobile = new UAParser().getDevice().type === "mobile";

export const DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS: Viewer.ConstructorOptions = {
  msaaSamples: 4,
  requestRenderMode: true,

  scene3DOnly: true,
  sceneMode: SceneMode.SCENE3D,
  selectionIndicator: false,
  targetFrameRate: CESIUM_TARGET_FRAME_RATE,
  useBrowserRecommendedResolution: true,
  contextOptions: {
    webgl: {
      alpha: true,
      powerPreference: isMobile ? "default" : "high-performance",
    },
  },

  // Hide UI components
  animation: false,
  baseLayer: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  navigationHelpButton: false,
  navigationInstructionsInitiallyVisible: false,
  sceneModePicker: false,
  skyBox: false,
  timeline: false,
};

export function CustomViewer(props: CustomViewerProps) {
  console.debug("RENDER: [CESIUM] CustomViewer");

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

  useCesiumWhenHidden(TRANSITION_DELAY);

  useTilesets();
  useSceneStyles(enableSceneStyles);

  // callback
  useOnSceneChange(onSceneChange);

  // optional
  useTweakpane();

  return (
    <>
      <CesiumErrorToErrorBoundaryForwarder />
      <ElevationControl show={false} />
    </>
  );
}

export default CustomViewer;
