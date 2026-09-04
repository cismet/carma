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
    showMapStyleContent: true,
    showMapStyleLabels: true,
    useTransmittanceLut: true,
    useSkyIrradianceLut: true,
  };
};
