import { type RefObject, useMemo } from "react";
import { Color, Viewer, Rectangle, SceneMode } from "cesium";

import ElevationControl from "./components/controls/ElevationControl";

import useCameraRollSoftLimiter from "./hooks/useCameraRollSoftLimiter";
import useCameraPitchEasingLimiter from "./hooks/useCameraPitchEasingLimiter";
import useCameraPitchSoftLimiter from "./hooks/useCameraPitchSoftLimiter";
import useDisableSSCC from "./hooks/useDisableSSCC";
import { useCesiumGlobe } from "./hooks/useCesiumGlobe";
import { useCesiumWhenHidden } from "./hooks/useCesiumWhenHidden";
import { useInitializeViewer } from "./hooks/useInitializeViewer";
import { useLogCesiumRenderIn2D } from "./hooks/useLogCesiumRenderIn2D";
import { useOnSceneChange } from "./hooks/useOnSceneChange";
import useTransitionTimeout from "./hooks/useTransitionTimeout";
import useTweakpane from "./hooks/useTweakpane";
import { useTilesets } from "./hooks/useTilesets";
import { useSceneStyles } from "./hooks/useSceneStyles";
import { EncodedSceneParams } from "..";

export type GlobeOptions = {
  // https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
  baseColor?: Color;
  cartographicLimitRectangle?: Rectangle;
  showGroundAtmosphere?: boolean;
  showSkirts?: boolean;
};

export type CustomViewerProps = {
  containerRef: RefObject<HTMLDivElement>;
  cameraOptions?: {
    minPitch?: number;
    minPitchRange?: number;
  };
  constructorOptions?: Viewer.ConstructorOptions;
  globeOptions?: GlobeOptions;
  // callbacks
  onSceneChange?: (encodedScene: EncodedSceneParams) => void;
  postInit?: () => void;
};

export const TRANSITION_DELAY = 1000;
const CESIUM_TARGET_FRAME_RATE = 120;

const DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS: Viewer.ConstructorOptions = {
  msaaSamples: 4,
  requestRenderMode: true,

  scene3DOnly: true,
  sceneMode: SceneMode.SCENE3D,
  selectionIndicator: false,
  targetFrameRate: CESIUM_TARGET_FRAME_RATE,
  useBrowserRecommendedResolution: true,
  contextOptions: { webgl: { alpha: true } },

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
    cameraOptions,
    constructorOptions,
    containerRef,
    onSceneChange,
  } = props;

  const options: Viewer.ConstructorOptions = useMemo(
    () => ({
      ...DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS,
      ...constructorOptions,
    }),
    [constructorOptions]
  );

  useInitializeViewer(containerRef, options);
  useCesiumGlobe(globeOptions);

  useTransitionTimeout();

  // camera enhancements
  useDisableSSCC();
  useCameraRollSoftLimiter();
  useCameraPitchSoftLimiter();
  useCameraPitchEasingLimiter(
    cameraOptions?.minPitch,
    cameraOptions?.minPitchRange
  );

  useCesiumWhenHidden(TRANSITION_DELAY);

  useTilesets();
  useSceneStyles();

  // callback
  useOnSceneChange(onSceneChange);

  // optional
  useTweakpane();
  useLogCesiumRenderIn2D();

  return <ElevationControl show={false} />;
}

export default CustomViewer;
