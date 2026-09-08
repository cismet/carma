import {
  SHADOW_ANIMATION_MODE,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";

export const resetShadowSimulationState = (
  state: ShadowSimulationState
): ShadowSimulationState => {
  return {
    ...state,
    animationMode: SHADOW_ANIMATION_MODE.DAY,
    animationSpeed: 4,
    isAnimating: false,
    shadowIntensity: 1,
    showSunDebugVector: false,
    showTileBounds: false,
    showProjectionDebugView: false,
    showDisplaySettings: false,
    showMapStyleContent: true,
    showMapStyleLabels: true,
    showMapStyleElevationLines: false,
    showMapStyleElevationLabels: false,
    useTransmittanceLut: true,
    useSkyIrradianceLut: true,
    shadowBufferLayout: undefined,
    shadowBufferFormat: undefined,
    shadowSunDiscSamples: undefined,
    shadowMsaaSamples: undefined,
    shadowGroundTexelFit: undefined,
    shadowAdaptiveQuality: undefined,
  };
};
